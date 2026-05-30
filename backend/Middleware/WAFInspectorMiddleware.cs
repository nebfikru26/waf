using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.EntityFrameworkCore;
using System;
using System.IO;
using System.Linq;
using System.Net;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using AffiniSecurity.Waf.Data;
using AffiniSecurity.Waf.Models;

namespace AffiniSecurity.Waf.Middleware
{
    public class WAFInspectorMiddleware
    {
        private readonly RequestDelegate _next;
        private readonly IServiceScopeFactory _scopeFactory;

        public WAFInspectorMiddleware(RequestDelegate next, IServiceScopeFactory scopeFactory)
        {
            _next = next;
            _scopeFactory = scopeFactory;
        }

        public async Task InvokeAsync(HttpContext context)
        {
            var path = context.Request.Path.Value ?? string.Empty;
            Console.WriteLine($"[WAF] Inspecting: {context.Request.Method} {path}");
            
            try 
            {
                var rawQuery = context.Request.QueryString.Value ?? string.Empty;
                var query = WebUtility.UrlDecode(rawQuery);
                

                // Enable buffering to allow reading the body multiple times
                context.Request.EnableBuffering();
                var body = "";
                if (context.Request.ContentLength > 0)
                {
                    using (var reader = new StreamReader(context.Request.Body, System.Text.Encoding.UTF8, true, 1024, true))
                    {
                        body = await reader.ReadToEndAsync();
                        context.Request.Body.Position = 0; // Reset for next middleware
                    }
                }

                string? violation = null;
                // 1. Check XSS (Most specific)
                if (Regex.IsMatch(query, @"(?i)(<script|javascript:|onerror=|alert\(|confirm\(|prompt\()") || Regex.IsMatch(body, @"(?i)(<script|javascript:|onerror=|alert\(|confirm\(|prompt\()"))
                    violation = "XSS Detected";
                // 2. Check OS Command Injection
                else if (Regex.IsMatch(query, @"(?i)(;\s*ls|;\s*cat|;\s*rm|\|\s*ls|\|\s*cat|>\s*/dev/null|&\s*ls)") || Regex.IsMatch(body, @"(?i)(;\s*ls|;\s*cat|;\s*rm|\|\s*ls|\|\s*cat|>\s*/dev/null|&\s*ls)"))
                    violation = "OS Command Injection Detected";
                else if (Regex.IsMatch(path, @"(?i)(/\.env|/\.git|/wp-admin|/phpmyadmin|/config\.php)"))
                    violation = "Security Scanner Detected";
                // 3. Check Path Traversal
                else if (Regex.IsMatch(query, @"(?i)(\.\./|\.\.\\|/etc/passwd|/windows/system32|cmd\.exe|/bin/sh)") || Regex.IsMatch(body, @"(?i)(\.\./|\.\.\\|/etc/passwd|/windows/system32|cmd\.exe|/bin/sh)"))
                    violation = "Path Traversal Detected";
                // 4. Check SQLi
                else if (Regex.IsMatch(query, @"(?i)(union\s+select|select\s+.*\s+from|insert\s+into|update\s+.*\s+set|delete\s+from|drop\s+table|--|or\s+\d+=\d+|and\s+\d+=\d+|;\s*select|;\s*drop|;\s*insert)") || Regex.IsMatch(body, @"(?i)(union\s+select|select\s+.*\s+from|insert\s+into|update\s+.*\s+set|delete\s+from|drop\s+table|--|or\s+\d+=\d+|and\s+\d+=\d+|;\s*select|;\s*drop|;\s*insert)"))
                    violation = "SQL Injection Detected";
                // 5. Check API Abuse (matches common test cases like passing elevated roles or bypassing API keys)
                else if (path.StartsWith("/api/") && !path.StartsWith("/api/auth/") && !path.StartsWith("/api/analytics/"))
                {
                    if (Regex.IsMatch(query, @"(?i)(admin=true|role=admin|access=full)") || Regex.IsMatch(body, @"(?i)(""role""\s*:\s*""admin""|""isAdmin""\s*:\s*true|""access""\s*:\s*""full"")"))
                        violation = "API Privilege Escalation Detected";
                    else if (context.Request.Headers.ContainsKey("X-API-Key") && context.Request.Headers["X-API-Key"].ToString().Contains("DROP TABLE"))
                        violation = "API Key SQL Injection Detected";
                }

                // If a violation was found on an API route, tag it as an API threat so the dashboard counts it
                if (violation != null && path.StartsWith("/api/") && !path.StartsWith("/api/auth/") && !violation.StartsWith("API "))
                {
                    violation = "API " + violation;
                }

                if (violation != null)
                {
                    // 6. Assign Risk Points for the Predictive Engine
                    int points = 0;
                    if (violation.Contains("SQL Injection")) points = 60;
                    else if (violation.Contains("XSS")) points = 55;
                    else if (violation.Contains("Command Injection")) points = 65;
                    else if (violation.Contains("Path Traversal")) points = 50;
                    else if (violation.Contains("Scanner")) points = 30;
                    else if (violation.Contains("API")) points = 40;
                    
                    context.Items["RiskPoints"] = (context.Items.ContainsKey("RiskPoints") ? (int)context.Items["RiskPoints"] : 0) + points;

                    // For login endpoints, we might want to be less aggressive with SQLi because passwords can contain characters like '--' or "'"
                    if (path.Contains("/api/auth/") && violation == "SQL Injection Detected")
                    {
                        // Proceed but the RiskPoints are already set for the Scorer to decide later
                    }
                    else 
                    {
                        using var scope = _scopeFactory.CreateScope();
                        var db = scope.ServiceProvider.GetRequiredService<WafDbContext>();
                        
                        // Resolve Tenant and Subscription
                        string? tenantId = context.Items["TenantId"]?.ToString();
                        
                        if (string.IsNullOrEmpty(tenantId))
                        {
                            string host = context.Request.Host.Host;
                            var domain = await db.Domains.IgnoreQueryFilters().FirstOrDefaultAsync(d => d.DomainName.ToLower() == host.ToLower());
                            tenantId = domain?.TenantId ?? "eb880aa3-c981-419f-b0f4-4d9e511788dc"; // Default to test tenant
                        }
                        
                        var subscription = await db.Subscriptions.IgnoreQueryFilters().FirstOrDefaultAsync(s => s.TenantId == tenantId);
                        string planName = subscription?.PlanName ?? "Free";
                        var plan = await db.PlanConfigs.IgnoreQueryFilters().FirstOrDefaultAsync(p => p.Name == planName);
                        
                        // Check if specific rule is disabled or set to LOG by tenant
                        var ruleSetting = await db.OWASPRules.IgnoreQueryFilters()
                            .FirstOrDefaultAsync(r => r.TenantId == tenantId && violation.Contains(r.Name));

                        bool shouldBlock = true;
                        string actionTaken = "BLOCK";

                        // INDUSTRY BEST PRACTICE: Respect Subscription Tier and Rule Mode
                        if (plan != null && !plan.HasWafBlocking)
                        {
                            shouldBlock = false;
                            actionTaken = "LOG (Plan Restriction)";
                        }
                        else if (ruleSetting != null && ruleSetting.Action == "LOG")
                        {
                            shouldBlock = false;
                            actionTaken = "LOG (Policy Setting)";
                        }
                        else if (ruleSetting != null && ruleSetting.Action == "DISABLED")
                        {
                            await _next(context);
                            return;
                        }

                        await LogAttack(context, violation, tenantId, actionTaken);

                        if (shouldBlock)
                        {
                            Console.WriteLine($"[WAF] BLOCKING: {violation} from {context.Connection.RemoteIpAddress}");
                            context.Response.StatusCode = 403;
                            context.Response.ContentType = "application/json";
                            await context.Response.WriteAsync($"{{\"error\": \"WAF Blocked: {violation}\"}}");
                            return;
                        }
                        else
                        {
                            Console.WriteLine($"[WAF] DETECTED (LOG ONLY): {violation} from {context.Connection.RemoteIpAddress}");
                        }
                    }
                }

                await _next(context);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[WAF] Error: {ex.Message}");
                await _next(context);
            }
        }

        private async Task LogAttack(HttpContext context, string rule, string tenantId, string action)
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<WafDbContext>();
            
            // Determine Severity based on Rule
            string severity = "MEDIUM";
            if (rule.Contains("Command Injection") || rule.Contains("SQL Injection")) severity = "CRITICAL";
            else if (rule.Contains("XSS") || rule.Contains("Path Traversal")) severity = "HIGH";
            else if (rule.Contains("Bot")) severity = "MEDIUM";
            else if (rule.Contains("Scanner")) severity = "LOW";

            var alert = new AlertLog
            {
                Id = Guid.NewGuid().ToString(),
                Ip = context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                TenantId = tenantId,
                RuleId = "WAF-100",
                Rule = rule,
                Uri = context.Request.Path + context.Request.QueryString,
                Timestamp = DateTime.UtcNow.ToString("O"),
                Severity = severity,
                Action = action
            };

            db.AlertLogs.Add(alert);
            await db.SaveChangesAsync();
        }
    }
}

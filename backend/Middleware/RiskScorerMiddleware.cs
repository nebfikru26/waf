using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.EntityFrameworkCore;
using AffiniSecurity.Waf.Data;
using AffiniSecurity.Waf.Models;
using System;
using System.Linq;
using System.Threading.Tasks;

namespace AffiniSecurity.Waf.Middleware
{
    public class RiskScorerMiddleware
    {
        private readonly RequestDelegate _next;
        private readonly IServiceScopeFactory _scopeFactory;

        public RiskScorerMiddleware(RequestDelegate next, IServiceScopeFactory scopeFactory)
        {
            _next = next;
            _scopeFactory = scopeFactory;
        }

        public async Task InvokeAsync(HttpContext context)
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<WafDbContext>();

            // 1. Get Tenant and Configuration
            string? tenantId = context.Items["TenantId"]?.ToString();
            if (string.IsNullOrEmpty(tenantId))
            {
                tenantId = "eb880aa3-c981-419f-b0f4-4d9e511788dc"; // Default fallback
            }

            var thresholds = await db.RiskThresholds.IgnoreQueryFilters().FirstOrDefaultAsync(r => r.TenantId == tenantId) 
                             ?? new RiskThreshold();

            // 2. Accumulate Risk Score from Behavioral Signals
            int riskScore = 0;
            string primaryThreat = "Anomaly";
            string matchedPattern = "";

            // Signal: Points from WAF Inspector (SQLi, XSS, etc.)
            if (context.Items.TryGetValue("RiskPoints", out var points) && points is int p)
            {
                riskScore += p;
            }

            // Signal: User Agent Anomaly
            string userAgent = context.Request.Headers["User-Agent"].ToString();
            if (string.IsNullOrEmpty(userAgent))
            {
                riskScore += thresholds.WeightMissingUa;
                primaryThreat = "Missing_UA";
            }
            else if (userAgent.Contains("curl") || userAgent.Contains("python") || userAgent.Contains("Postman"))
            {
                riskScore += thresholds.WeightBotUa;
                primaryThreat = "Bot_UA";
                matchedPattern = userAgent;
            }

            // Cap risk score at 100
            riskScore = Math.Min(riskScore, 100);

            // 3. Determine Action based on Thresholds
            string action = "allow";
            if (riskScore >= thresholds.BlockThreshold) action = "block";
            else if (riskScore >= thresholds.ChallengeThreshold) action = "challenge";
            else if (riskScore >= thresholds.LogThreshold) action = "log";

            // 4. Log Risk Event if score is significant
            if (riskScore >= thresholds.LogThreshold)
            {
                var riskEvent = new RiskEvent
                {
                    Id = Guid.NewGuid().ToString(),
                    TenantId = tenantId,
                    ClientIp = context.Connection.RemoteIpAddress?.ToString() ?? "Unknown",
                    Method = context.Request.Method,
                    Path = context.Request.Path,
                    RiskScore = riskScore,
                    ThreatType = primaryThreat,
                    Action = action,
                    MatchedPattern = matchedPattern,
                    Timestamp = DateTime.UtcNow.ToString("O")
                };
                db.RiskEvents.Add(riskEvent);
                await db.SaveChangesAsync();
            }

            // 5. Enforce Action
            if (action == "block")
            {
                context.Response.StatusCode = 403;
                context.Response.ContentType = "application/json";
                await context.Response.WriteAsync($"{{\"error\": \"Blocked by Predictive Risk Engine. Score: {riskScore}\"}}");
                return;
            }
            // Challenge could trigger a redirect to a CAPTCHA page (placeholder logic)
            else if (action == "challenge")
            {
                context.Response.Headers["X-WAF-Risk-Challenge"] = "true";
            }

            await _next(context);
        }
    }
}

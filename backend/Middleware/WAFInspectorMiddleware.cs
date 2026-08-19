using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.EntityFrameworkCore;
using System;
using System.IO;
using System.Linq;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Web;
using AffiniSecurity.Waf.Data;
using AffiniSecurity.Waf.Models;
using AffiniSecurity.Waf.Services;
using System.Text.Json;

namespace AffiniSecurity.Waf.Middleware
{
    public class WAFInspectorMiddleware
    {
        private readonly RequestDelegate _next;
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly IRedisService _redis;

        // ─── Encoding-Normalisation Helpers ──────────────────────────────────────
        // Mirrors the Go sidecar's multiDecode() so that %3Cscript, &#x3C;script,
        // double/triple-encoded, null-byte, and Unicode fullwidth payloads are all
        // exposed to the regex patterns before they fire.

        /// <summary>
        /// Recursively URL-decodes then HTML-entity-decodes <paramref name="input"/>
        /// up to <paramref name="maxDepth"/> times, stopping at fixed-point.
        /// </summary>
        private static string MultiDecode(string input, int maxDepth = 5)
        {
            if (string.IsNullOrEmpty(input)) return input;
            var current = input;
            for (int i = 0; i < maxDepth; i++)
            {
                string urlDecoded;
                try { urlDecoded = WebUtility.UrlDecode(current); }
                catch { urlDecoded = current; }

                string entityDecoded;
                try { entityDecoded = HttpUtility.HtmlDecode(urlDecoded); }
                catch { entityDecoded = urlDecoded; }

                if (entityDecoded == current) break;
                current = entityDecoded;
            }
            return current;
        }

        /// <summary>
        /// Full normalisation pipeline applied to every inspected value:
        ///   1. Multi-layer URL + HTML entity decode (up to 5 passes).
        ///   2. Null-byte strip  — classic WAF bypass: \x00SELECT.
        ///   3. Unicode fullwidth collapse  — ＳＥＬＥＣＴ → SELECT.
        /// Returns original + decoded concatenated so regexes hit both forms.
        /// </summary>
        private static string NormalizeForInspection(string raw)
        {
            if (string.IsNullOrEmpty(raw)) return raw;

            var decoded = MultiDecode(raw);

            // Strip null bytes
            decoded = decoded.Replace("\0", "");

            // Collapse Unicode fullwidth ASCII (U+FF01–U+FF5E → U+0021–U+007E)
            var sb = new StringBuilder(decoded.Length);
            foreach (char c in decoded)
                sb.Append(c >= '\uFF01' && c <= '\uFF5E' ? (char)(c - 0xFEE0) : c);
            decoded = sb.ToString();

            // Concatenate both so regexes match the original AND decoded form
            return raw == decoded ? raw : raw + " " + decoded;
        }

        public WAFInspectorMiddleware(RequestDelegate next, IServiceScopeFactory scopeFactory, IRedisService redis)
        {
            _next = next;
            _scopeFactory = scopeFactory;
            _redis = redis;
        }

        public async Task InvokeAsync(HttpContext context)
        {
            var path = context.Request.Path.Value ?? string.Empty;
            if (path.StartsWith("/api/internal/", StringComparison.OrdinalIgnoreCase))
            {
                await _next(context);
                return;
            }

            Console.WriteLine($"[WAF] Inspecting: {context.Request.Method} {path}");
            
            try 
            {
                // ── Step 1: Read raw inputs ───────────────────────────────────────────
                var rawQuery = context.Request.QueryString.Value ?? string.Empty;
                var rawPath  = context.Request.Path.Value ?? string.Empty;

                // Enable buffering to allow reading the body multiple times
                context.Request.EnableBuffering();
                var rawBody = "";
                if (context.Request.ContentLength > 0 || context.Request.Headers.ContainsKey("Transfer-Encoding"))
                {
                    using (var reader = new StreamReader(context.Request.Body, System.Text.Encoding.UTF8, true, 1024, true))
                    {
                        rawBody = await reader.ReadToEndAsync();
                        context.Request.Body.Position = 0; // Reset for next middleware
                    }
                }

                // ── Step 2: Normalise — multi-layer decode + null-byte + fullwidth ────
                // This closes the encoding-evasion bypass identified in the audit:
                //   %3Cscript         → <script          (1 URL pass)
                //   %253Cscript       → %3Cscript → <script  (2 URL passes)
                //   &#x3C;script      → <script          (HTML entity pass)
                //   \x00SELECT        → SELECT            (null-byte strip)
                //   ＳＥＬＥＣＴ        → SELECT            (Unicode fullwidth)
                var query       = NormalizeForInspection(rawQuery);
                var body        = NormalizeForInspection(rawBody);
                var inspectPath = NormalizeForInspection(rawPath);

                string? violation = null;
                
                // ──────────────────────────────────────────────────────────
                // IOC CHECK 1: Source IP Cache-Aside Lookup
                // ──────────────────────────────────────────────────────────
                var clientIpStr = context.Connection.RemoteIpAddress?.ToString();
                if (!string.IsNullOrEmpty(clientIpStr) && clientIpStr != "::1" && clientIpStr != "127.0.0.1")
                {
                    var (ipPoints, ipViolation) = await CheckIocCacheAsync(clientIpStr, "all");
                    if (ipViolation != null)
                    {
                        context.Items["RiskPoints"] = (context.Items.ContainsKey("RiskPoints") ? (int)context.Items["RiskPoints"] : 0) + ipPoints;
                        Console.WriteLine($"[WAF-IOC] Cache Hit: Source IP {clientIpStr} matched — +{ipPoints} risk points");
                        violation = ipViolation;
                    }
                }

                // ──────────────────────────────────────────────────────────
                // IOC CHECK 2: CVE probe detection — CISA KEV
                // ──────────────────────────────────────────────────────────
                var cvePattern = new System.Text.RegularExpressions.Regex(@"CVE-\d{4}-\d{4,7}", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
                var cveMatches = cvePattern.Matches(query + " " + body + " " + inspectPath);
                if (cveMatches.Count > 0)
                {
                    foreach (System.Text.RegularExpressions.Match cveId in cveMatches)
                    {
                        var (cvePoints, cveViolation) = await CheckIocCacheAsync(cveId.Value.ToUpper(), "all", "CISA-KEV");
                        if (cveViolation != null)
                        {
                            context.Items["RiskPoints"] = (context.Items.ContainsKey("RiskPoints") ? (int)context.Items["RiskPoints"] : 0) + cvePoints;
                            Console.WriteLine($"[WAF-IOC] Cache Hit: CVE {cveId.Value} matched — +{cvePoints} risk points");
                            violation = cveViolation;
                            break;
                        }
                    }
                }

                // ──────────────────────────────────────────────────────────
                // IOC CHECK 3: File hash detection — MalwareBazaar
                // ──────────────────────────────────────────────────────────
                if (!string.IsNullOrEmpty(body) && body.Length >= 32)
                {
                    var hashPattern = new System.Text.RegularExpressions.Regex(@"\b([a-fA-F0-9]{64}|[a-fA-F0-9]{40}|[a-fA-F0-9]{32})\b");
                    var hashMatches = hashPattern.Matches(body);
                    if (hashMatches.Count > 0)
                    {
                        foreach (System.Text.RegularExpressions.Match hashVal in hashMatches)
                        {
                            var (hashPoints, hashViolation) = await CheckIocCacheAsync(hashVal.Value.ToLower(), "all", "MalwareBazaar");
                            if (hashViolation != null)
                            {
                                context.Items["RiskPoints"] = (context.Items.ContainsKey("RiskPoints") ? (int)context.Items["RiskPoints"] : 0) + hashPoints;
                                Console.WriteLine($"[WAF-IOC] Cache Hit: Hash {hashVal.Value[..12]}... matched — +{hashPoints} risk points");
                                violation = hashViolation;
                                break;
                            }
                        }
                    }
                }

                // ──────────────────────────────────────────────────────────
                // IOC CHECK 4: URL cross-referencing — URLhaus
                // ──────────────────────────────────────────────────────────
                var urlSources = new System.Collections.Generic.List<string>();
                // Use rawBody for URL IOC lookup — DB entries store exact original URLs
                if (!string.IsNullOrEmpty(rawBody)) urlSources.Add(rawBody);
                if (context.Request.Headers.TryGetValue("Referer", out var referer)) urlSources.Add(referer.ToString());
                var urlPattern = new System.Text.RegularExpressions.Regex(@"https?://[^\s""'<>]+", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
                foreach (var src in urlSources)
                {
                    var urlMatches = urlPattern.Matches(src);
                    if (urlMatches.Count > 0)
                    {
                        foreach (System.Text.RegularExpressions.Match urlVal in urlMatches)
                        {
                            var cleanUrl = urlVal.Value.TrimEnd(',', '.', ';');
                            var (urlPoints, urlViolation) = await CheckIocCacheAsync(cleanUrl, "all", "URLhaus");
                            if (urlViolation != null)
                            {
                                context.Items["RiskPoints"] = (context.Items.ContainsKey("RiskPoints") ? (int)context.Items["RiskPoints"] : 0) + urlPoints;
                                Console.WriteLine($"[WAF-IOC] Cache Hit: URL matched — +{urlPoints} risk points");
                                violation = urlViolation;
                                break;
                            }
                        }
                        if (violation != null && violation.Contains("URLhaus")) break;
                    }
                }

                // ──────────────────────────────────────────────────────────
                // SECURITY: Outbound C2 Callback & Behavioral Analysis
                // ──────────────────────────────────────────────────────────
                if (context.Request.Headers.ContainsKey("X-C2-Payload") || 
                    context.Request.Headers.ContainsKey("C2-Authorization") ||
                    (context.Request.Headers.ContainsKey("User-Agent") && context.Request.Headers["User-Agent"].ToString().Contains("CobaltStrike")))
                {
                    violation = "Command & Control (C2) Pattern Detected";
                    context.Items["RiskPoints"] = (context.Items.ContainsKey("RiskPoints") ? (int)context.Items["RiskPoints"] : 0) + 85;
                }
                else if (!string.IsNullOrEmpty(body) && (body.Contains("beacon_interval") || body.Contains("callback_url") || body.Contains("{\"action\":\"heartbeat\"")))
                {
                    violation = "Behavioral C2 Beaconing Detected";
                    context.Items["RiskPoints"] = (context.Items.ContainsKey("RiskPoints") ? (int)context.Items["RiskPoints"] : 0) + 70;
                }

                // ─── Detection — inputs are pre-normalised (multi-decoded) ─────────────
                // Patterns catch: plain, URL-encoded, HTML-entity, double-encoded,
                // null-byte-prefixed, and Unicode fullwidth variants of each attack.

                // 1. XSS — covers SVG/data-uri/vbscript vectors and event‐handler attrs
                if (Regex.IsMatch(query, @"(?i)(<script|javascript:|vbscript:|data:\s*text/html|onerror\s*=|onload\s*=|onclick\s*=|alert\s*\(|confirm\s*\(|prompt\s*\(|<iframe|<object|<embed)") ||
                    Regex.IsMatch(body,  @"(?i)(<script|javascript:|vbscript:|data:\s*text/html|onerror\s*=|onload\s*=|onclick\s*=|alert\s*\(|confirm\s*\(|prompt\s*\(|<iframe|<object|<embed)"))
                    violation = "XSS Detected";

                // 2. OS Command Injection — pipe variants, backtick execution, $() sub-shell
                else if (Regex.IsMatch(query, @"(?i)(;\s*(ls|cat|rm|wget|curl|bash|sh|python|perl)|\|\s*(ls|cat|id|whoami|nc)|`[^`]+`|>\s*/dev/null|\$\(|\$\{IFS\})") ||
                         Regex.IsMatch(body,  @"(?i)(;\s*(ls|cat|rm|wget|curl|bash|sh|python|perl)|\|\s*(ls|cat|id|whoami|nc)|`[^`]+`|>\s*/dev/null|\$\(|\$\{IFS\})"))
                    violation = "OS Command Injection Detected";

                // 3. Security Scanner paths — checked on the normalised path
                else if (Regex.IsMatch(inspectPath, @"(?i)(/\.env|/\.git|/wp-admin|/phpmyadmin|/config\.php|/\.aws|/\.ssh|/etc/passwd|xmlrpc\.php)"))
                    violation = "Security Scanner Detected";

                // 4. Path Traversal — both slash styles, URL-encoded dots
                else if (Regex.IsMatch(query, @"(?i)(\.\.(/|\\|%2[Ff])|/etc/(passwd|shadow|hosts)|/windows/system32|cmd\.exe|/bin/(sh|bash))") ||
                         Regex.IsMatch(body,  @"(?i)(\.\.(/|\\|%2[Ff])|/etc/(passwd|shadow|hosts)|/windows/system32|cmd\.exe|/bin/(sh|bash))"))
                    violation = "Path Traversal Detected";

                // 5. SQL Injection — expanded with MSSQL/Oracle constructs and tautology
                else if (Regex.IsMatch(query, @"(?i)(union\s+(all\s+)?select|select\s+.{0,60}\s+from|insert\s+into|update\s+.{0,40}\s+set|delete\s+from|drop\s+(table|database)|exec(ute)?\s*\(|xp_cmdshell|information_schema|--|\bor\b.{0,20}=.{0,20}|\band\b.{0,20}=.{0,20}|;\s*(select|drop|insert|update|delete))") ||
                         Regex.IsMatch(body,  @"(?i)(union\s+(all\s+)?select|select\s+.{0,60}\s+from|insert\s+into|update\s+.{0,40}\s+set|delete\s+from|drop\s+(table|database)|exec(ute)?\s*\(|xp_cmdshell|information_schema|--|\bor\b.{0,20}=.{0,20}|\band\b.{0,20}=.{0,20}|;\s*(select|drop|insert|update|delete))"))
                    violation = "SQL Injection Detected";

                // 6. SSRF — cloud metadata, loopback probing, and internal-scheme routing
                else if (Regex.IsMatch(query, @"(?i)(169\.254\.169\.254|metadata\.google\.internal|127\.0\.0\.1|localhost|\[::1\]|file://|dict://|gopher://)") ||
                         Regex.IsMatch(body,  @"(?i)(169\.254\.169\.254|metadata\.google\.internal|127\.0\.0\.1|localhost|\[::1\]|file://|dict://|gopher://)"))
                    violation = "SSRF Detected";

                // 6.5. XXE — detect XML External Entity definitions
                else if (Regex.IsMatch(body, @"(?i)(<!ENTITY\s+[^>]+(SYSTEM|PUBLIC)\s+['""])") ||
                         Regex.IsMatch(body, @"(?i)(<\?xml[^>]+(?:<!DOCTYPE[^>]+>)?)"))
                {
                    // Secondary check: verify it's trying to load external resources
                    if (Regex.IsMatch(body, @"(?i)(SYSTEM|PUBLIC)\s*['""](?:file|http|https|ftp|gopher)://"))
                        violation = "XXE Injection Detected";
                }

                // 6.6. LDAP Injection — filter expression manipulation
                else if (Regex.IsMatch(query, @"(?i)(\*\)\(|\)\(|\(\||\(&|\(\!|\bDC=|,DC=|OU=|CN=|objectClass=)") ||
                         Regex.IsMatch(body,  @"(?i)(\*\)\(|\)\(|\(\||\(&|\(\!|\bDC=|,DC=|OU=|CN=|objectClass=)"))
                    violation = "LDAP Injection Detected";

                // 6.7. HTTP Request Smuggling / Desync
                // CL.TE: duplicate or conflicting Transfer-Encoding and Content-Length headers
                else if (context.Request.Headers.ContainsKey("Transfer-Encoding") &&
                         context.Request.Headers.ContainsKey("Content-Length"))
                    violation = "HTTP Desync (CL.TE) Attempt Detected";
                // TE.TE: multiple Transfer-Encoding values or obfuscated chunked
                else if (context.Request.Headers.TryGetValue("Transfer-Encoding", out var teHeader) &&
                         Regex.IsMatch(teHeader.ToString(), @"(?i)(chunked\s*,|,\s*chunked|identity|xchunked|chunked\x00|chunked\t)"))
                    violation = "HTTP Desync (TE.TE) Attempt Detected";

                // 7. API Abuse — privilege escalation via query params / JSON body
                else if (rawPath.StartsWith("/api/", StringComparison.OrdinalIgnoreCase) &&
                         !rawPath.StartsWith("/api/auth/", StringComparison.OrdinalIgnoreCase) &&
                         !rawPath.StartsWith("/api/analytics/", StringComparison.OrdinalIgnoreCase))
                {
                    if (Regex.IsMatch(query, @"(?i)(admin=true|role=admin|access=full)") ||
                        Regex.IsMatch(body,  @"(?i)(""role""\s*:\s*""admin""|""isAdmin""\s*:\s*true|""access""\s*:\s*""full"")"))
                        violation = "API Privilege Escalation Detected";
                    else if (context.Request.Headers.ContainsKey("X-API-Key") &&
                             NormalizeForInspection(context.Request.Headers["X-API-Key"].ToString())
                                 .Contains("DROP TABLE", StringComparison.OrdinalIgnoreCase))
                        violation = "API Key SQL Injection Detected";
                }

                // Tag API-route violations for dashboard counts
                if (violation != null &&
                    rawPath.StartsWith("/api/", StringComparison.OrdinalIgnoreCase) &&
                    !rawPath.StartsWith("/api/auth/", StringComparison.OrdinalIgnoreCase) &&
                    !violation.StartsWith("API "))
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
                    else if (violation.Contains("SSRF")) points = 70;
                    else if (violation.Contains("XXE")) points = 70;
                    else if (violation.Contains("LDAP Injection")) points = 60;
                    else if (violation.Contains("HTTP Desync")) points = 80;
                    else if (violation.Contains("Scanner")) points = 30;
                    else if (violation.Contains("API")) points = 40;
                    
                    context.Items["RiskPoints"] = (context.Items.ContainsKey("RiskPoints") ? (int)context.Items["RiskPoints"] : 0) + points;

                    // For login endpoints, be less aggressive with SQLi because passwords can contain '--' or "'"
                    if (rawPath.Contains("/api/auth/", StringComparison.OrdinalIgnoreCase) && violation == "SQL Injection Detected")
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
                            if (host == "localhost" || host == "127.0.0.1")
                            {
                                tenantId = "global";
                            }
                            else
                            {
                                var domain = await db.Domains.IgnoreQueryFilters().FirstOrDefaultAsync(d => d.DomainName.ToLower() == host.ToLower());
                                tenantId = domain?.TenantId;
                            }
                            
                            // If still null, drop the traffic explicitly
                            if (string.IsNullOrEmpty(tenantId))
                            {
                                context.Response.StatusCode = 404;
                                context.Response.ContentType = "application/json";
                                await context.Response.WriteAsync("{\"error\": \"Unrecognized domain. Traffic dropped.\"}");
                                return;
                            }
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
                // ── Fail-Closed Policy ────────────────────────────────────────────────
                // For high-risk routes, a WAF exception is treated as a block signal
                // (fail-closed). This prevents an attacker from triggering an error
                // to bypass inspection (e.g., via crafted multi-byte sequences or
                // resource exhaustion payloads).
                // For other routes, we log and pass through to avoid a full outage.
                var rawPathOnError = context.Request.Path.Value ?? string.Empty;
                bool isCritical =
                    rawPathOnError.StartsWith("/api/admin",   StringComparison.OrdinalIgnoreCase) ||
                    rawPathOnError.StartsWith("/api/auth",    StringComparison.OrdinalIgnoreCase) ||
                    rawPathOnError.StartsWith("/api/users",   StringComparison.OrdinalIgnoreCase) ||
                    rawPathOnError.StartsWith("/api/payment", StringComparison.OrdinalIgnoreCase);

                Console.WriteLine($"[WAF] Inspection error on {rawPathOnError} (critical={isCritical}): {ex.Message}");

                if (isCritical)
                {
                    context.Response.StatusCode = 503;
                    context.Response.ContentType = "application/json";
                    await context.Response.WriteAsync("{\"error\": \"Security inspection unavailable. Request rejected.\"}");
                    return;
                }

                await _next(context);
            }
        }

        private async Task<(int Points, string? Violation)> CheckIocCacheAsync(string indicatorValue, string indicatorType, string expectedSource = "any")
        {
            try
            {
                string cacheKey = $"ioc_v1:{indicatorValue}:{indicatorType}:{expectedSource}";
                string? cached = await _redis.GetValueAsync(cacheKey);

                if (cached != null)
                {
                    if (cached == "MISS") return (0, null);
                    var cachedObj = JsonSerializer.Deserialize<IocIndicator>(cached);
                    if (cachedObj != null)
                    {
                        int points = cachedObj.Severity switch
                        {
                            "CRITICAL" => 75,
                            "HIGH" => 50,
                            "MEDIUM" => 30,
                            _ => 15
                        };
                        // CISA/Malware/URLhaus carry higher weights as implemented specifically below
                        if (cachedObj.Source == "CISA-KEV") points = 80;
                        if (cachedObj.Source == "MalwareBazaar") points = 90;
                        if (cachedObj.Source == "URLhaus") points = 65;

                        return (points, $"IOC (Cached): {cachedObj.ThreatType ?? "Threat"} ({cachedObj.PulseName})");
                    }
                }

                // Cache Miss — Query DB
                using var scope = _scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<WafDbContext>();
                
                var query = db.IocIndicators.IgnoreQueryFilters().AsNoTracking();
                if (expectedSource != "any") query = query.Where(i => i.Source == expectedSource);
                
                var match = await query.FirstOrDefaultAsync(i => i.IndicatorValue == indicatorValue && (i.IndicatorType == indicatorType || indicatorType == "all"));

                if (match != null)
                {
                    await _redis.SetValueAsync(cacheKey, JsonSerializer.Serialize(match), TimeSpan.FromHours(1));
                    
                    int points = match.Severity switch
                    {
                        "CRITICAL" => 75,
                        "HIGH" => 50,
                        "MEDIUM" => 30,
                        _ => 15
                    };
                    if (match.Source == "CISA-KEV") points = 80;
                    if (match.Source == "MalwareBazaar") points = 90;
                    if (match.Source == "URLhaus") points = 65;

                    return (points, $"IOC: {match.ThreatType ?? "Threat"} ({match.PulseName})");
                }
                else
                {
                    // Cache negative result for 5 mins to prevent DB hammering
                    await _redis.SetValueAsync(cacheKey, "MISS", TimeSpan.FromMinutes(5));
                    return (0, null);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[WAF-Cache] Error checking IOC cache: {ex.Message}");
                return (0, null);
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

using System;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Net;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using AffiniSecurity.Waf.Data;
using AffiniSecurity.Waf.Models;

namespace AffiniSecurity.Waf.Middleware
{
    public class BotManagementMiddleware
    {
        private readonly RequestDelegate _next;
        private readonly Microsoft.Extensions.Configuration.IConfiguration _config;
        private string ChallengeSecret => _config["Waf:ChallengeSecret"] ?? "fallback_secret_should_not_be_used";

        public BotManagementMiddleware(RequestDelegate next, Microsoft.Extensions.Configuration.IConfiguration config)
        {
            _next = next;
            _config = config;
        }

        public async Task InvokeAsync(HttpContext context, WafDbContext dbContext)
        {
            var path = context.Request.Path.Value?.ToLower() ?? "";
            
            // 1. Bypass essential and internal paths
            if (path.StartsWith("/api/internal/", StringComparison.OrdinalIgnoreCase) ||
                path.StartsWith("/api/waf") || path.StartsWith("/api/auth") || path.Contains("favicon") || path.Contains("_next") || path.EndsWith(".png") || path.EndsWith(".jpg") || path.EndsWith(".css") || path.EndsWith(".js"))
            {
                await _next(context);
                return;
            }

            // 2. Bypass for authenticated API calls — only if the JWT is cryptographically valid.
            // A bare presence check (StartsWith "Bearer") is insufficient: a stolen, expired, or
            // low-scope token would bypass the entire bot layer. We verify the HMAC-SHA256
            // signature and the 'exp' claim inline before granting the bypass.
            var authHeader = context.Request.Headers["Authorization"].ToString();
            if (!string.IsNullOrEmpty(authHeader) && authHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            {
                var token = authHeader.Substring("Bearer ".Length).Trim();
                if (IsValidJwt(token))
                {
                    await _next(context);
                    return;
                }
                // Token present but invalid — fall through to full bot scoring (do NOT return here)
            }

            // 3. Skip for internal routes or specific paths if needed
            if (path.StartsWith("/api/auth") || path.StartsWith("/api/profile") || 
                path.StartsWith("/api/plans") || path.StartsWith("/api/platform") ||
                path.StartsWith("/api/users") || path.StartsWith("/api/firewall") ||
                path.StartsWith("/api/analytics") || path.StartsWith("/api/domains") ||
                path.StartsWith("/api/ssl") || path.StartsWith("/api/traffic") ||
                path.StartsWith("/api/challenge") || path.StartsWith("/api/alerts") || 
                path.StartsWith("/api/templates") || path.StartsWith("/api/tenant") ||
                path.StartsWith("/api/admin") || path.StartsWith("/uploads"))
            {
                await _next(context);
                return;
            }

            // Skip for localhost/internal dev traffic
            if (IPAddress.IsLoopback(context.Connection.RemoteIpAddress ?? IPAddress.None))
            {
                await _next(context);
                return;
            }

            var host = context.Request.Host.Host;
            var domain = await dbContext.Domains.IgnoreQueryFilters().FirstOrDefaultAsync(d => d.DomainName == host);
            
            if (domain == null)
            {
                await _next(context);
                return;
            }

            // 2. Lookup Security Settings for this tenant
            var settings = await dbContext.SecuritySettings.IgnoreQueryFilters().FirstOrDefaultAsync(s => s.TenantId == domain.TenantId);
            
            if (settings == null || !settings.BotProtectionEnabled)
            {
                await _next(context);
                return;
            }

            // 3. Check for valid clearance cookie
            if (context.Request.Cookies.TryGetValue("affini_clearance", out string clearance))
            {
                if (ValidateClearance(clearance, host))
                {
                    await _next(context);
                    return;
                }
            }

            // 4. Bot Verification Pipeline (JA3 Blacklist + Reverse DNS)
            var ja3 = context.Request.Headers["X-JA3-Fingerprint"].ToString();
            var userAgent = context.Request.Headers["User-Agent"].ToString();
            int botScore = 0;

            // --- JA3 Blacklisting ---
            if (!string.IsNullOrEmpty(ja3))
            {
                var isBlocked = await dbContext.BlockedFingerprints.IgnoreQueryFilters()
                    .AnyAsync(f => f.Fingerprint == ja3 && (f.IsGlobal || f.TenantId == domain.TenantId));

                if (isBlocked)
                {
                    context.Response.StatusCode = 403;
                    await context.Response.WriteAsync("Access Denied: Malicious Fingerprint Detected (AffiniShield)");
                    return;
                }
            }

            if (!string.IsNullOrEmpty(userAgent))
            {
                var knownBots = await dbContext.KnownBots.ToListAsync();
                var matchedBot = knownBots.FirstOrDefault(b => 
                    userAgent.Contains(b.UserAgentPattern, StringComparison.OrdinalIgnoreCase));

                if (matchedBot != null)
                {
                    // If it claims to be a search engine bot, verify the IP via Reverse DNS
                    bool isVerified = await VerifyBotOriginAsync(context.Connection.RemoteIpAddress, userAgent);
                    
                    if (isVerified)
                    {
                        await _next(context);
                        return;
                    }
                    else if (matchedBot.Action.Equals("block", StringComparison.OrdinalIgnoreCase))
                    {
                        context.Response.StatusCode = 403;
                        await context.Response.WriteAsync("Access Denied: Spoofed Bot Detected (AffiniShield)");
                        return;
                    }
                    // If verification fails but it was marked as a known bot (e.g. SEO Tool), we add a penalty
                    botScore += 40;
                }
            }

            // --- 5. Refined Scoring Logic ---
            // A. Identity Checks
            if (string.IsNullOrEmpty(userAgent)) botScore += 70;
            else if (userAgent.Contains("curl") || userAgent.Contains("python") || userAgent.Contains("postman") || userAgent.Contains("go-http")) botScore += 60;
            else if (userAgent.Length < 30) botScore += 20; // Suspiciously short UA

            // B. Header Anomalies
            if (!context.Request.Headers.ContainsKey("Accept")) botScore += 20;
            if (!context.Request.Headers.ContainsKey("Accept-Language")) botScore += 15;

            // C. TLS/JA3 Intelligence
            if (string.IsNullOrEmpty(ja3) && context.Request.IsHttps)
            {
                // Missing JA3 on HTTPS is suspicious for modern browsers
                botScore += 30;
            }
            else if (!string.IsNullOrEmpty(ja3))
            {
                // If UA says Chrome but JA3 is a known Python hash (even if not in blacklist)
                // Here we could add logic for mismatch detection
                if (userAgent.Contains("Mozilla") && ja3.Length < 15) botScore += 25; 
            }

            // Trigger challenge if score is high
            int challengeThreshold = settings.SensitivityLevel?.ToLower() == "high" ? 40 : 75;

            if (botScore >= challengeThreshold)
            {
                context.Response.ContentType = "text/html";
                var challengeHtml = await GetChallengePage(context, host, context.Request.Path);
                await context.Response.WriteAsync(challengeHtml);
                return;
            }

            await _next(context);
        }

        /// <summary>
        /// Lightweight inline JWT validator — verifies HMAC-SHA256 signature and 'exp' claim.
        /// Only tokens signed with the configured Waf:JwtSecret and not yet expired bypass bot management.
        /// </summary>
        private bool IsValidJwt(string token)
        {
            try
            {
                var parts = token.Split('.');
                if (parts.Length != 3) return false;

                // Verify signature: HMACSHA256(base64url(header) + '.' + base64url(payload), secret)
                var jwtSecret = _config["Waf:JwtSecret"];
                if (string.IsNullOrEmpty(jwtSecret)) return false;

                var signingInput = parts[0] + "." + parts[1];
                using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(jwtSecret));
                var computedHash = hmac.ComputeHash(Encoding.UTF8.GetBytes(signingInput));
                var computedSig = Convert.ToBase64String(computedHash)
                    .Replace("+", "-").Replace("/", "_").TrimEnd('=');

                // Constant-time comparison to prevent timing attacks
                if (!CryptographicOperations.FixedTimeEquals(
                        Encoding.UTF8.GetBytes(computedSig),
                        Encoding.UTF8.GetBytes(parts[2])))
                    return false;

                // Decode payload and check 'exp' claim
                var payloadJson = Encoding.UTF8.GetString(
                    Convert.FromBase64String(PadBase64(parts[1])));
                using var doc = System.Text.Json.JsonDocument.Parse(payloadJson);
                if (doc.RootElement.TryGetProperty("exp", out var expElem))
                {
                    long exp = expElem.GetInt64();
                    if (DateTimeOffset.UtcNow.ToUnixTimeSeconds() > exp)
                        return false; // Expired
                }

                return true;
            }
            catch { return false; }
        }

        private static string PadBase64(string base64url)
        {
            var s = base64url.Replace('-', '+').Replace('_', '/');
            return (s.Length % 4) switch
            {
                2 => s + "==",
                3 => s + "=",
                _ => s
            };
        }

        private async Task<bool> VerifyBotOriginAsync(System.Net.IPAddress ip, string userAgent)
        {
            try 
            {
                if (ip == null) return false;
                var ipStr = ip.ToString();

                // Googlebot Verification
                if (userAgent.Contains("Googlebot", StringComparison.OrdinalIgnoreCase))
                {
                    var hostEntry = await System.Net.Dns.GetHostEntryAsync(ipStr);
                    if (hostEntry.HostName.EndsWith(".googlebot.com") || hostEntry.HostName.EndsWith(".google.com"))
                    {
                        // Double-verify: Forward DNS check
                        var forwardIps = await System.Net.Dns.GetHostAddressesAsync(hostEntry.HostName);
                        return forwardIps.Any(f => f.ToString() == ipStr);
                    }
                }

                // Bingbot Verification
                if (userAgent.Contains("bingbot", StringComparison.OrdinalIgnoreCase))
                {
                    var hostEntry = await System.Net.Dns.GetHostEntryAsync(ipStr);
                    if (hostEntry.HostName.EndsWith(".search.msn.com"))
                    {
                        var forwardIps = await System.Net.Dns.GetHostAddressesAsync(hostEntry.HostName);
                        return forwardIps.Any(f => f.ToString() == ipStr);
                    }
                }

                return false;
            }
            catch { return false; }
        }

        private bool ValidateClearance(string cookieValue, string domain)
        {
            try
            {
                var parts = cookieValue.Split(':');
                if (parts.Length != 3) return false;

                var cookieDomain = parts[0];
                var expiry = long.Parse(parts[1]);
                var signature = parts[2];

                if (cookieDomain != domain || expiry < DateTimeOffset.UtcNow.ToUnixTimeSeconds())
                    return false;

                var dataToSign = $"{cookieDomain}:{expiry}";
                using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(ChallengeSecret));
                var hashBytes = hmac.ComputeHash(Encoding.UTF8.GetBytes(dataToSign));
                var expectedSignature = Convert.ToBase64String(hashBytes).Replace("+", "-").Replace("/", "_").Replace("=", "");

                return signature == expectedSignature;
            }
            catch { return false; }
        }

        private async Task<string> GetChallengePage(HttpContext context, string domain, string target)
        {
            var baseUrl = $"{context.Request.Scheme}://{context.Request.Host}";
            var challengeUrl = $"{baseUrl}/api/waf/challenge?domain={Uri.EscapeDataString(domain)}&target={Uri.EscapeDataString(target)}";
            return $@"<html><head><script>window.location.href='{challengeUrl}';</script></head><body>Redirecting to security check...</body></html>";
        }
    }
}

using Microsoft.AspNetCore.Http;
using System.Text.RegularExpressions;
using System.Text;
using System.IO;

namespace AffiniSecurity.Waf.Middleware
{
    /// <summary>
    /// Middleware to ensure data minimization (Proclamation 1321/2024).
    /// Redacts sensitive fields (passwords, PINs, secret tokens) from request bodies 
    /// for audit logging purposes ONLY. The original request body is preserved intact
    /// so downstream controllers can deserialize it normally.
    /// </summary>
    public class ComplianceScrubberMiddleware
    {
        private readonly RequestDelegate _next;
        private static readonly Regex SensitiveDataRegex = new Regex(
            @"(password|passwd|secret|pin|token|apikey|authorization|credit_card|card_number|cvv|account_number|ssn|id_number|passport|phone_number|email)\s*(""|:)\s*(""|')?([^""',\s}]+)(""|')?", 
            RegexOptions.IgnoreCase | RegexOptions.Compiled);

        public ComplianceScrubberMiddleware(RequestDelegate next)
        {
            _next = next;
        }

        public async Task InvokeAsync(HttpContext context)
        {
            // Only scrub application/json requests with bodies
            if (context.Request.ContentType?.Contains("application/json") == true && 
                (context.Request.Method == "POST" || context.Request.Method == "PUT" || context.Request.Method == "PATCH"))
            {
                // Skip scrubbing for auth and password endpoints so passwords can be verified/updated
                if (context.Request.Path.StartsWithSegments("/api/auth") ||
                    context.Request.Path.StartsWithSegments("/api/profile/password"))
                {
                    await _next(context);
                    return;
                }

                context.Request.EnableBuffering();

                using (var reader = new StreamReader(context.Request.Body, Encoding.UTF8, true, 1024, true))
                {
                    var body = await reader.ReadToEndAsync();
                    if (!string.IsNullOrEmpty(body))
                    {
                        // Build a scrubbed copy FOR AUDIT LOGGING ONLY — do NOT replace the stream.
                        var scrubbedBody = SensitiveDataRegex.Replace(body, m => 
                        {
                            var key = m.Groups[1].Value;
                            var separator = m.Groups[2].Value;
                            var prefix = m.Groups[3].Value;
                            var suffix = m.Groups[5].Value;
                            return $"{key}{separator}{prefix}[REDACTED]{suffix}";
                        });
                        
                        // Store scrubbed copy in context items for audit loggers.
                        context.Items["ScrubbedBody"] = scrubbedBody;
                    }
                    
                    // Always reset so downstream controllers can read the original body.
                    context.Request.Body.Position = 0;
                }
            }

            await _next(context);
        }
    }
}

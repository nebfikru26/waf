using Microsoft.AspNetCore.Http;
using System.Text.RegularExpressions;
using System.Text;
using System.IO;

namespace AffiniSecurity.Waf.Middleware
{
    /// <summary>
    /// Middleware to ensure data minimization (Proclamation 1321/2024).
    /// Redacts sensitive fields (passwords, PINs, secret tokens) from request bodies 
    /// BEFORE they are logged or processed by secondary analytics.
    /// </summary>
    public class ComplianceScrubberMiddleware
    {
        private readonly RequestDelegate _next;
        private static readonly Regex SensitiveDataRegex = new Regex(
            @"(password|passwd|secret|pin|token|credit_card|authorization|apikey)\"":\""([^\""]+)\""", 
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
                context.Request.EnableBuffering();

                using (var reader = new StreamReader(context.Request.Body, Encoding.UTF8, true, 1024, true))
                {
                    var body = await reader.ReadToEndAsync();
                    if (!string.IsNullOrEmpty(body))
                    {
                        var scrubbedBody = SensitiveDataRegex.Replace(body, "$1\":\"[REDACTED]\"");
                        
                        // Update the body for downstream consumers (loggers)
                        var bytes = Encoding.UTF8.GetBytes(scrubbedBody);
                        context.Request.Body = new MemoryStream(bytes);
                        context.Request.ContentLength = bytes.Length;
                    }
                    else
                    {
                        context.Request.Body.Position = 0;
                    }
                }
            }

            await _next(context);
        }
    }
}

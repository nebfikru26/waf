using Microsoft.AspNetCore.Http;

namespace AffiniSecurity.Waf.Middleware
{
    /// <summary>
    /// Applies industry-standard security response headers to every response.
    /// Runs first in the pipeline so headers are present even on error/exception
    /// paths handled further down the chain.
    /// </summary>
    public class SecurityHeadersMiddleware
    {
        private readonly RequestDelegate _next;

        public SecurityHeadersMiddleware(RequestDelegate next)
        {
            _next = next;
        }

        public async Task InvokeAsync(HttpContext context)
        {
            context.Response.OnStarting(() =>
            {
                var headers = context.Response.Headers;

                // Prevent the browser from MIME-sniffing away from the declared content-type.
                headers["X-Content-Type-Options"] = "nosniff";

                // Disallow this app (management UI/API) from being framed to block clickjacking.
                headers["X-Frame-Options"] = "DENY";

                // Limit how much referrer information is leaked cross-origin.
                headers["Referrer-Policy"] = "strict-origin-when-cross-origin";

                // Force HTTPS for a full year, including subdomains, once a client has seen this.
                // Only meaningful over HTTPS; harmless if sent over HTTP (browsers ignore it there).
                headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";

                // Restrict powerful browser features by default for this origin.
                headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()";

                // Baseline CSP for the management API/UI surface. 'unsafe-inline' for style is kept
                // for compatibility with existing inline styles; tighten further once audited.
                headers["Content-Security-Policy"] =
                    "default-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'";

                return Task.CompletedTask;
            });

            await _next(context);
        }
    }
}

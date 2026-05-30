using Microsoft.AspNetCore.Http;
using System.Threading.Tasks;

namespace AffiniSecurity.Waf.Middleware
{
    public class SecurityGatewayMiddleware
    {
        private readonly RequestDelegate _next;

        public SecurityGatewayMiddleware(RequestDelegate next)
        {
            _next = next;
        }

        public async Task InvokeAsync(HttpContext context)
        {
            // ANTI-SPOOFING: If identity is already established by JWT, ignore the header
            if (context.Items.ContainsKey("TenantId"))
            {
                context.Request.Headers.Remove("X-Tenant-ID");
            }
            else 
            {
                // For unauthenticated requests, we might allow the header for internal routing
                // but we should be very careful here.
                var headerTenant = context.Request.Headers["X-Tenant-ID"].ToString();
                if (!string.IsNullOrEmpty(headerTenant))
                {
                    context.Items["TenantId"] = headerTenant;
                }
            }

            await _next(context);
        }
    }
}

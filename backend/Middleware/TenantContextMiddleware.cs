using Microsoft.AspNetCore.Http;
using System.IdentityModel.Tokens.Jwt;
using System.Linq;
using System.Threading.Tasks;

namespace AffiniSecurity.Waf.Middleware
{
    public class TenantContextMiddleware
    {
        private readonly RequestDelegate _next;

        public TenantContextMiddleware(RequestDelegate next)
        {
            _next = next;
        }

        public async Task InvokeAsync(HttpContext context)
        {
            if (context.User.Identity?.IsAuthenticated == true)
            {
                var tenantId = context.User.FindFirst("tenant_id")?.Value;
                if (!string.IsNullOrEmpty(tenantId))
                {
                    context.Items["tenant_id"] = tenantId;
                }
            }

            await _next(context);
        }
    }
}

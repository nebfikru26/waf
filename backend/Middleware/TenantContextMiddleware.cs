using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using AffiniSecurity.Waf.Data;
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
            // 1. Try Authenticated User
            if (context.User.Identity?.IsAuthenticated == true)
            {
                var tenantId = context.User.FindFirst("tenant_id")?.Value;
                if (string.IsNullOrEmpty(tenantId))
                {
                    tenantId = context.User.FindFirst("TenantId")?.Value;
                }
                if (!string.IsNullOrEmpty(tenantId))
                {
                    context.Items["TenantId"] = tenantId;
                }
            }

            // 2. Fallback: Lookup by Hostname (Critical for WAF/unauthenticated traffic)
            if (!context.Items.ContainsKey("TenantId"))
            {
                using var scope = context.RequestServices.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<WafDbContext>();
                
                var host = context.Request.Host.Host;
                var domain = await db.Domains.IgnoreQueryFilters()
                    .AsNoTracking()
                    .FirstOrDefaultAsync(d => d.DomainName == host);

                if (domain != null)
                {
                    context.Items["TenantId"] = domain.TenantId;
                }
            }

            await _next(context);
        }
    }
}

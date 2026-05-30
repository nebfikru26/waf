using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography;
using System.Text;
using System.Security.Claims;
using AffiniSecurity.Waf.Data;
using Microsoft.Extensions.DependencyInjection;

namespace AffiniSecurity.Waf.Middleware
{
    public class ApiKeyMiddleware
    {
        private readonly RequestDelegate _next;

        public ApiKeyMiddleware(RequestDelegate next)
        {
            _next = next;
        }

        public async Task InvokeAsync(HttpContext context, WafDbContext dbContext)
        {
            var authHeader = context.Request.Headers["Authorization"].FirstOrDefault();
            
            if (authHeader != null && authHeader.StartsWith("Bearer affini_", StringComparison.OrdinalIgnoreCase))
            {
                var keySecret = authHeader.Substring("Bearer ".Length).Trim();
                
                using var sha256 = SHA256.Create();
                var hashBytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(keySecret));
                var hashString = Convert.ToBase64String(hashBytes);

                // Use IgnoreQueryFilters because we don't know the TenantId yet
                var apiKey = await dbContext.ApiKeys
                    .IgnoreQueryFilters()
                    .FirstOrDefaultAsync(k => k.KeyHash == hashString && !k.IsRevoked);

                if (apiKey != null && (!apiKey.ExpiresAt.HasValue || apiKey.ExpiresAt > DateTime.UtcNow))
                {
                    // Valid API Key found! Set the user principal
                    var claims = new List<Claim>
                    {
                        new Claim(ClaimTypes.NameIdentifier, "api_key_" + apiKey.Id),
                        new Claim(ClaimTypes.Name, apiKey.Name),
                        new Claim(ClaimTypes.Role, "tenant_admin"), // Grant admin rights to the key
                        new Claim(ClaimTypes.Email, "api-key@" + apiKey.TenantId),
                        new Claim("TenantId", apiKey.TenantId)
                    };

                    var identity = new ClaimsIdentity(claims, "ApiKey");
                    context.User = new ClaimsPrincipal(identity);

                    // Update last used at in background
                    apiKey.LastUsedAt = DateTime.UtcNow;
                    await dbContext.SaveChangesAsync();
                }
            }

            await _next(context);
        }
    }
}

using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using AffiniSecurity.Waf.Data;
using AffiniSecurity.Waf.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.Extensions.Configuration;
using AffiniSecurity.Waf.Security;

namespace AffiniSecurity.Waf.Controllers
{
    [Authorize(Policy = WafPolicies.RequirePlatformAdmin)]
    [ApiController]
    [Route("api/[controller]")]
    public class AdminController : ControllerBase
    {
        private readonly WafDbContext _context;
        private readonly IConfiguration _configuration;

        public AdminController(WafDbContext context, IConfiguration configuration)
        {
            _context = context;
            _configuration = configuration;
        }

        [HttpGet("tenants")]
        public async Task<IActionResult> GetAllTenants()
        {
            var tenants = await _context.Tenants.ToListAsync();
            return Ok(tenants);
        }

        [HttpGet("system-stats")]
        public async Task<IActionResult> GetSystemStats()
        {
            var stats = new
            {
                TotalTenants = await _context.Tenants.CountAsync(),
                TotalUsers = await _context.Users.IgnoreQueryFilters().CountAsync(),
                TotalDomains = await _context.Domains.IgnoreQueryFilters().CountAsync()
            };
            return Ok(stats);
        }
        [HttpPost("impersonate/{tenantId}")]
        public async Task<IActionResult> Impersonate(string tenantId)
        {
            var tenant = await _context.Tenants.FindAsync(tenantId);
            if (tenant == null) return NotFound(new { error = "The requested organization could not be found." });

            var user = await _context.Users.IgnoreQueryFilters().FirstOrDefaultAsync(u => u.TenantId == tenantId && u.Role == "tenant_admin");
            if (user == null) return NotFound(new { error = "We couldn't find an administrator account for this organization." });

            var subscription = await _context.Subscriptions.IgnoreQueryFilters()
                .Where(s => s.TenantId == tenantId && s.Status == "active")
                .OrderByDescending(s => s.CreatedAt)
                .FirstOrDefaultAsync();

            PlanConfig? plan = null;
            if (subscription != null)
                plan = await _context.PlanConfigs.FirstOrDefaultAsync(p => p.Name.ToLower() == subscription.PlanName.ToLower());

            if (plan == null)
                plan = await _context.PlanConfigs.FirstOrDefaultAsync(p => p.Name == "Free");

            var token = GenerateJwtToken(user);

            // Return explicit camelCase DTO to match frontend expectations
            return Ok(new {
                token = token,
                user = new {
                    id = user.Id,
                    email = user.Email,
                    name = user.Name,
                    phone = user.Phone,
                    jobTitle = user.JobTitle,
                    bio = user.Bio,
                    role = user.Role,
                    tenantId = user.TenantId
                },
                tenant = new {
                    id = tenant.Id,
                    name = tenant.Name,
                    address = tenant.Address,
                    industry = tenant.Industry,
                    contactPhone = tenant.ContactPhone,
                    contactEmail = tenant.ContactEmail,
                    isProfileComplete = tenant.IsProfileComplete,
                    logoUrl = tenant.LogoUrl,
                    primaryColor = tenant.PrimaryColor,
                    brandName = tenant.BrandName
                },
                planConfig = plan == null ? null : new {
                    id = plan.Id,
                    name = plan.Name,
                    maxDomains = plan.MaxDomains,
                    hasWafDetection = plan.HasWafDetection,
                    hasWafBlocking = plan.HasWafBlocking,
                    hasApiProtection = plan.HasApiProtection,
                    hasBotProtection = plan.HasBotProtection,
                    hasDdosProtection = plan.HasDdosProtection,
                    hasAccountTakeover = plan.HasAccountTakeover,
                    hasRateLimiting = plan.HasRateLimiting,
                    hasSslManagement = plan.HasSslManagement,
                    hasThreatIntel = plan.HasThreatIntel,
                    hasAttackLogs = plan.HasAttackLogs,
                    hasNotifications = plan.HasNotifications,
                    hasAnalytics = plan.HasAnalytics
                }
            });
        }

        private string GenerateJwtToken(User user)
        {
            var jwtSecret = _configuration["Waf:JwtSecret"] ?? "default-secret-key-123-replace-in-production";
            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret));
            var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

            var claims = new[]
            {
                new Claim(ClaimTypes.Email, user.Email),
                new Claim("TenantId", user.TenantId),
                new Claim(ClaimTypes.Role, user.Role)
            };

            var token = new JwtSecurityToken(
                claims: claims,
                expires: DateTime.Now.AddDays(30),
                signingCredentials: creds
            );

            return new JwtSecurityTokenHandler().WriteToken(token);
        }

        [HttpPost("unimpersonate")]
        public async Task<IActionResult> Unimpersonate()
        {
            return Ok();
        }
    }
}

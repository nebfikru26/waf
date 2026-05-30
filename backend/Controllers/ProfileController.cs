using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using AffiniSecurity.Waf.Data;
using AffiniSecurity.Waf.Models;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using System.Text.Json.Serialization;

namespace AffiniSecurity.Waf.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/profile")]
    public class ProfileController : ControllerBase
    {
        private readonly WafDbContext _context;

        public ProfileController(WafDbContext context)
        {
            _context = context;
        }

        [HttpGet]
        public async Task<IActionResult> GetProfile()
        {
            var email = User.FindFirstValue(ClaimTypes.Email);
            if (string.IsNullOrEmpty(email)) return Unauthorized();

            var user = await _context.Users.IgnoreQueryFilters().FirstOrDefaultAsync(u => u.Email == email);
            if (user == null) return NotFound();

            var tenant = await _context.Tenants.IgnoreQueryFilters().FirstOrDefaultAsync(t => t.Id == user.TenantId);

            // Get latest active subscription
            var subscription = await _context.Subscriptions.IgnoreQueryFilters()
                .Where(s => s.TenantId == user.TenantId && s.Status == "active")
                .OrderByDescending(s => s.CreatedAt)
                .FirstOrDefaultAsync();

            PlanConfig? planConfig = null;
            if (subscription != null)
            {
                // Case-insensitive plan matching
                planConfig = await _context.PlanConfigs.IgnoreQueryFilters()
                    .FirstOrDefaultAsync(p => p.Name.ToLower() == subscription.PlanName.ToLower());
            }
            
            // Fallback to Free plan config if no subscription or config found
            if (planConfig == null)
            {
                planConfig = await _context.PlanConfigs.IgnoreQueryFilters().FirstOrDefaultAsync(p => p.Name == "Free");
            }

            return Ok(new {
                id = user.Id,
                name = user.Name,
                email = user.Email,
                phone = user.Phone,
                jobTitle = user.JobTitle,
                bio = user.Bio,
                role = user.Role,
                tenantId = user.TenantId,
                tenantName = tenant?.Name,
                isProfileComplete = tenant?.IsProfileComplete,
                plan = subscription ?? new Subscription { TenantId = user.TenantId, PlanName = "Free" },
                planConfig = planConfig == null ? null : new {
                    id = planConfig.Id,
                    name = planConfig.Name,
                    maxDomains = planConfig.MaxDomains,
                    hasWafDetection = planConfig.HasWafDetection,
                    hasWafBlocking = planConfig.HasWafBlocking,
                    hasApiProtection = planConfig.HasApiProtection,
                    hasBotProtection = planConfig.HasBotProtection,
                    hasDdosProtection = planConfig.HasDdosProtection,
                    hasAccountTakeover = planConfig.HasAccountTakeover,
                    hasRateLimiting = planConfig.HasRateLimiting,
                    hasSslManagement = planConfig.HasSslManagement,
                    hasThreatIntel = planConfig.HasThreatIntel,
                    hasAttackLogs = planConfig.HasAttackLogs,
                    hasNotifications = planConfig.HasNotifications,
                    hasAnalytics = planConfig.HasAnalytics,
                    priceEtb = planConfig.PriceEtb
                }
            });
        }

        [HttpPost("update")]
        public async Task<IActionResult> UpdateProfile([FromBody] UpdateProfileModel profile)
        {
            var email = User.FindFirstValue(ClaimTypes.Email);
            if (string.IsNullOrEmpty(email)) return Unauthorized();
            
            // Validate incoming model
            if (!ModelState.IsValid) return BadRequest(ModelState);

            var user = await _context.Users.FirstOrDefaultAsync(u => u.Email == email);
            if (user == null) return NotFound();

            if (profile.Name != null) user.Name = profile.Name;
            if (profile.Phone != null) user.Phone = profile.Phone;
            if (profile.JobTitle != null) user.JobTitle = profile.JobTitle;
            if (profile.Bio != null) user.Bio = profile.Bio;

            await _context.SaveChangesAsync();
            return Ok(user);
        }
    }

    public class UpdateProfileModel
    {
        [JsonPropertyName("name")]
        public string? Name { get; set; }

        [JsonPropertyName("phone")]
        public string? Phone { get; set; }

        [JsonPropertyName("jobTitle")]
        public string? JobTitle { get; set; }

        [JsonPropertyName("bio")]
        public string? Bio { get; set; }
    }
}

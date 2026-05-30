using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using AffiniSecurity.Waf.Security;
using AffiniSecurity.Waf.Services;
using System.Text.Json;

namespace AffiniSecurity.Waf.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class CmsController : ControllerBase
    {
        private readonly IRedisService _redis;

        public CmsController(IRedisService redis)
        {
            _redis = redis;
        }

        // --- Landing Page Content ---
        [HttpGet("landing-page")]
        public async Task<IActionResult> GetLandingPageContent()
        {
            var content = await _redis.GetValueAsync("cms:landing_page");
            if (string.IsNullOrEmpty(content))
            {
                // Default fallback content if none exists in Redis
                var defaultContent = new {
                    heroTitle = "Traditional Trust, Modern Security",
                    heroSubtitle = "AffiniSecurity delivers next-generation web protection with a core of traditional reliability. Safeguard your digital assets with enterprise-grade intelligence.",
                    ctaText = "START 14-DAY FREE TRIAL"
                };
                return Ok(defaultContent);
            }
            return Content(content, "application/json");
        }

        [Authorize(Policy = WafPolicies.RequirePlatformAdmin)]
        [HttpPost("landing-page")]
        public async Task<IActionResult> UpdateLandingPageContent([FromBody] JsonElement content)
        {
            await _redis.SetValueAsync("cms:landing_page", JsonSerializer.Serialize(content));
            return Ok(new { message = "Landing page content updated successfully." });
        }

        // --- Threat Intelligence Bulletins ---
        [HttpGet("bulletins")]
        public async Task<IActionResult> GetBulletins()
        {
            var content = await _redis.GetValueAsync("cms:bulletins");
            if (string.IsNullOrEmpty(content))
            {
                return Ok(new object[] { });
            }
            return Content(content, "application/json");
        }

        [Authorize(Policy = WafPolicies.RequirePlatformAdmin)]
        [HttpPost("bulletins")]
        public async Task<IActionResult> UpdateBulletins([FromBody] JsonElement bulletins)
        {
            await _redis.SetValueAsync("cms:bulletins", JsonSerializer.Serialize(bulletins));
            return Ok(new { message = "Threat bulletins updated successfully." });
        }

        // --- Global Security Rules ---
        [HttpGet("global-rules")]
        public async Task<IActionResult> GetGlobalRules()
        {
            var content = await _redis.GetValueAsync("cms:global_rules");
            if (string.IsNullOrEmpty(content))
            {
                return Ok(new object[] { });
            }
            return Content(content, "application/json");
        }

        [Authorize(Policy = WafPolicies.RequirePlatformAdmin)]
        [HttpPost("global-rules")]
        public async Task<IActionResult> UpdateGlobalRules([FromBody] JsonElement rules)
        {
            await _redis.SetValueAsync("cms:global_rules", JsonSerializer.Serialize(rules));
            return Ok(new { message = "Global security rules updated successfully." });
        }
    }
}

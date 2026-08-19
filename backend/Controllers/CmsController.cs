using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using AffiniSecurity.Waf.Security;
using AffiniSecurity.Waf.Services;
using System.Text.Json;
using System.Text;

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
                    ctaText = "Protect Your Infrastructure",
                    services = new[] {
                        new { icon = "Shield", title = "Web Application Firewall", description = "Enterprise-grade WAF powered by OWASP CRS rules to block SQL injection, XSS, and zero-day attacks before they reach your servers." },
                        new { icon = "Globe", title = "DDoS Protection", description = "L7 DDoS mitigation with automatic traffic scrubbing and behavioral analysis to keep your applications online." },
                        new { icon = "Lock", title = "SSL/TLS Termination", description = "High-performance SSL/TLS offloading and termination with automated certificate provisioning and strict HTTPS enforcement." },
                        new { icon = "Zap", title = "Rate Limiting", description = "Intelligent rate limiting engine to prevent brute-force attacks and API abuse without impacting legitimate users." },
                        new { icon = "BarChart3", title = "Real-Time Analytics", description = "Live dashboards showing attack patterns, traffic trends, and behavioral threat intelligence." },
                        new { icon = "Bell", title = "Instant Notifications", description = "Get notified via email, webhook, SMS, or Slack when security incidents occur. Full audit logs provided." }
                    },
                    features = new[] {
                        "Basic WAF rules (Detection)",
                        "Full OWASP Protection (Blocking)",
                        "API Protection Shielding",
                        "Advanced Bot Intelligence",
                        "L7 DDoS Defense Shield",
                        "Account Takeover Protection",
                        "Rate Limiting & Brute Force Prevention",
                        "SSL/TLS Termination & Offloading",
                        "Advanced Threat Intelligence",
                        "Real-time security notifications",
                        "Dedicated Managed Support",
                        "Custom SLA & Compliance Reporting"
                    },
                    pricing = new[] {
                        new { name = "Free", price = "0 ETB", period = "/month", description = "For personal projects and testing", features = new[] { "1 Domain", "WAF rules (Detection only)", "SSL/TLS Management", "Real-time Security Logs", "Standard Analytics" }, cta = "Get Started", highlighted = false },
                        new { name = "Professional", price = "14,999 ETB", period = "/month", description = "For growing businesses", features = new[] { "Up to 5 Domains", "WAF rules (Detection)", "Full OWASP Protection (Blocking)", "API Protection Shielding", "Rate Limiting Engine", "Advanced Threat Intel", "Real-time security notifications", "Real-Time Analytics" }, cta = "Start Free Trial", highlighted = true },
                        new { name = "Enterprise", price = "49,999 ETB", period = "/month", description = "For large organizations", features = new[] { "Up to 50 Domains", "WAF rules (Detection)", "Full OWASP Protection (Blocking)", "API Protection Shielding", "Advanced Bot Intelligence", "L7 DDoS Defense Shield", "Account Takeover Protection", "Rate Limiting Engine", "SSL/TLS Management", "Advanced Threat Intel", "Real-time security notifications", "Real-Time Analytics" }, cta = "Upgrade to Enterprise", highlighted = false },
                        new { name = "Custom", price = "Custom", period = "", description = "Tailored for your infrastructure", features = new[] { "Unlimited Domains", "High-Performance Bot Defense", "Dedicated WAF Instance", "L7 DDoS Shield+", "Account Takeover Protect+", "Managed Security Service", "Custom SLA & TAM" }, cta = "Contact Sales", highlighted = false }
                    },
                    aboutTitle = "About Affinisecurity",
                    aboutContent = "Affinisecurity is an enterprise-grade cloud Web Application Firewall (WAF), purpose-built to protect businesses from evolving cyber threats. We deliver Security as a Service — eliminating expensive hardware and complex on-premise setups.\n\nOur multi-tenant platform supports organizations of all sizes — from startups to large enterprises. With OWASP CRS integration, real-time analytics, and advanced geo-filtering, Affinisecurity delivers world-class protection wherever you operate.\n\nFounded by a team of cybersecurity professionals, our mission is to make enterprise-grade web security accessible and affordable for every business in the digital economy.",
                    contact = new {
                        email = "info@affinisecurity.io",
                        phone = "+1 (800) 555-0199",
                        office = "Global — Remote First"
                    },
                    branding = new {
                        siteName = "AffiniSecurity",
                        logoUrl = "/images/brand-logo.png",
                        primaryColor = "217 85% 29%",
                        accentColor = "217 85% 29%"
                    }
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

        // --- Logo File Upload ---
        [Authorize(Policy = WafPolicies.RequirePlatformAdmin)]
        [HttpPost("upload-logo")]
        [RequestSizeLimit(5_000_000)] // 5 MB max
        public async Task<IActionResult> UploadLogo(IFormFile file)
        {
            if (file == null || file.Length == 0)
                return BadRequest(new { message = "No file provided." });

            var allowedTypes = new[] { "image/png", "image/jpeg", "image/svg+xml", "image/webp", "image/gif" };
            if (!allowedTypes.Contains(file.ContentType.ToLower()))
                return BadRequest(new { message = "Unsupported file type. Use PNG, JPEG, SVG, WebP, or GIF." });

            using var ms = new System.IO.MemoryStream();
            await file.CopyToAsync(ms);
            var base64 = Convert.ToBase64String(ms.ToArray());
            var dataUri = $"data:{file.ContentType};base64,{base64}";

            await _redis.SetValueAsync("cms:logo_asset", dataUri);
            return Ok(new { logoUrl = dataUri, message = "Logo uploaded successfully." });
        }

        // --- Promotions (Banner + Holiday Events) ---
        [HttpGet("promotions")]
        public async Task<IActionResult> GetPromotions()
        {
            var content = await _redis.GetValueAsync("cms:promotions");
            if (string.IsNullOrEmpty(content))
            {
                var defaultPromotions = new {
                    banner = new {
                        active = false,
                        type = "info",
                        message = "",
                        subMessage = "",
                        ctaText = "",
                        ctaUrl = "",
                        expiresAt = (string?)null,
                        showCountdown = false
                    },
                    holidays = new object[] {
                        new { id = 1, name = "Ethiopian New Year (Enkutatash)", startDate = "2025-09-11", endDate = "2025-09-12", message = "🎊 Happy Enkutatash! Wishing you a prosperous New Year!", particleType = "confetti", colors = new[] { "#078930", "#FCDD09", "#DA121A", "#0F47AF" }, active = false },
                        new { id = 2, name = "Christmas", startDate = "2026-01-07", endDate = "2026-01-08", message = "🎄 Merry Christmas from AffiniSecurity!", particleType = "snowflake", colors = new[] { "#FFFFFF", "#B3E5FC", "#90CAF9" }, active = false },
                        new { id = 3, name = "New Year", startDate = "2026-01-01", endDate = "2026-01-01", message = "🎆 Happy New Year! Stay secure in 2026!", particleType = "sparkle", colors = new[] { "#FFD700", "#FF69B4", "#C77DFF", "#60EFFF" }, active = false },
                        new { id = 4, name = "Easter (Fasika)", startDate = "2026-04-12", endDate = "2026-04-13", message = "🥚 Happy Fasika from the AffiniSecurity team!", particleType = "star", colors = new[] { "#FFD93D", "#FF6B6B", "#6BCB77" }, active = false }
                    }
                };
                return Ok(defaultPromotions);
            }
            return Content(content, "application/json");
        }

        [Authorize(Policy = WafPolicies.RequirePlatformAdmin)]
        [HttpPost("promotions")]
        public async Task<IActionResult> UpdatePromotions([FromBody] JsonElement promotions)
        {
            await _redis.SetValueAsync("cms:promotions", JsonSerializer.Serialize(promotions));
            return Ok(new { message = "Promotions updated successfully." });
        }
    }
}

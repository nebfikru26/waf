using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using AffiniSecurity.Waf.Data;
using AffiniSecurity.Waf.Models;
using AffiniSecurity.Waf.Services;
using Microsoft.EntityFrameworkCore;

namespace AffiniSecurity.Waf.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/modules/security-settings")]
    public class SecuritySettingsController : ControllerBase
    {
        private readonly WafDbContext _context;

        public SecuritySettingsController(WafDbContext context)
        {
            _context = context;
        }

        private async Task SyncToRedis(SecuritySettings settings, IRedisService redisService)
        {
            var isEnabledStr = settings.MlDetectionEnabled.ToString().ToLower();
            // 1. Sync by TenantId
            await redisService.SetValueAsync($"tenant:ai:{settings.TenantId}:enabled", isEnabledStr);

            // 2. Sync by DomainNames associated with this TenantId
            var domains = await _context.Domains
                .IgnoreQueryFilters()
                .Where(d => d.TenantId == settings.TenantId)
                .ToListAsync();

            foreach (var domain in domains)
            {
                if (!string.IsNullOrEmpty(domain.DomainName))
                {
                    await redisService.SetValueAsync($"tenant:ai:{domain.DomainName}:enabled", isEnabledStr);
                }
            }
        }

        [HttpGet]
        public async Task<IActionResult> GetSettings([FromServices] IRedisService redisService)
        {
            var settings = await _context.SecuritySettings.FirstOrDefaultAsync();
            if (settings == null)
            {
                settings = new SecuritySettings();
                _context.SecuritySettings.Add(settings);
                await _context.SaveChangesAsync();
            }
            await SyncToRedis(settings, redisService);
            return Ok(settings);
        }

        [HttpPut]
        public async Task<IActionResult> UpdateSettings(
            [FromBody] SecuritySettings settings, 
            [FromServices] AffiniSecurity.Waf.Services.WafConfigGenerator wafGenerator,
            [FromServices] IRedisService redisService)
        {
            Console.WriteLine($"[UpdateSettings] Received PUT request. Incoming JsChallengeEnabled={settings.JsChallengeEnabled}, BotProtectionEnabled={settings.BotProtectionEnabled}, GeoEnabled={settings.GeoEnabled}");
            var existing = await _context.SecuritySettings.FirstOrDefaultAsync();
            if (existing == null)
            {
                _context.SecuritySettings.Add(settings);
                await _context.SaveChangesAsync();
                
                await SyncToRedis(settings, redisService);

                // Trigger global WAF orchestration reload
                await wafGenerator.GenerateAndReloadAsync();
                return Ok(settings);
            }

            // Map all properties from the incoming object
            existing.BotProtectionEnabled = settings.BotProtectionEnabled;
            existing.JsChallengeEnabled = settings.JsChallengeEnabled;
            existing.CaptchaEnabled = settings.CaptchaEnabled;
            existing.FingerprintingEnabled = settings.FingerprintingEnabled;
            existing.MlDetectionEnabled = settings.MlDetectionEnabled;
            existing.DdosProtectionEnabled = settings.DdosProtectionEnabled;
            existing.L7ProtectionEnabled = settings.L7ProtectionEnabled;
            existing.DdosThresholdRps = settings.DdosThresholdRps;
            existing.SensitivityLevel = settings.SensitivityLevel;
            existing.GeoEnabled = settings.GeoEnabled;
            existing.GeoMode = settings.GeoMode;
            existing.GeoAllowlist = settings.GeoAllowlist;
            existing.GeoBlocklist = settings.GeoBlocklist;
            existing.RateLimitRps = settings.RateLimitRps;

            await _context.SaveChangesAsync();
            
            await SyncToRedis(existing, redisService);

            // Trigger global WAF orchestration reload to apply active bot protection policies
            await wafGenerator.GenerateAndReloadAsync();
            
            return Ok(existing);
        }
    }
}

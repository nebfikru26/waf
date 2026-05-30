using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using AffiniSecurity.Waf.Data;
using AffiniSecurity.Waf.Models;
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

        [HttpGet]
        public async Task<IActionResult> GetSettings()
        {
            var settings = await _context.SecuritySettings.FirstOrDefaultAsync();
            if (settings == null)
            {
                settings = new SecuritySettings();
                _context.SecuritySettings.Add(settings);
                await _context.SaveChangesAsync();
            }
            return Ok(settings);
        }

        [HttpPut]
        public async Task<IActionResult> UpdateSettings([FromBody] SecuritySettings settings, [FromServices] AffiniSecurity.Waf.Services.WafConfigGenerator wafGenerator)
        {
            Console.WriteLine($"[UpdateSettings] Received PUT request. Incoming JsChallengeEnabled={settings.JsChallengeEnabled}, BotProtectionEnabled={settings.BotProtectionEnabled}, GeoEnabled={settings.GeoEnabled}");
            var existing = await _context.SecuritySettings.FirstOrDefaultAsync();
            if (existing == null)
            {
                _context.SecuritySettings.Add(settings);
                await _context.SaveChangesAsync();
                
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
            
            // Trigger global WAF orchestration reload to apply active bot protection policies
            await wafGenerator.GenerateAndReloadAsync();
            
            return Ok(existing);
        }
    }
}

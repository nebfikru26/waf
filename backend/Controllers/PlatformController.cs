using Microsoft.AspNetCore.Mvc;
using AffiniSecurity.Waf.Data;
using AffiniSecurity.Waf.Models;
using Microsoft.EntityFrameworkCore;

namespace AffiniSecurity.Waf.Controllers
{
    [ApiController]
    [Route("api/platform")]
    public class PlatformController : ControllerBase
    {
        private readonly WafDbContext _context;

        public PlatformController(WafDbContext context)
        {
            _context = context;
        }

        [HttpGet("config")]
        public async Task<IActionResult> GetConfig()
        {
            var config = await _context.SystemConfigs.FirstOrDefaultAsync();
            if (config == null)
            {
                config = new SystemConfig 
                { 
                    SalesContactEmail = "sales@affinisecurity.io", 
                    SalesContactPhone = "+251 911 000 000",
                    SupportEmail = "support@affinisecurity.io"
                };
            }
            return Ok(config);
        }

        [HttpPut("config")]
        public async Task<IActionResult> UpdateConfig([FromBody] SystemConfig config)
        {
            var existing = await _context.SystemConfigs.FirstOrDefaultAsync();
            if (existing == null)
            {
                _context.SystemConfigs.Add(config);
            }
            else
            {
                existing.SalesContactEmail = config.SalesContactEmail;
                existing.SalesContactPhone = config.SalesContactPhone;
                existing.SupportEmail = config.SupportEmail;
            }
            await _context.SaveChangesAsync();
            return Ok(config);
        }
        [HttpGet("status")]
        public IActionResult GetStatus()
        {
            return Ok(new
            {
                platform = "AffiniSecurity WAF Edge",
                version = "2.5.0-PRO",
                status = "operational",
                capabilities = new[] { "WAF", "Bot Intelligence", "DDoS Mitigation", "API Security" },
                environment = "Development",
                message = "AffiniSecurity WAF Edge is actively protecting your infrastructure.",
                timestamp = DateTime.UtcNow
            });
        }
    }
}

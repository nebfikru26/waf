using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using AffiniSecurity.Waf.Data;
using AffiniSecurity.Waf.Models;
using Microsoft.EntityFrameworkCore;

namespace AffiniSecurity.Waf.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/risk")]
    public class RiskController : ControllerBase
    {
        private readonly WafDbContext _context;

        public RiskController(WafDbContext context)
        {
            _context = context;
        }

        [HttpGet("thresholds")]
        public async Task<IActionResult> GetThresholds()
        {
            var tenantId = _context.CurrentTenantId;
            var thresholds = await _context.RiskThresholds.FirstOrDefaultAsync(r => r.TenantId == tenantId);
            
            if (thresholds == null)
            {
                // Return default values if not found
                thresholds = new RiskThreshold { TenantId = tenantId };
            }
            
            return Ok(thresholds);
        }

        [HttpPut("thresholds")]
        public async Task<IActionResult> UpdateThresholds([FromBody] RiskThreshold update)
        {
            var tenantId = _context.CurrentTenantId;
            var existing = await _context.RiskThresholds.FirstOrDefaultAsync(r => r.TenantId == tenantId);

            if (update.LogThreshold > update.ChallengeThreshold || update.ChallengeThreshold > update.BlockThreshold)
            {
                return BadRequest(new { error = "Threshold order must be Log <= Challenge <= Block" });
            }

            if (existing == null)
            {
                update.TenantId = tenantId;
                _context.RiskThresholds.Add(update);
            }
            else
            {
                existing.LogThreshold = update.LogThreshold;
                existing.ChallengeThreshold = update.ChallengeThreshold;
                existing.BlockThreshold = update.BlockThreshold;
                existing.WeightSqli = update.WeightSqli;
                existing.WeightXss = update.WeightXss;
                existing.WeightPathTraversal = update.WeightPathTraversal;
                existing.WeightCmdi = update.WeightCmdi;
                existing.WeightSsrf = update.WeightSsrf;
                existing.WeightCustomRule = update.WeightCustomRule;
                existing.WeightSchemaViol = update.WeightSchemaViol;
                existing.WeightAto = update.WeightAto;
                existing.WeightBotUa = update.WeightBotUa;
                existing.WeightMissingUa = update.WeightMissingUa;
            }

            await _context.SaveChangesAsync();
            return Ok(existing ?? update);
        }

        [HttpGet("stats")]
        public async Task<IActionResult> GetStats()
        {
            var events = await _context.RiskEvents.ToListAsync();
            
            var buckets = new List<object>
            {
                new { label = "Low (0-39)", count = events.Count(e => e.RiskScore < 40), min = 0, max = 39 },
                new { label = "Medium (40-59)", count = events.Count(e => e.RiskScore >= 40 && e.RiskScore < 60), min = 40, max = 59 },
                new { label = "High (60-79)", count = events.Count(e => e.RiskScore >= 60 && e.RiskScore < 80), min = 60, max = 79 },
                new { label = "Critical (80+)", count = events.Count(e => e.RiskScore >= 80), min = 80, max = 100 }
            };

            var topThreats = events.GroupBy(e => e.ThreatType)
                .Select(g => new { threatType = g.Key, count = g.Count() })
                .OrderByDescending(x => x.count)
                .Take(5)
                .ToList();

            return Ok(new { buckets, top_threats = topThreats });
        }

        [HttpGet("events")]
        public async Task<IActionResult> GetEvents([FromQuery] int min_score = 0)
        {
            var events = await _context.RiskEvents
                .Where(e => e.RiskScore >= min_score)
                .OrderByDescending(e => e.Timestamp)
                .Take(50)
                .ToListAsync();
            
            return Ok(events);
        }
    }
}

using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using AffiniSecurity.Waf.Data;
using AffiniSecurity.Waf.Models;
using AffiniSecurity.Waf.Services;
using AffiniSecurity.Waf.Security;
using Microsoft.EntityFrameworkCore;
using System;
using System.Linq;
using System.Threading.Tasks;

namespace AffiniSecurity.Waf.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/threat-feed")]
    public class ThreatFeedController : ControllerBase
    {
        private readonly WafDbContext _context;

        public ThreatFeedController(WafDbContext context)
        {
            _context = context;
        }

        /// <summary>
        /// Returns high-level statistics about the locally cached IOC feed.
        /// </summary>
        [HttpGet("summary")]
        public async Task<IActionResult> GetSummary()
        {
            var all = await _context.IocIndicators.IgnoreQueryFilters().ToListAsync();

            var byType = all
                .GroupBy(i => i.IndicatorType)
                .Select(g => new { type = g.Key, count = g.Count() })
                .OrderByDescending(x => x.count)
                .ToList();

            var bySeverity = all
                .GroupBy(i => i.Severity)
                .Select(g => new { severity = g.Key, count = g.Count() })
                .ToList();

            var byThreat = all
                .GroupBy(i => i.ThreatType ?? "Unknown")
                .Select(g => new { threat = g.Key, count = g.Count() })
                .OrderByDescending(x => x.count)
                .Take(10)
                .ToList();

            // Per-source breakdown for the multi-feed dashboard card
            var bySource = all
                .GroupBy(i => i.Source)
                .Select(g => new
                {
                    source = g.Key,
                    count = g.Count(),
                    criticalCount = g.Count(i => i.Severity == "CRITICAL"),
                    highCount = g.Count(i => i.Severity == "HIGH"),
                    types = g.Select(i => i.IndicatorType).Distinct().ToList(),
                })
                .OrderByDescending(x => x.count)
                .ToList();

            return Ok(new
            {
                totalIndicators = all.Count,
                lastSyncedAt = ThreatFeedService.LastSyncedAt,
                lastSyncCounts = ThreatFeedService.LastSyncCounts,
                byType,
                bySeverity,
                byThreat,
                bySource,
                criticalCount = all.Count(i => i.Severity == "CRITICAL"),
                highCount = all.Count(i => i.Severity == "HIGH"),
            });
        }

        /// <summary>
        /// Returns a paginated, filterable list of IOC indicators.
        /// </summary>
        [HttpGet("indicators")]
        public async Task<IActionResult> GetIndicators(
            [FromQuery] string? search,
            [FromQuery] string? type,
            [FromQuery] string? severity,
            [FromQuery] string? threatType,
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 50)
        {
            var query = _context.IocIndicators
                .IgnoreQueryFilters()
                .AsQueryable();

            if (!string.IsNullOrWhiteSpace(search))
                query = query.Where(i => i.IndicatorValue.Contains(search) || (i.PulseName != null && i.PulseName.Contains(search)));

            if (!string.IsNullOrWhiteSpace(type))
                query = query.Where(i => i.IndicatorType == type);

            if (!string.IsNullOrWhiteSpace(severity))
                query = query.Where(i => i.Severity == severity);

            if (!string.IsNullOrWhiteSpace(threatType))
                query = query.Where(i => i.ThreatType == threatType);

            var total = await query.CountAsync();
            var items = await query
                .OrderByDescending(i => i.ConfidenceScore)
                .ThenByDescending(i => i.IngestedAt)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync();

            return Ok(new
            {
                total,
                page,
                pageSize,
                totalPages = (int)Math.Ceiling((double)total / pageSize),
                items
            });
        }

        /// <summary>
        /// Check if a specific IP or domain is in the IOC feed.
        /// Useful for manual threat lookups.
        /// </summary>
        [HttpGet("lookup")]
        public async Task<IActionResult> Lookup([FromQuery] string value)
        {
            if (string.IsNullOrWhiteSpace(value))
                return BadRequest(new { error = "value is required" });

            var indicator = await _context.IocIndicators
                .IgnoreQueryFilters()
                .Where(i => i.IndicatorValue == value)
                .FirstOrDefaultAsync();

            if (indicator == null)
                return Ok(new { found = false, value });

            return Ok(new { found = true, indicator });
        }

        /// <summary>
        /// Manually trigger a re-sync of the threat feed (admin only).
        /// </summary>
        [HttpPost("sync")]
        [Authorize(Policy = WafPolicies.RequirePlatformAdmin)]
        public IActionResult TriggerSync()
        {
            // The background service will pick this up on its next cycle.
            // For a real immediate trigger, we'd use a Channel<T> or IHostedService signal.
            return Ok(new { message = "Threat feed sync has been acknowledged. The feed refreshes automatically every 6 hours." });
        }
    }
}

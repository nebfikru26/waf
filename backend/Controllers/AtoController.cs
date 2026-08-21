using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using AffiniSecurity.Waf.Data;
using AffiniSecurity.Waf.Models;
using AffiniSecurity.Waf.Services;
using Microsoft.EntityFrameworkCore;
using System;
using System.Linq;
using System.Threading.Tasks;

namespace AffiniSecurity.Waf.Controllers
{
    /// <summary>
    /// Manages the Account Takeover (ATO) / credential-stuffing protection applied by
    /// <see cref="Middleware.ATOTrackerMiddleware"/> to the platform's own login/signup
    /// endpoints. This is intentionally global (not tenant-scoped) — see the comment on
    /// <see cref="AtoSettings"/> for why.
    /// </summary>
    [Authorize]
    [ApiController]
    [Route("api/ato")]
    public class AtoController : ControllerBase
    {
        private readonly WafDbContext _context;
        private readonly IRedisService _redis;

        public AtoController(WafDbContext context, IRedisService redis)
        {
            _context = context;
            _redis = redis;
        }

        private bool IsPlatformAdmin() =>
            User.IsInRole("admin") || User.IsInRole("super_admin") || User.IsInRole("support_engineer");

        private async Task<AtoSettings> GetOrCreateSettingsAsync()
        {
            var settings = await _context.AtoTrackerSettings.FirstOrDefaultAsync(s => s.Id == "global");
            if (settings == null)
            {
                settings = new AtoSettings { Id = "global" };
                _context.AtoTrackerSettings.Add(settings);
                await _context.SaveChangesAsync();
            }
            return settings;
        }

        [HttpGet("config")]
        public async Task<IActionResult> GetConfig()
        {
            var settings = await GetOrCreateSettingsAsync();
            return Ok(settings);
        }

        [HttpPut("config")]
        public async Task<IActionResult> UpdateConfig([FromBody] AtoSettings incoming)
        {
            if (!IsPlatformAdmin())
                return Forbid();

            var settings = await GetOrCreateSettingsAsync();
            settings.Enabled = incoming.Enabled;
            settings.MaxFailedAttempts = Math.Max(1, incoming.MaxFailedAttempts);
            settings.WindowSeconds = Math.Max(1, incoming.WindowSeconds);
            settings.LockoutSeconds = Math.Max(1, incoming.LockoutSeconds);
            settings.Action = incoming.Action is "challenge" or "block" or "log" ? incoming.Action : "challenge";
            settings.TrackByFingerprint = incoming.TrackByFingerprint;
            settings.AuthEndpoints = string.IsNullOrWhiteSpace(incoming.AuthEndpoints)
                ? settings.AuthEndpoints
                : incoming.AuthEndpoints;
            settings.UpdatedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync();
            return Ok(settings);
        }

        // ============================================================
        // Stats — real aggregation over ato_tracker_events, the same rows persisted by
        // ATOTrackerMiddleware for every failed login/signup attempt.
        // ============================================================
        [HttpGet("stats")]
        public async Task<IActionResult> GetStats()
        {
            var events = await _context.AtoTrackerEvents.ToListAsync();

            return Ok(new
            {
                totalEvents = events.Count,
                blockedEvents = events.Count(e => e.Action == "blocked"),
                challengedEvents = events.Count(e => e.Action == "challenged"),
                uniqueIPs = events.Select(e => e.Ip).Distinct().Count(),
            });
        }

        [HttpGet("events")]
        public async Task<IActionResult> GetEvents([FromQuery] int limit = 100)
        {
            var events = await _context.AtoTrackerEvents
                .OrderByDescending(e => e.Timestamp)
                .Take(Math.Clamp(limit, 1, 500))
                .ToListAsync();

            return Ok(events);
        }

        // ============================================================
        // Active locks — enumerated directly from Redis (ato_lock:* keys set by
        // ATOTrackerMiddleware when a tracked IP/fingerprint crosses the failure threshold),
        // not a DB table, since a lock is inherently a live, TTL-expiring state.
        // ============================================================
        [HttpGet("locks")]
        public async Task<IActionResult> GetLocks()
        {
            var keys = await _redis.ScanKeysWithTtlAsync("ato_lock:*");
            var activeLocks = keys
                .Select(k => new
                {
                    fingerprint = k.Key.Substring("ato_lock:".Length),
                    ttlSeconds = k.Ttl.HasValue ? (int)k.Ttl.Value.TotalSeconds : 0,
                })
                .OrderByDescending(l => l.ttlSeconds)
                .ToArray();

            return Ok(new { active_locks = activeLocks, count = activeLocks.Length });
        }

        [HttpDelete("locks/{fingerprint}")]
        public async Task<IActionResult> ClearLock(string fingerprint)
        {
            if (!IsPlatformAdmin())
                return Forbid();

            await _redis.RemoveValueAsync($"ato_lock:{fingerprint}");
            await _redis.RemoveValueAsync($"ato_failures:{fingerprint}");
            return Ok(new { cleared = true, fingerprint });
        }
    }
}

using Microsoft.AspNetCore.Http;
using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using AffiniSecurity.Waf.Data;
using AffiniSecurity.Waf.Models;
using AffiniSecurity.Waf.Services;

namespace AffiniSecurity.Waf.Middleware
{
    public class ATOTrackerMiddleware
    {
        private readonly RequestDelegate _next;
        private readonly IRedisService _redis;

        public ATOTrackerMiddleware(RequestDelegate next, IRedisService redis)
        {
            _next = next;
            _redis = redis;
        }

        // Account-takeover / credential-stuffing tracker. Settings (thresholds, action,
        // fingerprint-vs-IP tracking, and which endpoints count as "auth") are loaded from the
        // ato_tracker_settings table (managed via GET/PUT /api/ato/config) rather than
        // hardcoded, so this is fully configurable from the Account Takeover dashboard. Every
        // failure and every triggered lockout is persisted to ato_tracker_events so
        // /api/ato/stats and /api/ato/events reflect real activity, not fabricated numbers.
        public async Task InvokeAsync(HttpContext context, WafDbContext db)
        {
            try
            {
                var settings = await GetOrCreateSettingsAsync(db);
                if (!settings.Enabled)
                {
                    await _next(context);
                    return;
                }

                var path = context.Request.Path.Value ?? string.Empty;
                var authEndpoints = (settings.AuthEndpoints ?? string.Empty)
                    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
                var isAuth = authEndpoints.Length > 0
                    ? authEndpoints.Any(e => path.Contains(e, StringComparison.OrdinalIgnoreCase))
                    : (path.Contains("/api/auth/login") || path.Contains("/api/auth/signup"));

                var ip = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
                var fingerprint = context.Request.Headers["X-JA3-Fingerprint"].ToString();
                var trackKey = settings.TrackByFingerprint && !string.IsNullOrEmpty(fingerprint) ? fingerprint : ip;

                var failuresKey = $"ato_failures:{trackKey}";
                var lockKey = $"ato_lock:{trackKey}";

                if (isAuth)
                {
                    var locked = await _redis.GetValueAsync(lockKey);
                    if (locked != null)
                    {
                        if (settings.Action == "log")
                        {
                            // Log-only mode: never actually block, just observe.
                        }
                        else
                        {
                            context.Response.StatusCode = 429;
                            context.Response.ContentType = "application/json";
                            var msg = settings.Action == "challenge"
                                ? "{\"error\": \"Additional verification required due to repeated failed attempts.\"}"
                                : "{\"error\": \"Too many login attempts. Please try again later.\"}";
                            await context.Response.WriteAsync(msg);
                            return;
                        }
                    }
                }

                await _next(context);

                if (isAuth && context.Response.StatusCode == 401)
                {
                    var current = await _redis.GetValueAsync(failuresKey);
                    int nextCount = (current == null ? 0 : int.Parse(current)) + 1;
                    await _redis.SetValueAsync(failuresKey, nextCount.ToString(), TimeSpan.FromSeconds(settings.WindowSeconds));

                    var tripped = nextCount >= settings.MaxFailedAttempts;
                    if (tripped)
                    {
                        await _redis.SetValueAsync(lockKey, "1", TimeSpan.FromSeconds(settings.LockoutSeconds));
                    }

                    db.AtoTrackerEvents.Add(new AtoEvent
                    {
                        Ip = ip,
                        Fingerprint = string.IsNullOrEmpty(fingerprint) ? null : fingerprint,
                        TargetPath = path,
                        Failures = nextCount,
                        Action = tripped ? (settings.Action == "log" ? "logged" : settings.Action == "challenge" ? "challenged" : "blocked") : "logged",
                        Timestamp = DateTime.UtcNow,
                    });
                    await db.SaveChangesAsync();
                }
                else if (isAuth && context.Response.StatusCode == 200)
                {
                    await _redis.RemoveValueAsync(failuresKey);
                    await _redis.RemoveValueAsync(lockKey);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ATO] Error: {ex.Message}");
                // Fail-open: allow the request to proceed if the tracker fails
                if (!context.Response.HasStarted)
                {
                    await _next(context);
                }
            }
        }

        private static async Task<AtoSettings> GetOrCreateSettingsAsync(WafDbContext db)
        {
            var settings = await db.AtoTrackerSettings.IgnoreQueryFilters().FirstOrDefaultAsync(s => s.Id == "global");
            if (settings == null)
            {
                settings = new AtoSettings { Id = "global" };
                db.AtoTrackerSettings.Add(settings);
                await db.SaveChangesAsync();
            }
            return settings;
        }
    }
}


using System.Net;
using System.Threading.RateLimiting;
using AffiniSecurity.Waf.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using StackExchange.Redis;

namespace AffiniSecurity.Waf.Middleware
{
    public class DistributedRateLimiterMiddleware
    {
        private readonly RequestDelegate _next;
        private readonly IRedisService _redis;
        private readonly ILogger<DistributedRateLimiterMiddleware> _logger;

        // Configuration (Ideally moved to a settings service)
        private const int MaxRequestsPerMinute = 120;
        private const int BlockingDurationSeconds = 60;

        // Secondary, in-process rate limiter used only when Redis is unavailable (down,
        // unreachable, or the coordinated check throws). It approximates the same
        // MaxRequestsPerMinute/BlockingDurationSeconds policy per (tenant, IP) key so a Redis
        // outage degrades to per-instance-only enforcement instead of no enforcement at all.
        // Partitions are automatically evicted by the runtime once idle, so this does not leak
        // memory under high IP cardinality.
        private static readonly PartitionedRateLimiter<string> FallbackLimiter =
            PartitionedRateLimiter.Create<string, string>(key =>
                RateLimitPartition.GetSlidingWindowLimiter(key, _ => new SlidingWindowRateLimiterOptions
                {
                    PermitLimit = MaxRequestsPerMinute,
                    Window = TimeSpan.FromSeconds(BlockingDurationSeconds),
                    SegmentsPerWindow = 6,
                    QueueLimit = 0,
                    AutoReplenishment = true
                }));

        public DistributedRateLimiterMiddleware(RequestDelegate next, IRedisService redis, ILogger<DistributedRateLimiterMiddleware> logger)
        {
            _next = next;
            _redis = redis;
            _logger = logger;
        }

        public async Task InvokeAsync(HttpContext context)
        {
            var db = _redis.GetDatabase();

            // ── I1: Resolve real client IP from trusted Coraza/Nginx proxy ────────
            // X-Real-IP is set by the Coraza proxy to the actual downstream client IP.
            // Prefer it over RemoteIpAddress (which is the proxy socket address) to
            // prevent all tenant rate-limit budget being consumed by a single proxy IP.
            var realIp = context.Request.Headers["X-Real-IP"].ToString();
            var clientIp = !string.IsNullOrWhiteSpace(realIp)
                ? realIp.Trim()
                : (context.Connection.RemoteIpAddress?.ToString() ?? "unknown");

            var tenantId = context.Items["TenantId"]?.ToString() ?? "global";
            var key = $"ratelimit:{tenantId}:{clientIp}";

            if (db == null)
            {
                if (!await TryAcquireFallbackAsync(context, key, clientIp, tenantId))
                {
                    return;
                }
                await _next(context);
                return;
            }

            var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            var windowStart = now - (BlockingDurationSeconds * 1000);
            var member = $"{now}:{Guid.NewGuid()}";

            try
            {
                var tx = db.CreateTransaction();
                _ = tx.SortedSetRemoveRangeByScoreAsync(key, 0, windowStart);
                _ = tx.SortedSetAddAsync(key, member, now);
                var countTask = tx.SortedSetLengthAsync(key);
                _ = tx.KeyExpireAsync(key, TimeSpan.FromSeconds(BlockingDurationSeconds + 5));

                await tx.ExecuteAsync();
                var count = await countTask;

                if (count > MaxRequestsPerMinute)
                {
                    _logger.LogWarning($"[RateLimit] Blocked {clientIp} for Tenant {tenantId}. Count: {count}");
                    await RejectAsync(context);
                    return;
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing distributed rate limit; falling back to in-process limiter for this request.");
                // Redis is down/unreachable: don't fail fully open. Enforce the same policy via
                // the in-memory fallback limiter instead, so this instance still protects itself.
                if (!await TryAcquireFallbackAsync(context, key, clientIp, tenantId))
                {
                    return;
                }
            }

            await _next(context);
        }

        private async Task<bool> TryAcquireFallbackAsync(HttpContext context, string key, string clientIp, string tenantId)
        {
            using var lease = FallbackLimiter.AttemptAcquire(key);
            if (lease.IsAcquired)
            {
                return true;
            }

            _logger.LogWarning($"[RateLimit:Fallback] Blocked {clientIp} for Tenant {tenantId} via in-process limiter (Redis unavailable).");
            await RejectAsync(context);
            return false;
        }

        private async Task RejectAsync(HttpContext context)
        {
            context.Response.StatusCode = (int)HttpStatusCode.TooManyRequests;
            context.Response.Headers["Retry-After"] = BlockingDurationSeconds.ToString();
            await context.Response.WriteAsJsonAsync(new
            {
                error = "Too Many Requests",
                message = "You have exceeded the global rate limit for this service.",
                retry_after = BlockingDurationSeconds
            });
        }
    }
}


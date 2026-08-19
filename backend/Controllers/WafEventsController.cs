using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using AffiniSecurity.Waf.Services;
using AffiniSecurity.Waf.Data;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace AffiniSecurity.Waf.Controllers
{
    [ApiController]
    public class WafEventsController : ControllerBase
    {
        public class WafEventDto
        {
            public string TenantId { get; set; } = "";
            public string Url { get; set; } = "";
            public string Method { get; set; } = "";
            public double AnomalyScore { get; set; }
            public double MLScore { get; set; }
            public double ASTScore { get; set; }
            public string[] Matches { get; set; } = System.Array.Empty<string>();
            public string Ja4 { get; set; } = "";
            public bool SchemaDeviation { get; set; }
        }

        [AllowAnonymous]
        [HttpPost("api/internal/waf-events")]
        public async Task<IActionResult> ReportWafEvent([FromServices] IClickHouseService clickhouse)
        {
            var request = HttpContext.Request;
            var timestamp = request.Headers["X-Sidecar-Timestamp"].ToString();
            var signature = request.Headers["X-Sidecar-Signature"].ToString();

            if (string.IsNullOrEmpty(timestamp) || string.IsNullOrEmpty(signature))
            {
                System.Console.WriteLine("[WafEventsController] Rejected: missing signature headers.");
                return Unauthorized("Missing signature headers");
            }

            if (!long.TryParse(timestamp, out long tsUnix))
            {
                System.Console.WriteLine("[WafEventsController] Rejected: invalid timestamp format.");
                return Unauthorized("Invalid timestamp format");
            }

            var nowUnix = System.DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            if (System.Math.Abs(nowUnix - tsUnix) > 300)
            {
                System.Console.WriteLine($"[WafEventsController] Rejected: request timestamp expired. Diff: {System.Math.Abs(nowUnix - tsUnix)}s");
                return Unauthorized("Request timestamp expired");
            }

            using var reader = new System.IO.StreamReader(request.Body);
            var bodyText = await reader.ReadToEndAsync();

            var secret = System.Environment.GetEnvironmentVariable("SIDECAR_SIGNING_SECRET");
            if (string.IsNullOrEmpty(secret))
            {
                secret = "fallback_sidecar_secret_2026";
            }

            var message = $"{timestamp}.{bodyText}";
            using (var hmac = new System.Security.Cryptography.HMACSHA256(System.Text.Encoding.UTF8.GetBytes(secret)))
            {
                var computedHash = hmac.ComputeHash(System.Text.Encoding.UTF8.GetBytes(message));
                var computedSig = System.Convert.ToHexString(computedHash).ToLowerInvariant();

                if (computedSig != signature.ToLowerInvariant())
                {
                    System.Console.WriteLine($"[WafEventsController] Rejected: signature mismatch. Got: {signature}, Computed: {computedSig}");
                    return Unauthorized("Invalid signature");
                }
            }

            var dto = System.Text.Json.JsonSerializer.Deserialize<WafEventDto>(bodyText, new System.Text.Json.JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            if (dto == null)
            {
                System.Console.WriteLine("[WafEventsController] Rejected: invalid JSON payload.");
                return BadRequest("Invalid JSON payload");
            }

            System.Console.WriteLine($"[WafEventsController] Received event report for tenant {dto.TenantId}. Score: {dto.AnomalyScore:F2}");
            // Pass SchemaDeviation via Ja4 or another parameter, or add SchemaDeviation parameter. We'll update the signature alongside.
            await clickhouse.InsertAiBlockedEventAsync(dto.TenantId, dto.Url, dto.Method, dto.AnomalyScore, dto.MLScore, dto.ASTScore, dto.Matches, dto.Ja4, dto.SchemaDeviation ? (byte)1 : (byte)0);
            return Ok(new { status = "success" });
        }

        [Authorize]
        [HttpGet("api/firewall/ai-events")]
        public async Task<IActionResult> GetAiBlockedEvents(
            [FromServices] IClickHouseService clickhouse,
            [FromServices] WafDbContext dbContext)
        {
            // JWT stores role as a custom "role" claim, not ClaimTypes.Role
            var role = User.FindFirst("role")?.Value
                    ?? User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value
                    ?? "";

            bool isPlatformAdmin = role == "super_admin" || role == "admin" || role == "support_engineer";

            if (isPlatformAdmin)
            {
                System.Console.WriteLine($"[WafEventsController] GET ai-events — role: {role}, returning all events");
                var allEvents = await clickhouse.GetAiBlockedEventsAsync("all_tenants");
                return Ok(allEvents);
            }

            // For tenant-scoped users: build a list of identifiers
            // The Go sidecar records TenantId as the request hostname (e.g. "acme.com")
            // not as the UUID, so we look up the tenant's domain names from Postgres too
            var tenantId = dbContext.CurrentTenantId ?? "";

            var domainNames = dbContext.Domains
                .IgnoreQueryFilters()
                .Where(d => d.TenantId == tenantId)
                .Select(d => d.DomainName)
                .ToList();

            // Build combined identifier list: UUID + all registered domain names
            var identifiers = new List<string> { tenantId };
            identifiers.AddRange(domainNames);

            System.Console.WriteLine($"[WafEventsController] GET ai-events — role: {role}, identifiers: [{string.Join(", ", identifiers)}]");

            var events = await clickhouse.GetAiBlockedEventsByIdentifiersAsync(identifiers);
            return Ok(events);
        }

        [Authorize]
        [HttpGet("api/firewall/ai-analytics")]
        public async Task<IActionResult> GetAnomalyAnalytics(
            [FromServices] IClickHouseService clickhouse)
        {
            var role = User.FindFirst("role")?.Value
                    ?? User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value
                    ?? "";

            bool isPlatformAdmin = role == "super_admin" || role == "admin" || role == "support_engineer";
            if (!isPlatformAdmin)
                return Forbid();

            var analytics = await clickhouse.GetAnomalyAnalyticsAsync();
            return Ok(analytics);
        }

        [Authorize(Policy = AffiniSecurity.Waf.Security.WafPolicies.RequireAnalyticsViewer)]
        [HttpGet("api/firewall/ai-health")]
        public async Task<IActionResult> GetAiHealth([FromServices] IRedisService redis)
        {
            var healthJson = await redis.GetValueAsync("sidecar:health");
            if (string.IsNullOrEmpty(healthJson))
            {
                return Ok(new
                {
                    status = "offline",
                    uptimeSeconds = 0,
                    memoryAllocBytes = 0u,
                    requestsTotal = 0u,
                    errorsTotal = 0u,
                    averageLatencyMs = 0.0,
                    timestamp = System.DateTimeOffset.UtcNow.ToUnixTimeSeconds()
                });
            }

            try
            {
                var health = System.Text.Json.JsonSerializer.Deserialize<System.Text.Json.Nodes.JsonNode>(healthJson);
                return Ok(health);
            }
            catch
            {
                return Ok(new
                {
                    status = "offline",
                    uptimeSeconds = 0,
                    memoryAllocBytes = 0u,
                    requestsTotal = 0u,
                    errorsTotal = 0u,
                    averageLatencyMs = 0.0,
                    timestamp = System.DateTimeOffset.UtcNow.ToUnixTimeSeconds()
                });
            }
        }
        [Authorize(Policy = AffiniSecurity.Waf.Security.WafPolicies.RequireAnalyticsViewer)]
        [HttpGet("api/firewall/ai-policy-overview")]
        public async Task<IActionResult> GetAiPolicyOverview(
            [FromServices] WafDbContext dbContext,
            [FromServices] IRedisService redis,
            [FromServices] IClickHouseService clickhouse)
        {
            // Load all tenants (including the platform tenant)
            var tenants = await dbContext.Tenants.IgnoreQueryFilters()
                .OrderBy(t => t.Name)
                .ToListAsync();

            // Load all SecuritySettings in one query
            var allSettings = await dbContext.SecuritySettings.IgnoreQueryFilters()
                .ToListAsync();
            var settingsMap = allSettings.ToDictionary(s => s.TenantId, s => s);

            // ClickHouse block counts per tenant-id/domain (last 24h)
            Dictionary<string, int> blockCounts;
            try { blockCounts = await clickhouse.GetAiBlockCountPerTenantAsync(); }
            catch { blockCounts = new Dictionary<string, int>(); }

            var now = System.DateTimeOffset.UtcNow.ToUnixTimeSeconds();

            var results = new List<object>();
            foreach (var tenant in tenants)
            {
                // Live Redis flag (may differ from DB if toggled recently)
                string? redisVal = null;
                try { redisVal = await redis.GetValueAsync($"tenant:ai:{tenant.Id}:enabled"); } catch { }

                bool aiEnabled;
                if (redisVal != null)
                    aiEnabled = redisVal.Trim('"') != "false";
                else
                {
                    settingsMap.TryGetValue(tenant.Id, out var s);
                    aiEnabled = s?.MlDetectionEnabled ?? true;
                }

                settingsMap.TryGetValue(tenant.Id, out var settings);
                var wafMode = settings?.WafMode ?? "detection";

                // Sum blocks across tenantId and any domain variants (domains use hostname as tenantId in ClickHouse)
                var domains = dbContext.Domains.IgnoreQueryFilters()
                    .Where(d => d.TenantId == tenant.Id)
                    .Select(d => d.DomainName)
                    .ToList();

                int blocks = 0;
                if (blockCounts.TryGetValue(tenant.Id, out var b)) blocks += b;
                foreach (var domain in domains)
                    if (blockCounts.TryGetValue(domain, out var db2)) blocks += db2;

                results.Add(new
                {
                    tenantId     = tenant.Id,
                    name         = tenant.Name,
                    industry     = tenant.Industry ?? "",
                    aiEnabled,
                    wafMode,
                    blocks24h    = blocks,
                    isActive     = tenant.IsActive,
                    updatedAt    = now
                });
            }

            return Ok(results);
        }

        [Authorize(Policy = AffiniSecurity.Waf.Security.WafPolicies.RequireAnalyticsViewer)]
        [HttpGet("api/firewall/global-threats")]
        public async Task<IActionResult> GetGlobalThreatCorrelation(
            [FromServices] IClickHouseService clickhouse,
            [FromServices] WafDbContext dbContext)
        {
            GlobalThreatReport report;
            try { report = await clickhouse.GetGlobalThreatCorrelationAsync(); }
            catch { report = new GlobalThreatReport(); }

            // Enrich TenantName from Postgres (best effort — ClickHouse TenantId may be UUID or hostname)
            var tenantIds = report.TopTargetedTenants.Select(t => t.TenantId).ToList();
            var tenants = await dbContext.Tenants
                .IgnoreQueryFilters()
                .Where(t => tenantIds.Contains(t.Id) || tenantIds.Contains(t.Name))
                .Select(t => new { t.Id, t.Name })
                .ToListAsync();

            var byId   = tenants.ToDictionary(t => t.Id,   t => t.Name, StringComparer.OrdinalIgnoreCase);
            var byName = tenants.ToDictionary(t => t.Name, t => t.Name, StringComparer.OrdinalIgnoreCase);

            foreach (var stat in report.TopTargetedTenants)
            {
                if (byId.TryGetValue(stat.TenantId, out var name))
                    stat.TenantName = name;
                else if (byName.TryGetValue(stat.TenantId, out var name2))
                    stat.TenantName = name2;
                else
                    stat.TenantName = stat.TenantId; // fallback: use raw id/hostname
            }

            return Ok(report);
        }
    }
}

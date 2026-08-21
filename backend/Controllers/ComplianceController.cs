using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using AffiniSecurity.Waf.Security;
using AffiniSecurity.Waf.Services;
using AffiniSecurity.Waf.Data;
using AffiniSecurity.Waf.Models;
using Microsoft.EntityFrameworkCore;

using NATS.Client;

namespace AffiniSecurity.Waf.Controllers
{
    [Authorize(Policy = WafPolicies.RequirePlatformAdmin)]
    [ApiController]
    [Route("api/compliance")]
    public class ComplianceController : ControllerBase
    {
        private readonly IAuditService _auditService;
        private readonly WafDbContext _context;
        private readonly IClickHouseService _clickHouseService;
        private readonly INatsService _natsService;
        private readonly ITenantService _tenantService;

        // Sectors that Ethiopian law/regulators (NBE, INSA) treat as critical infrastructure
        // and therefore require in-country data residency by default.
        private static readonly string[] RegulatedIndustries = { "Banking", "Finance", "Government", "Telecom", "Insurance", "Healthcare" };

        public ComplianceController(IAuditService auditService, WafDbContext context, IClickHouseService clickHouseService, INatsService natsService, ITenantService tenantService)
        {
            _auditService = auditService;
            _context = context;
            _clickHouseService = clickHouseService;
            _natsService = natsService;
            _tenantService = tenantService;
        }

        [HttpGet("status")]
        public async Task<IActionResult> GetComplianceStatus()
        {
            try
            {
                var isAuditIntact = await _auditService.VerifyIntegrityAsync();
                
                long totalRequests = 0;
                bool clickHouseConnected = false;
                try 
                {
                    totalRequests = await _clickHouseService.GetTotalRequestsAsync();
                    clickHouseConnected = true;
                } 
                catch { }

                bool natsConnected = false;
                try
                {
                    natsConnected = _natsService.GetConnection()?.State == ConnState.CONNECTED;
                }
                catch { }

                bool sidecarConnected = System.IO.File.Exists("/var/run/shared/ai.sock");

                return Ok(new
                {
                    Proclamations = new[]
                    {
                        new { Id = "958/2016", Name = "Computer Crime", Status = clickHouseConnected ? "Compliant" : "Violation Detected", Detail = "1-Year Metadata Retention Active via ClickHouse TTL" },
                        new { Id = "1321/2024", Name = "Data Protection", Status = isAuditIntact ? "Compliant" : "Violation Detected", Detail = "PII Scrubber Active & Immutable Audit Chain Enabled" },
                        new { Id = "808/2013", Name = "INSA Monitoring", Status = natsConnected ? "Active" : "Degraded/Offline", Detail = "Real-time SOC Streaming via NATS Operational" },
                        new { Id = "1205/2020", Name = "Electronic Transactions", Status = sidecarConnected ? "Resilient" : "Degraded", Detail = "Fault-Bypass Routing & AI Sidecar Active" }
                    },
                    AuditHealth = new
                    {
                        IsIntegrityVerified = isAuditIntact,
                        LastChecked = DateTime.UtcNow,
                        TotalAuditEntries = await _context.AuditLogs.IgnoreQueryFilters().CountAsync()
                    },
                    RetentionStatus = new
                    {
                        StorageTier = "ClickHouse (Warm)",
                        Ttl = "365 Days",
                        TotalObservedRequests = totalRequests
                    }
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Failed to load compliance status", error = ex.Message });
            }
        }

        [HttpPost("logs/verify")]
        public async Task<IActionResult> VerifyAuditIntegrity()
        {
            var isValid = await _auditService.VerifyIntegrityAsync();
            return Ok(new { isValid, timestamp = DateTime.UtcNow });
        }

        [HttpGet("report/export")]
        public async Task<IActionResult> ExportEvidenceReport()
        {
            try
            {
                var config = await _context.SystemConfigs.FirstOrDefaultAsync();
                var auditIntact = await _auditService.VerifyIntegrityAsync();
                long totalRequests = await _clickHouseService.GetTotalRequestsAsync();

                var report = new
                {
                    GenerationTimestamp = DateTime.UtcNow,
                    PlatformIdentifer = "AffiniSecurity-WAF-v2026",
                    CertificationNumber = config?.EcaCertificationNumber ?? "UNREGISTERED",
                    ComplianceAudit = new {
                        AuditIntegrity = auditIntact ? "VERIFIED" : "FAILURE",
                        TotalLogs = await _context.AuditLogs.IgnoreQueryFilters().CountAsync(),
                        IntegrityMechanism = "HMAC-SHA256-Chaining"
                    },
                    RetentionPolicy = new {
                        RetiontionPeriod = "365 Days",
                        EffectiveTTL = "Enabled",
                        CurrentVolume = totalRequests
                    },
                    TechnicalControls = new[] {
                        "Sensitive Data Redaction Middleware",
                        "Edge Proxy Anonymization",
                        "NATS Fault-Resilient Ingestion"
                    }
                };

                var json = System.Text.Json.JsonSerializer.Serialize(report, new System.Text.Json.JsonSerializerOptions { WriteIndented = true });
                var bytes = System.Text.Encoding.UTF8.GetBytes(json);
                return File(bytes, "application/json", $"Compliance_Evidence_{DateTime.UtcNow:yyyyMMdd}.json");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ComplianceExport] CRITICAL ERROR: {ex.Message}");
                Console.WriteLine(ex.StackTrace);
                return StatusCode(500, new { message = "Failed to generate compliance report", error = ex.Message });
            }
        }

        [HttpGet("insa/alerts")]
        public async Task<IActionResult> GetInsaAlertsFeed([FromQuery] string? startDate, [FromQuery] string? endDate, [FromQuery] string? severity)
        {
            var query = _context.AlertLogs.IgnoreQueryFilters().AsQueryable();

            if (!string.IsNullOrEmpty(startDate)) query = query.Where(a => a.Timestamp.CompareTo(startDate) >= 0);
            if (!string.IsNullOrEmpty(endDate)) query = query.Where(a => a.Timestamp.CompareTo(endDate) <= 0);
            if (!string.IsNullOrEmpty(severity)) query = query.Where(a => a.Severity == severity);

            var alerts = await query
                .OrderByDescending(a => a.Timestamp)
                .Take(500) // Caps at 500 per request for performance
                .Select(a => new {
                    eventId = a.Id,
                    timestamp = a.Timestamp,
                    sourceIp = a.Ip,
                    ruleFired = a.RuleId,
                    severity = a.Severity,
                    actionStatus = a.Action,
                    uri = a.Uri
                })
                .ToListAsync();

            return Ok(new
            {
                Provider = "AffiniSecurity",
                ReportingPeriod = new { Start = startDate, End = endDate },
                TotalEvents = alerts.Count,
                Data = alerts
            });
        }

        // ================================================================
        // Data Sovereignty: per-tenant residency zone management + inspection
        // ================================================================

        /// <summary>
        /// Single-screen inspection view: every tenant, its assigned zone, whether it's
        /// in-country, and whether that satisfies its sector's regulatory requirement.
        /// </summary>
        [HttpGet("data-sovereignty")]
        public async Task<IActionResult> GetDataSovereigntyOverview()
        {
            var zones = await _context.DataResidencyZones.IgnoreQueryFilters()
                .Where(z => z.IsActive)
                .OrderByDescending(z => z.IsInCountry).ThenBy(z => z.Name)
                .ToListAsync();
            var zonesByCode = zones.ToDictionary(z => z.Code, z => z);

            var tenants = await _context.Tenants.IgnoreQueryFilters()
                .Select(t => new
                {
                    t.Id,
                    t.Name,
                    t.Industry,
                    t.DataResidencyZoneCode,
                    t.DataResidencyLastVerifiedAt
                })
                .ToListAsync();

            var tenantRows = tenants.Select(t =>
            {
                var zoneCode = string.IsNullOrEmpty(t.DataResidencyZoneCode) ? "ET-ADDIS-DC1" : t.DataResidencyZoneCode;
                zonesByCode.TryGetValue(zoneCode, out var zone);
                var isInCountry = zone?.IsInCountry ?? false;
                var requiresInCountry = RegulatedIndustries.Contains(t.Industry ?? string.Empty, StringComparer.OrdinalIgnoreCase);
                return new
                {
                    tenantId = t.Id,
                    tenantName = t.Name,
                    industry = t.Industry,
                    zoneCode,
                    zoneName = zone?.Name ?? "Unknown Zone",
                    isInCountry,
                    requiresInCountry,
                    isCompliant = !requiresInCountry || isInCountry,
                    lastVerifiedAt = t.DataResidencyLastVerifiedAt
                };
            }).ToList();

            return Ok(new
            {
                Zones = zones.Select(z => new
                {
                    z.Code,
                    z.Name,
                    z.CountryCode,
                    z.FacilityProvider,
                    z.IsInCountry,
                    z.IsDefault,
                    TenantCount = tenantRows.Count(t => t.zoneCode == z.Code)
                }),
                Tenants = tenantRows.OrderByDescending(t => !t.isCompliant).ThenBy(t => t.tenantName),
                Summary = new
                {
                    TotalTenants = tenantRows.Count,
                    InCountryCount = tenantRows.Count(t => t.isInCountry),
                    RegulatedCount = tenantRows.Count(t => t.requiresInCountry),
                    NonCompliantCount = tenantRows.Count(t => !t.isCompliant)
                }
            });
        }

        [HttpGet("data-sovereignty/zones")]
        public async Task<IActionResult> GetResidencyZones()
        {
            var zones = await _context.DataResidencyZones.IgnoreQueryFilters()
                .OrderByDescending(z => z.IsInCountry).ThenBy(z => z.Name)
                .ToListAsync();
            return Ok(zones);
        }

        public class CreateResidencyZoneRequest
        {
            public string Code { get; set; } = string.Empty;
            public string Name { get; set; } = string.Empty;
            public string CountryCode { get; set; } = "ET";
            public string? FacilityProvider { get; set; }
            public bool IsInCountry { get; set; } = true;
        }

        [HttpPost("data-sovereignty/zones")]
        public async Task<IActionResult> CreateResidencyZone([FromBody] CreateResidencyZoneRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.Code) || string.IsNullOrWhiteSpace(req.Name))
                return BadRequest(new { message = "Zone code and name are required." });

            var exists = await _context.DataResidencyZones.IgnoreQueryFilters().AnyAsync(z => z.Code == req.Code);
            if (exists) return Conflict(new { message = $"Zone code '{req.Code}' already exists." });

            var zone = new DataResidencyZone
            {
                Code = req.Code.Trim(),
                Name = req.Name.Trim(),
                CountryCode = string.IsNullOrWhiteSpace(req.CountryCode) ? "ET" : req.CountryCode,
                FacilityProvider = req.FacilityProvider,
                IsInCountry = req.IsInCountry
            };
            _context.DataResidencyZones.Add(zone);
            await _context.SaveChangesAsync();
            await _auditService.LogActionAsync(null, _tenantService.UserEmail, "CREATE_RESIDENCY_ZONE", "DataResidencyZone", zone.Id, null, zone);

            return Ok(zone);
        }

        public class AssignResidencyRequest
        {
            public string ZoneCode { get; set; } = string.Empty;
            public string? Reason { get; set; }
        }

        /// <summary>
        /// Reassigns a tenant to a new residency zone. Every change is written both to the
        /// tamper-evident audit chain and to a dedicated assignment history row, so an
        /// inspector (or INSA) can see the full "who moved what data where, and why" trail
        /// for a single tenant without cross-referencing unrelated audit events.
        /// </summary>
        [HttpPut("data-sovereignty/tenants/{tenantId}")]
        public async Task<IActionResult> AssignTenantResidencyZone(string tenantId, [FromBody] AssignResidencyRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.ZoneCode))
                return BadRequest(new { message = "zoneCode is required." });

            var tenant = await _context.Tenants.IgnoreQueryFilters().FirstOrDefaultAsync(t => t.Id == tenantId);
            if (tenant == null) return NotFound(new { message = "Tenant not found." });

            var zone = await _context.DataResidencyZones.IgnoreQueryFilters().FirstOrDefaultAsync(z => z.Code == req.ZoneCode && z.IsActive);
            if (zone == null) return BadRequest(new { message = "Unknown or inactive residency zone." });

            var requiresInCountry = RegulatedIndustries.Contains(tenant.Industry ?? string.Empty, StringComparer.OrdinalIgnoreCase);
            if (requiresInCountry && !zone.IsInCountry && string.IsNullOrWhiteSpace(req.Reason))
            {
                return BadRequest(new { message = $"Tenant industry '{tenant.Industry}' requires in-country residency. Provide a documented exception reason to override." });
            }

            var previousZoneCode = tenant.DataResidencyZoneCode;
            tenant.DataResidencyZoneCode = zone.Code;
            tenant.DataResidencyLastVerifiedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();

            var assignment = new DataResidencyAssignment
            {
                TenantId = tenantId,
                ZoneCode = zone.Code,
                PreviousZoneCode = previousZoneCode,
                Reason = req.Reason,
                ChangedByEmail = _tenantService.UserEmail
            };
            _context.DataResidencyAssignments.Add(assignment);
            await _context.SaveChangesAsync();

            await _auditService.LogActionAsync(null, _tenantService.UserEmail, "ASSIGN_DATA_RESIDENCY", "Tenant", tenantId,
                new { zone = previousZoneCode }, new { zone = zone.Code, reason = req.Reason });

            return Ok(new { tenantId, zoneCode = zone.Code, zoneName = zone.Name, isInCountry = zone.IsInCountry });
        }

        /// <summary>Full inspectable history of residency changes, optionally scoped to one tenant.</summary>
        [HttpGet("data-sovereignty/history")]
        public async Task<IActionResult> GetResidencyHistory([FromQuery] string? tenantId)
        {
            var query = _context.DataResidencyAssignments.IgnoreQueryFilters().AsQueryable();
            if (!string.IsNullOrEmpty(tenantId)) query = query.Where(a => a.TenantId == tenantId);

            var history = await query
                .OrderByDescending(a => a.ChangedAt)
                .Take(200)
                .ToListAsync();

            return Ok(history);
        }
    }
}

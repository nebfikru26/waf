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
        private readonly IDataSovereigntyService _sovereigntyService;
        private readonly IIncidentClockService _incidentClockService;

        public ComplianceController(IAuditService auditService, WafDbContext context, IClickHouseService clickHouseService, INatsService natsService, ITenantService tenantService, IDataSovereigntyService sovereigntyService, IIncidentClockService incidentClockService)
        {
            _auditService = auditService;
            _context = context;
            _clickHouseService = clickHouseService;
            _natsService = natsService;
            _tenantService = tenantService;
            _sovereigntyService = sovereigntyService;
            _incidentClockService = incidentClockService;
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
            var overview = await _sovereigntyService.GetOverviewAsync();

            return Ok(new
            {
                Zones = overview.Zones.Select(z => new
                {
                    z.Code,
                    z.Name,
                    z.CountryCode,
                    z.FacilityProvider,
                    z.IsInCountry,
                    z.IsDefault,
                    z.AllowedDataClasses,
                    TenantCount = overview.Tenants.Count(t => t.ZoneCode == z.Code)
                }),
                Tenants = overview.Tenants.Select(t => new
                {
                    tenantId = t.TenantId,
                    tenantName = t.TenantName,
                    industry = t.Industry,
                    zoneCode = t.ZoneCode,
                    zoneName = t.ZoneName,
                    isInCountry = t.IsInCountry,
                    requiresInCountry = t.RequiresInCountry,
                    isCompliant = t.IsCompliant,
                    lastVerifiedAt = t.LastVerifiedAt
                }),
                Summary = new
                {
                    TotalTenants = overview.TotalTenants,
                    InCountryCount = overview.InCountryCount,
                    RegulatedCount = overview.RegulatedCount,
                    NonCompliantCount = overview.NonCompliantCount
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
            public string AllowedDataClasses { get; set; } = "PII,Logs,Audit,Static,Cache";
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
                IsInCountry = req.IsInCountry,
                AllowedDataClasses = string.IsNullOrWhiteSpace(req.AllowedDataClasses) ? "Static,Cache" : req.AllowedDataClasses
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

            var requiresInCountry = _sovereigntyService.RequiresInCountryResidency(tenant.Industry);
            var zoneClasses = (zone.AllowedDataClasses ?? string.Empty).Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            var hasRegulatedClasses = _sovereigntyService.RegulatedDataClasses.All(c => zoneClasses.Contains(c, StringComparer.OrdinalIgnoreCase));

            if (requiresInCountry && (!zone.IsInCountry || !hasRegulatedClasses) && string.IsNullOrWhiteSpace(req.Reason))
            {
                var problem = !zone.IsInCountry ? "is outside Ethiopia" : "does not permit PII/Logs/Audit data classes";
                return BadRequest(new { message = $"Tenant industry '{tenant.Industry}' requires in-country residency for PII/Logs/Audit, but zone '{zone.Name}' {problem}. Provide a documented exception reason to override." });
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

        // ================================================================
        // Incident Reporting Clocks: INSA CERT (48h) / Data Breach (72h) SLAs
        // ================================================================

        /// <summary>List incident clocks, optionally filtered by status (Open, CertReported, BreachReported, Resolved, Overdue).</summary>
        [HttpGet("incidents")]
        public async Task<IActionResult> GetIncidentClocks([FromQuery] string? status, [FromQuery] string? tenantId)
        {
            var query = _context.IncidentClocks.IgnoreQueryFilters().AsQueryable();
            if (!string.IsNullOrEmpty(status)) query = query.Where(i => i.Status == status);
            if (!string.IsNullOrEmpty(tenantId)) query = query.Where(i => i.TenantId == tenantId);

            var clocks = await query.OrderByDescending(i => i.DetectedAt).Take(200).ToListAsync();
            return Ok(clocks);
        }

        public class OpenIncidentRequest
        {
            public string TenantId { get; set; } = string.Empty;
            public string Title { get; set; } = string.Empty;
            public string Severity { get; set; } = "HIGH";
        }

        /// <summary>Manually open an incident clock (e.g. for an incident not surfaced by the WAF, like a physical breach or 3rd-party leak).</summary>
        [HttpPost("incidents")]
        public async Task<IActionResult> OpenIncident([FromBody] OpenIncidentRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.TenantId) || string.IsNullOrWhiteSpace(req.Title))
                return BadRequest(new { message = "tenantId and title are required." });

            var clock = await _incidentClockService.OpenAsync(req.TenantId, req.Title, req.Severity);
            await _auditService.LogActionAsync(null, _tenantService.UserEmail, "OPEN_INCIDENT_CLOCK", "IncidentClock", clock.Id, null, clock);
            return Ok(clock);
        }

        public class ReportIncidentRequest
        {
            public string? Notes { get; set; }
        }

        /// <summary>Marks the incident as reported to the INSA National CERT (satisfies the 48h deadline).</summary>
        [HttpPost("incidents/{id}/report-cert")]
        public async Task<IActionResult> ReportIncidentToCert(string id, [FromBody] ReportIncidentRequest req)
        {
            var clock = await _incidentClockService.MarkCertReportedAsync(id, _tenantService.UserEmail);
            if (clock == null) return NotFound();
            await _auditService.LogActionAsync(null, _tenantService.UserEmail, "REPORT_INCIDENT_CERT", "IncidentClock", id, null, new { req.Notes });
            return Ok(clock);
        }

        /// <summary>Marks the incident as reported as a personal-data breach (satisfies the 72h deadline).</summary>
        [HttpPost("incidents/{id}/report-breach")]
        public async Task<IActionResult> ReportIncidentAsBreach(string id, [FromBody] ReportIncidentRequest req)
        {
            var clock = await _incidentClockService.MarkBreachReportedAsync(id, _tenantService.UserEmail);
            if (clock == null) return NotFound();
            await _auditService.LogActionAsync(null, _tenantService.UserEmail, "REPORT_INCIDENT_BREACH", "IncidentClock", id, null, new { req.Notes });
            return Ok(clock);
        }

        /// <summary>Closes out an incident clock once fully handled.</summary>
        [HttpPost("incidents/{id}/resolve")]
        public async Task<IActionResult> ResolveIncident(string id, [FromBody] ReportIncidentRequest req)
        {
            var clock = await _incidentClockService.ResolveAsync(id, req.Notes);
            if (clock == null) return NotFound();
            await _auditService.LogActionAsync(null, _tenantService.UserEmail, "RESOLVE_INCIDENT", "IncidentClock", id, null, new { req.Notes });
            return Ok(clock);
        }

        // ================================================================
        // Data Processing Register + DPIA (Proclamation 1321/2024 processing-register obligation)
        // ================================================================

        [HttpGet("processing-register")]
        public async Task<IActionResult> GetProcessingRegister([FromQuery] string? tenantId)
        {
            var query = _context.DataProcessingRecords.IgnoreQueryFilters().AsQueryable();
            if (!string.IsNullOrEmpty(tenantId)) query = query.Where(r => r.TenantId == tenantId);

            var records = await query.OrderByDescending(r => r.UpdatedAt).ToListAsync();
            return Ok(records);
        }

        public class ProcessingRecordRequest
        {
            public string TenantId { get; set; } = string.Empty;
            public string Purpose { get; set; } = string.Empty;
            public string DataCategories { get; set; } = string.Empty;
            public string LegalBasis { get; set; } = "Contract";
            public string RetentionPeriod { get; set; } = "365 Days";
            public string? SubProcessors { get; set; }
            public bool DpiaRequired { get; set; } = false;
            public string? DpiaSummary { get; set; }
        }

        [HttpPost("processing-register")]
        public async Task<IActionResult> CreateProcessingRecord([FromBody] ProcessingRecordRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.TenantId) || string.IsNullOrWhiteSpace(req.Purpose))
                return BadRequest(new { message = "tenantId and purpose are required." });

            var record = new DataProcessingRecord
            {
                TenantId = req.TenantId,
                Purpose = req.Purpose,
                DataCategories = req.DataCategories,
                LegalBasis = req.LegalBasis,
                RetentionPeriod = req.RetentionPeriod,
                SubProcessors = req.SubProcessors,
                DpiaRequired = req.DpiaRequired,
                DpiaSummary = req.DpiaSummary,
                DpiaCompletedAt = !string.IsNullOrWhiteSpace(req.DpiaSummary) ? DateTime.UtcNow : null
            };
            _context.DataProcessingRecords.Add(record);
            await _context.SaveChangesAsync();
            await _auditService.LogActionAsync(null, _tenantService.UserEmail, "CREATE_PROCESSING_RECORD", "DataProcessingRecord", record.Id, null, record);

            return Ok(record);
        }

        [HttpPut("processing-register/{id}")]
        public async Task<IActionResult> UpdateProcessingRecord(string id, [FromBody] ProcessingRecordRequest req)
        {
            var record = await _context.DataProcessingRecords.IgnoreQueryFilters().FirstOrDefaultAsync(r => r.Id == id);
            if (record == null) return NotFound();

            var before = new { record.Purpose, record.DataCategories, record.LegalBasis, record.RetentionPeriod, record.SubProcessors, record.DpiaRequired, record.DpiaSummary };

            record.Purpose = req.Purpose;
            record.DataCategories = req.DataCategories;
            record.LegalBasis = req.LegalBasis;
            record.RetentionPeriod = req.RetentionPeriod;
            record.SubProcessors = req.SubProcessors;
            record.DpiaRequired = req.DpiaRequired;
            if (!string.IsNullOrWhiteSpace(req.DpiaSummary) && record.DpiaSummary != req.DpiaSummary)
            {
                record.DpiaSummary = req.DpiaSummary;
                record.DpiaCompletedAt = DateTime.UtcNow;
            }
            record.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();
            await _auditService.LogActionAsync(null, _tenantService.UserEmail, "UPDATE_PROCESSING_RECORD", "DataProcessingRecord", id, before, record);

            return Ok(record);
        }

        [HttpDelete("processing-register/{id}")]
        public async Task<IActionResult> DeleteProcessingRecord(string id)
        {
            var record = await _context.DataProcessingRecords.IgnoreQueryFilters().FirstOrDefaultAsync(r => r.Id == id);
            if (record == null) return NotFound();

            _context.DataProcessingRecords.Remove(record);
            await _context.SaveChangesAsync();
            await _auditService.LogActionAsync(null, _tenantService.UserEmail, "DELETE_PROCESSING_RECORD", "DataProcessingRecord", id, record, null);

            return Ok(new { deleted = true });
        }

        // ================================================================
        // Key Custody: proves encryption keys — not just data — stay in-country
        // ================================================================

        [HttpGet("key-custody")]
        public async Task<IActionResult> GetKeyCustodyRecords()
        {
            var records = await _context.KeyCustodyRecords.IgnoreQueryFilters().OrderBy(k => k.Scope).ToListAsync();
            return Ok(records);
        }

        public class KeyCustodyRequest
        {
            public string? TenantId { get; set; }
            public string Scope { get; set; } = string.Empty;
            public string KeyManagementSystem { get; set; } = string.Empty;
            public bool IsInCountry { get; set; } = true;
            public string? Custodian { get; set; }
        }

        [HttpPost("key-custody")]
        public async Task<IActionResult> CreateKeyCustodyRecord([FromBody] KeyCustodyRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.Scope) || string.IsNullOrWhiteSpace(req.KeyManagementSystem))
                return BadRequest(new { message = "scope and keyManagementSystem are required." });

            var record = new KeyCustodyRecord
            {
                TenantId = req.TenantId,
                Scope = req.Scope,
                KeyManagementSystem = req.KeyManagementSystem,
                IsInCountry = req.IsInCountry,
                Custodian = req.Custodian
            };
            _context.KeyCustodyRecords.Add(record);
            await _context.SaveChangesAsync();
            await _auditService.LogActionAsync(null, _tenantService.UserEmail, "CREATE_KEY_CUSTODY_RECORD", "KeyCustodyRecord", record.Id, null, record);

            return Ok(record);
        }

        [HttpPost("key-custody/{id}/verify")]
        public async Task<IActionResult> VerifyKeyCustodyRecord(string id)
        {
            var record = await _context.KeyCustodyRecords.IgnoreQueryFilters().FirstOrDefaultAsync(k => k.Id == id);
            if (record == null) return NotFound();

            record.VerifiedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();
            return Ok(record);
        }

        // ================================================================
        // Certified Third-Party Audit Package: bundles every governance
        // artifact into one export so an INSA-certified auditor can self-serve.
        // ================================================================

        [HttpGet("audit-package/export")]
        public async Task<IActionResult> ExportAuditPackage()
        {
            try
            {
                var sovereignty = await _sovereigntyService.GetOverviewAsync();
                var residencyHistory = await _context.DataResidencyAssignments.IgnoreQueryFilters().OrderByDescending(a => a.ChangedAt).Take(500).ToListAsync();
                var incidents = await _context.IncidentClocks.IgnoreQueryFilters().OrderByDescending(i => i.DetectedAt).Take(500).ToListAsync();
                var processingRegister = await _context.DataProcessingRecords.IgnoreQueryFilters().ToListAsync();
                var keyCustody = await _context.KeyCustodyRecords.IgnoreQueryFilters().ToListAsync();
                var auditIntact = await _auditService.VerifyIntegrityAsync();
                var config = await _context.SystemConfigs.FirstOrDefaultAsync();

                using var ms = new System.IO.MemoryStream();
                using (var zip = new System.IO.Compression.ZipArchive(ms, System.IO.Compression.ZipArchiveMode.Create, true))
                {
                    void WriteJson(string name, object payload)
                    {
                        var entry = zip.CreateEntry(name, System.IO.Compression.CompressionLevel.Optimal);
                        using var entryStream = entry.Open();
                        using var writer = new System.IO.StreamWriter(entryStream);
                        writer.Write(System.Text.Json.JsonSerializer.Serialize(payload, new System.Text.Json.JsonSerializerOptions { WriteIndented = true }));
                    }

                    WriteJson("00_manifest.json", new
                    {
                        GeneratedAt = DateTime.UtcNow,
                        Platform = "AffiniSecurity-WAF-v2026",
                        CertificationNumber = config?.EcaCertificationNumber ?? "UNREGISTERED",
                        Contents = new[] {
                            "01_data_residency_overview.json",
                            "02_residency_change_history.json",
                            "03_incident_reporting_clocks.json",
                            "04_data_processing_register.json",
                            "05_key_custody_records.json",
                            "06_audit_chain_integrity.json"
                        }
                    });
                    WriteJson("01_data_residency_overview.json", sovereignty);
                    WriteJson("02_residency_change_history.json", residencyHistory);
                    WriteJson("03_incident_reporting_clocks.json", incidents);
                    WriteJson("04_data_processing_register.json", processingRegister);
                    WriteJson("05_key_custody_records.json", keyCustody);
                    WriteJson("06_audit_chain_integrity.json", new
                    {
                        AuditIntegrity = auditIntact ? "VERIFIED" : "FAILURE",
                        TotalLogs = await _context.AuditLogs.IgnoreQueryFilters().CountAsync(),
                        IntegrityMechanism = "HMAC-SHA256-Chaining"
                    });
                }

                await _auditService.LogActionAsync(null, _tenantService.UserEmail, "EXPORT_AUDIT_PACKAGE", "AuditPackage", "bundle", null, new { generatedAt = DateTime.UtcNow });

                return File(ms.ToArray(), "application/zip", $"INSA_Audit_Package_{DateTime.UtcNow:yyyyMMdd}.zip");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[AuditPackageExport] CRITICAL ERROR: {ex.Message}");
                return StatusCode(500, new { message = "Failed to generate audit package", error = ex.Message });
            }
        }
    }
}

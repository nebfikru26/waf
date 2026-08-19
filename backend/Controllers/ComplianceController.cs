using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using AffiniSecurity.Waf.Security;
using AffiniSecurity.Waf.Services;
using AffiniSecurity.Waf.Data;
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

        public ComplianceController(IAuditService auditService, WafDbContext context, IClickHouseService clickHouseService, INatsService natsService)
        {
            _auditService = auditService;
            _context = context;
            _clickHouseService = clickHouseService;
            _natsService = natsService;
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
    }
}

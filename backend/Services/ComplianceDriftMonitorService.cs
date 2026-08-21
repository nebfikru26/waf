using System;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using AffiniSecurity.Waf.Data;
using AffiniSecurity.Waf.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace AffiniSecurity.Waf.Services
{
    /// <summary>
    /// Continuously re-evaluates data residency compliance for every tenant (rather than only at
    /// assignment time) and raises a visible alert the moment a regulated tenant drifts out of
    /// compliance — e.g. because its Industry was reclassified, or a zone's data classes changed.
    /// INSA's SOC/monitoring obligations expect continuous monitoring, not point-in-time checks.
    /// </summary>
    public class ComplianceDriftMonitorService : BackgroundService
    {
        private readonly ILogger<ComplianceDriftMonitorService> _logger;
        private readonly IServiceScopeFactory _scopeFactory;
        private static readonly TimeSpan CheckInterval = TimeSpan.FromHours(6);
        private static readonly TimeSpan ReAlertCooldown = TimeSpan.FromHours(24);

        public ComplianceDriftMonitorService(ILogger<ComplianceDriftMonitorService> logger, IServiceScopeFactory scopeFactory)
        {
            _logger = logger;
            _scopeFactory = scopeFactory;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("[ComplianceDriftMonitor] Started. Checking data residency compliance every {Interval}.", CheckInterval);

            // Small initial delay so the DB/other services finish bootstrapping first.
            await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    await RunCheckAsync(stoppingToken);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "[ComplianceDriftMonitor] Check cycle failed.");
                }

                try { await Task.Delay(CheckInterval, stoppingToken); } catch (TaskCanceledException) { }
            }
        }

        private async Task RunCheckAsync(CancellationToken stoppingToken)
        {
            using var scope = _scopeFactory.CreateScope();
            var sovereignty = scope.ServiceProvider.GetRequiredService<IDataSovereigntyService>();
            var db = scope.ServiceProvider.GetRequiredService<WafDbContext>();
            var nats = scope.ServiceProvider.GetService<INatsService>();

            var nonCompliant = await sovereignty.GetNonCompliantTenantsAsync();
            if (nonCompliant.Count == 0)
            {
                _logger.LogInformation("[ComplianceDriftMonitor] All regulated tenants compliant.");
                return;
            }

            var cutoff = DateTime.UtcNow - ReAlertCooldown;
            foreach (var tenant in nonCompliant)
            {
                var alreadyAlerted = await db.AlertLogs.IgnoreQueryFilters()
                    .Where(a => a.TenantId == tenant.TenantId && a.RuleId == "COMPLIANCE_DRIFT")
                    .OrderByDescending(a => a.Timestamp)
                    .Select(a => a.Timestamp)
                    .FirstOrDefaultAsync(stoppingToken);

                if (!string.IsNullOrEmpty(alreadyAlerted) && DateTime.TryParse(alreadyAlerted, out var lastAlertTime) && lastAlertTime > cutoff)
                {
                    continue; // Already raised recently, don't spam.
                }

                var message = $"Tenant '{tenant.TenantName}' (industry: {tenant.Industry}) requires in-country data residency but is currently assigned to zone '{tenant.ZoneName}'.";

                var alert = new AlertLog
                {
                    Id = Guid.NewGuid().ToString(),
                    TenantId = tenant.TenantId,
                    Ip = "internal",
                    RuleId = "COMPLIANCE_DRIFT",
                    Rule = message,
                    Uri = "/api/compliance/data-sovereignty",
                    Timestamp = DateTime.UtcNow.ToString("O"),
                    Severity = "CRITICAL",
                    Action = "ALERT"
                };
                db.AlertLogs.Add(alert);
                _logger.LogWarning("[ComplianceDriftMonitor] {Message}", message);

                if (nats != null)
                {
                    try
                    {
                        var payload = JsonSerializer.Serialize(new
                        {
                            tenantId = tenant.TenantId,
                            tenantName = tenant.TenantName,
                            zoneCode = tenant.ZoneCode,
                            message,
                            severity = "CRITICAL",
                            timestamp = alert.Timestamp
                        });
                        nats.Publish("waf.compliance.drift", payload);
                        nats.Publish("waf.events.crs", payload);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "[ComplianceDriftMonitor] Failed to publish NATS drift alert.");
                    }
                }
            }

            await db.SaveChangesAsync(stoppingToken);
        }
    }
}

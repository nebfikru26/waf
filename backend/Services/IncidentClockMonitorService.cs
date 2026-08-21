using System;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace AffiniSecurity.Waf.Services
{
    /// <summary>
    /// Periodically sweeps open incident reporting clocks and flags any that have passed the
    /// INSA CERT (48h) or breach-notification (72h) deadline without being reported, publishing
    /// a NATS alert so the miss is surfaced immediately rather than discovered during an audit.
    /// </summary>
    public class IncidentClockMonitorService : BackgroundService
    {
        private readonly ILogger<IncidentClockMonitorService> _logger;
        private readonly IServiceScopeFactory _scopeFactory;
        private static readonly TimeSpan SweepInterval = TimeSpan.FromMinutes(15);

        public IncidentClockMonitorService(ILogger<IncidentClockMonitorService> logger, IServiceScopeFactory scopeFactory)
        {
            _logger = logger;
            _scopeFactory = scopeFactory;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("[IncidentClockMonitor] Started. Sweeping incident deadlines every {Interval}.", SweepInterval);
            await Task.Delay(TimeSpan.FromSeconds(20), stoppingToken);

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    using var scope = _scopeFactory.CreateScope();
                    var incidentService = scope.ServiceProvider.GetRequiredService<IIncidentClockService>();
                    var nats = scope.ServiceProvider.GetService<INatsService>();

                    var overdue = await incidentService.SweepOverdueAsync(stoppingToken);
                    foreach (var clock in overdue)
                    {
                        _logger.LogWarning("[IncidentClockMonitor] Incident '{Title}' for tenant {TenantId} is now OVERDUE for regulatory reporting.", clock.Title, clock.TenantId);
                        if (nats != null)
                        {
                            try
                            {
                                var payload = JsonSerializer.Serialize(new
                                {
                                    incidentId = clock.Id,
                                    tenantId = clock.TenantId,
                                    title = clock.Title,
                                    certDeadline = clock.CertDeadline,
                                    breachDeadline = clock.BreachDeadline,
                                    severity = "CRITICAL",
                                    message = $"Regulatory reporting deadline missed for incident '{clock.Title}'."
                                });
                                nats.Publish("waf.compliance.incident-overdue", payload);
                            }
                            catch (Exception ex)
                            {
                                _logger.LogWarning(ex, "[IncidentClockMonitor] Failed to publish overdue NATS alert.");
                            }
                        }
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "[IncidentClockMonitor] Sweep cycle failed.");
                }

                try { await Task.Delay(SweepInterval, stoppingToken); } catch (TaskCanceledException) { }
            }
        }
    }
}

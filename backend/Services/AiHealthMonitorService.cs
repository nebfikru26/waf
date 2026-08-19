using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.DependencyInjection;
using System;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using AffiniSecurity.Waf.Data;
using AffiniSecurity.Waf.Models;
using System.Text.Json.Nodes;

namespace AffiniSecurity.Waf.Services
{
    public class AiHealthMonitorService : BackgroundService
    {
        private readonly ILogger<AiHealthMonitorService> _logger;
        private readonly IServiceProvider _serviceProvider;
        private string _lastKnownStatus = "unknown";

        public AiHealthMonitorService(ILogger<AiHealthMonitorService> logger, IServiceProvider serviceProvider)
        {
            _logger = logger;
            _serviceProvider = serviceProvider;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("WAF AI Inference Sidecar Health Monitor service started.");

            // Give the sidecar some time to start up before checking
            await Task.Delay(5000, stoppingToken);

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    using var scope = _serviceProvider.CreateScope();
                    var redis = scope.ServiceProvider.GetRequiredService<IRedisService>();
                    var db = scope.ServiceProvider.GetRequiredService<WafDbContext>();
                    var nats = scope.ServiceProvider.GetRequiredService<INatsService>();

                    var healthJson = await redis.GetValueAsync("sidecar:health");
                    string currentStatus = "offline";
                    double latencyMs = 0.0;
                    long errorCount = 0;

                    if (!string.IsNullOrEmpty(healthJson))
                    {
                        try
                        {
                            var node = JsonSerializer.Deserialize<JsonNode>(healthJson);
                            if (node != null)
                            {
                                var statusVal = node["status"]?.ToString();
                                var timestampVal = node["timestamp"]?.AsValue().GetValue<long>() ?? 0;
                                var nowUnix = DateTimeOffset.UtcNow.ToUnixTimeSeconds();

                                // If the sidecar heartbeat is older than 15 seconds, consider it offline.
                                if (Math.Abs(nowUnix - timestampVal) > 15)
                                {
                                    currentStatus = "offline";
                                }
                                else
                                {
                                    currentStatus = statusVal ?? "online";
                                    latencyMs = node["average_latency_ms"]?.AsValue().GetValue<double>() ?? 0.0;
                                    errorCount = node["errors_total"]?.AsValue().GetValue<long>() ?? 0;
                                }
                            }
                        }
                        catch (Exception ex)
                        {
                            _logger.LogError(ex, "Failed to parse sidecar health JSON from Redis.");
                            currentStatus = "offline";
                        }
                    }

                    if (currentStatus != _lastKnownStatus)
                    {
                        _logger.LogWarning($"[AI-Monitor] Engine status changed from '{_lastKnownStatus}' to '{currentStatus}'");

                        // We only alert for issues or recovery.
                        // Skip alerting when transitioning from "unknown" to "online" on startup.
                        if (!(_lastKnownStatus == "unknown" && currentStatus == "online"))
                        {
                            string severity = "info";
                            string ruleMessage = "AI Inference Sidecar is online and operational.";

                            if (currentStatus == "offline")
                            {
                                severity = "critical";
                                ruleMessage = "CRITICAL FAILURE: AI Inference Sidecar is offline / unreachable.";
                            }
                            else if (currentStatus == "error")
                            {
                                severity = "critical";
                                ruleMessage = $"CRITICAL ERROR: AI Inference reports failures. Error Total: {errorCount}.";
                            }
                            else if (currentStatus == "degraded")
                            {
                                severity = "warning";
                                ruleMessage = $"PERFORMANCE DEGRADATION: AI Inference sidecar latency is high: {latencyMs:F2}ms.";
                            }

                            var alert = new AlertLog
                            {
                                Id = Guid.NewGuid().ToString(),
                                TenantId = "platform",
                                Ip = "127.0.0.1",
                                RuleId = $"AI-HEALTH-{currentStatus.ToUpperInvariant()}",
                                Rule = ruleMessage,
                                Uri = "/v1/classify",
                                Timestamp = DateTime.UtcNow.ToString("O"),
                                Severity = severity,
                                Action = "SYSTEM_ALERT"
                            };

                            db.AlertLogs.Add(alert);
                            await db.SaveChangesAsync(stoppingToken);

                            // Publish to NATS for live dashboards
                            try
                            {
                                var liveMsg = JsonSerializer.Serialize(new
                                {
                                    tenantId = "platform",
                                    ip = "127.0.0.1",
                                    ruleId = alert.RuleId,
                                    ruleMessage = alert.Rule,
                                    severity = alert.Severity,
                                    uri = alert.Uri,
                                    timestamp = alert.Timestamp
                                });
                                nats.Publish("waf.events.ai", liveMsg);
                            }
                            catch (Exception ex)
                            {
                                _logger.LogError(ex, "Failed to publish AI health alert update to NATS.");
                            }
                        }

                        _lastKnownStatus = currentStatus;
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error occurred in AI Health Monitor loop.");
                }

                await Task.Delay(10000, stoppingToken);
            }
        }
    }
}

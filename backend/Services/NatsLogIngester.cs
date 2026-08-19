using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using AffiniSecurity.Waf.Data;
using AffiniSecurity.Waf.Models;
using Microsoft.EntityFrameworkCore;
using NATS.Client;

namespace AffiniSecurity.Waf.Services
{
    public class NatsLogIngester : BackgroundService
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly string _natsUrl;
        private readonly string _subject = "waf.logs.audit";
        private readonly string _wazuhHost;
        private readonly int _wazuhPort;

        public NatsLogIngester(IServiceScopeFactory scopeFactory, IConfiguration config)
        {
            _scopeFactory = scopeFactory;
            _natsUrl = config["Waf:NatsUrl"] ?? "nats://nats:4222";
            _wazuhHost = config["Waf:WazuhSocket:Host"] ?? "127.0.0.1";
            _wazuhPort = int.TryParse(config["Waf:WazuhSocket:Port"], out var p) ? p : 1514;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            Console.WriteLine($"[ControlPlane] Starting NATS Log Ingester on {_natsUrl}, subject: {_subject}");

            ConnectionFactory cf = new ConnectionFactory();
            Options opts = ConnectionFactory.GetDefaultOptions();
            opts.Url = _natsUrl;
            opts.Name = "ControlPlane_LogIngester";

            // Retry connection if NATS is not ready
            IConnection? c = null;
            while (c == null && !stoppingToken.IsCancellationRequested)
            {
                try { c = cf.CreateConnection(opts); }
                catch { 
                    Console.WriteLine("[ControlPlane] Waiting for NATS...");
                    await Task.Delay(5000, stoppingToken); 
                }
            }

            if (c == null) return;

            using (c)
            {
                var sub = c.SubscribeAsync(_subject, async (sender, args) => {
                    try 
                    {
                        string json = Encoding.UTF8.GetString(args.Message.Data);
                        await IngestLog(json);
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"[ControlPlane] Error processing NATS log: {ex.Message}");
                    }
                });

                while (!stoppingToken.IsCancellationRequested)
                {
                    await Task.Delay(1000, stoppingToken);
                }
                
                sub.Unsubscribe();
            }
        }

        private async Task IngestLog(string json)
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;

            if (!root.TryGetProperty("transaction", out var transaction)) return;
            var clientIp = transaction.GetProperty("client_ip").GetString() ?? "Unknown";
            
            var request = transaction.GetProperty("request");
            var uri = request.GetProperty("uri").GetString() ?? "/";
            
            if (!root.TryGetProperty("messages", out var messages) || messages.ValueKind != JsonValueKind.Array) return;

            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<WafDbContext>();

            // Find tenant by domain
            string host = "";
            if (request.TryGetProperty("headers", out var headers))
            {
                if (headers.TryGetProperty("host", out var hostElement))
                {
                    host = hostElement.ValueKind == JsonValueKind.Array && hostElement.GetArrayLength() > 0 
                           ? hostElement[0].GetString() ?? "" 
                           : hostElement.GetString() ?? "";
                }
            }

            string hostOnly = host.Split(':')[0];
            // Use IgnoreQueryFilters because we are in a background process without a session TenantId
            var domain = await db.Domains.IgnoreQueryFilters()
                .FirstOrDefaultAsync(d => d.DomainName == host || d.DomainName == hostOnly);
            var tenantId = domain?.TenantId ?? "global";

            foreach (var msg in messages.EnumerateArray())
            {
                string ruleId = "0";
                if (msg.TryGetProperty("id", out var mid))
                    ruleId = mid.ValueKind == JsonValueKind.Number ? mid.GetInt32().ToString() : mid.GetString() ?? "0";

                string ruleMessage = "";
                if (msg.TryGetProperty("message", out var m)) ruleMessage = m.GetString() ?? "";
                
                string severityStr = "MEDIUM";

                // Detailed data parsing (Coraza might nest these under 'data')
                if (msg.TryGetProperty("data", out var data))
                {
                    if (ruleId == "0" && data.TryGetProperty("rule_id", out var rid)) 
                        ruleId = rid.ValueKind == JsonValueKind.Number ? rid.GetInt32().ToString() : rid.GetString() ?? "0";
                    
                    if (data.TryGetProperty("severity", out var sev))
                    {
                        int sevInt = sev.ValueKind == JsonValueKind.Number ? sev.GetInt32() : 0;
                        severityStr = sevInt switch
                        {
                            0 => "CRITICAL", 1 => "CRITICAL", 2 => "CRITICAL",
                            3 => "HIGH", 4 => "MEDIUM", 5 => "LOW", _ => "LOW"
                        };
                    }
                }

                // Fallback for severity if not in 'data'
                if (msg.TryGetProperty("severity", out var s))
                {
                    int sevInt = s.ValueKind == JsonValueKind.Number ? s.GetInt32() : 0;
                    if (severityStr == "MEDIUM") { // only override if still default
                        severityStr = sevInt switch
                        {
                            0 => "CRITICAL", 1 => "CRITICAL", 2 => "CRITICAL",
                            3 => "HIGH", 4 => "MEDIUM", 5 => "LOW", _ => "LOW"
                        };
                    }
                }

                if (string.IsNullOrEmpty(ruleMessage) && ruleId == "0") continue;

                var alert = new AlertLog
                {
                    Id = Guid.NewGuid().ToString(),
                    TenantId = tenantId,
                    Ip = clientIp,
                    RuleId = ruleId,
                    Rule = ruleMessage,
                    Uri = uri,
                    Timestamp = DateTime.UtcNow.ToString("O"),
                    Severity = severityStr,
                    Action = "BLOCK",
                    RawData = msg.ToString()
                };

                db.AlertLogs.Add(alert);
                Console.WriteLine($"[Ingester] Saved Alert: {ruleId} - {ruleMessage} for Tenant: {tenantId}");

                // Republish immediately to internal NATS for UI live SSE streaming
                var nats = scope.ServiceProvider.GetService<INatsService>();
                if (nats != null)
                {
                    try
                    {
                        var livePayload = JsonSerializer.Serialize(new { tenantId, ip = clientIp, ruleId, ruleMessage, severity = severityStr, uri, timestamp = alert.Timestamp });
                        nats.Publish("waf.events.crs", livePayload);
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"[Ingester] Failed to publish CRS SSE event to NATS: {ex.Message}");
                    }
                }
            }

            await db.SaveChangesAsync();

            // Forward ALL alerts captured in this batch to the Wazuh agent for INSA SOC ingestion.
            foreach (var entry in db.AlertLogs.Local.Where(a => a.TenantId != null))
            {
                _ = ForwardToWazuhAsync(entry);
            }
        }

        /// <summary>
        /// Transmits a WAF alert to the local Wazuh agent over TCP using a Syslog + JSON envelope.
        /// Satisfies Proclamation No. 808/2013 — INSA real-time SOC streaming.
        /// </summary>
        private async Task ForwardToWazuhAsync(AlertLog alert)
        {
            try
            {
                var payload = new
                {
                    program = "AffiniSecurity-WAF",
                    tenantId = alert.TenantId,
                    sourceIp = alert.Ip,
                    ruleId = alert.RuleId,
                    ruleMessage = alert.Rule,
                    uri = alert.Uri,
                    severity = alert.Severity,
                    action = alert.Action,
                    timestamp = alert.Timestamp
                };

                // Syslog priority 134 = facility 16 (local0) + severity 6 (informational)
                var json = JsonSerializer.Serialize(payload);
                var syslogLine = $"<134>AffiniSecurity-WAF: {json}\n";
                var bytes = Encoding.UTF8.GetBytes(syslogLine);

                using var tcp = new TcpClient();
                await tcp.ConnectAsync(_wazuhHost, _wazuhPort);
                await tcp.GetStream().WriteAsync(bytes, 0, bytes.Length);

                Console.WriteLine($"[Wazuh] Forwarded alert {alert.RuleId} → {_wazuhHost}:{_wazuhPort}");
            }
            catch (Exception ex)
            {
                // Wazuh agent being offline MUST NOT crash the ingestion loop.
                Console.WriteLine($"[Wazuh] Forward failed (non-critical): {ex.Message}");
            }
        }
    }
}

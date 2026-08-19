using ClickHouse.Client.ADO;
using ClickHouse.Client.ADO.Parameters;
using Microsoft.Extensions.Configuration;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;

namespace AffiniSecurity.Waf.Services
{
    public class AiBlockedEvent
    {
        public string TenantId { get; set; } = "";
        public string Url { get; set; } = "";
        public string Method { get; set; } = "";
        public double AnomalyScore { get; set; }
        public double MLScore { get; set; }
        public double ASTScore { get; set; }
        public string JA4Fingerprint { get; set; } = "";
        public string[] Matches { get; set; } = Array.Empty<string>();
        public DateTime BlockedAt { get; set; }
    }

    public class HourlyBlockStat
    {
        public string Hour { get; set; } = ""; // ISO hour string e.g. "2026-07-18T14"
        public int Count { get; set; }
        public double AvgScore { get; set; }
    }

    public class AttackVectorStat
    {
        public string Pattern { get; set; } = "";
        public int Count { get; set; }
        public double MaxScore { get; set; }
    }

    public class AnomalyAnalytics
    {
        public List<HourlyBlockStat> HourlySeries { get; set; } = new();
        public List<AttackVectorStat> AttackVectors { get; set; } = new();
        public int TotalBlocks24h { get; set; }
        public double AvgScore24h { get; set; }
        public int PeakHourCount { get; set; }
        public string PeakHour { get; set; } = "";
    }

    // ── Global Threat Correlation DTOs ────────────────────────────────────────
    public class TenantThreatStat
    {
        public string TenantId { get; set; } = "";
        public string TenantName { get; set; } = "";
        public int Blocks24h { get; set; }
        public double AvgScore { get; set; }
        public double MaxScore { get; set; }
    }

    public class GlobalPatternStat
    {
        public string Pattern { get; set; } = "";
        public int TotalCount { get; set; }
        public int AffectedTenants { get; set; }
        public double MaxScore { get; set; }
    }

    public class DailyBlockStat
    {
        public string Day { get; set; } = ""; // "YYYY-MM-DD"
        public int Count { get; set; }
        public double AvgScore { get; set; }
    }

    public class GlobalThreatReport
    {
        public List<TenantThreatStat> TopTargetedTenants { get; set; } = new();
        public List<GlobalPatternStat> TopPatterns { get; set; } = new();
        public List<DailyBlockStat> DailyTrend { get; set; } = new();
        public int TotalBlocks24h { get; set; }
        public int TotalBlocks7d { get; set; }
        public int UniqueTenants24h { get; set; }
        public string TopPattern { get; set; } = "";
    }

    public interface IClickHouseService
    {
        Task InitializeAsync();
        Task InsertTrafficLogAsync(string tenantId, string time, int requests = 1, int blocked = 0);
        Task<long> GetTotalRequestsAsync();
        Task InsertAiBlockedEventAsync(string tenantId, string url, string method, double score, double mlScore, double astScore, string[] matches, string ja4, byte schemaDeviation);
        Task<List<AiBlockedEvent>> GetAiBlockedEventsAsync(string tenantId);
        Task<List<AiBlockedEvent>> GetAiBlockedEventsByIdentifiersAsync(List<string> identifiers);
        Task<AnomalyAnalytics> GetAnomalyAnalyticsAsync();
        Task<Dictionary<string, int>> GetAiBlockCountPerTenantAsync();
        Task<GlobalThreatReport> GetGlobalThreatCorrelationAsync();
    }

    public class ClickHouseService : IClickHouseService
    {
        private readonly string _connectionString;

        public ClickHouseService(IConfiguration config)
        {
            _connectionString = config.GetConnectionString("ClickHouseConnection") ?? "Host=localhost;Port=8123;Username=default;Password=";
        }

        public async Task InitializeAsync()
        {
            using var connection = new ClickHouseConnection(_connectionString);
            await connection.OpenAsync();

            var command = connection.CreateCommand();
            command.CommandText = @"
                CREATE TABLE IF NOT EXISTS network_metadata (
                    TenantId String,
                    Time String,
                    Requests Int32,
                    Blocked Int32,
                    CreatedAt DateTime
                ) ENGINE = MergeTree()
                ORDER BY (TenantId, Time)
                TTL CreatedAt + INTERVAL 1 YEAR;
            ";
            await command.ExecuteNonQueryAsync();

            var command2 = connection.CreateCommand();
            command2.CommandText = @"
                CREATE TABLE IF NOT EXISTS ai_blocked_events (
                    TenantId String,
                    Url String,
                    Method String,
                    AnomalyScore Float64,
                    Matches Array(String),
                    BlockedAt DateTime
                ) ENGINE = MergeTree()
                ORDER BY (TenantId, BlockedAt)
                TTL BlockedAt + INTERVAL 1 YEAR;
            ";
            await command2.ExecuteNonQueryAsync();

            // Phase 4 — Immutable Audit Table with SHA256 Hash Chain
            var command3 = connection.CreateCommand();
            command3.CommandText = @"
                CREATE TABLE IF NOT EXISTS waf_events_audit
                (
                    event_id         UUID    DEFAULT generateUUIDv4(),
                    tenant_id        String,
                    timestamp        DateTime64(3, 'UTC') DEFAULT now64(3),
                    url              String,
                    method           LowCardinality(String),
                    body             String,
                    ja4_fingerprint  String,
                    anomaly_score    Float32,
                    ml_score         Float32,
                    ast_score        Float32,
                    matches          Array(String),
                    action           LowCardinality(String),
                    prev_hash        FixedString(64) DEFAULT '0000000000000000000000000000000000000000000000000000000000000000',
                    row_hash         FixedString(64),
                    label            Nullable(UInt8)
                )
                ENGINE = MergeTree()
                PARTITION BY toYYYYMM(timestamp)
                ORDER BY (tenant_id, timestamp, event_id);
            ";
            await command3.ExecuteNonQueryAsync();
        }

        public async Task InsertTrafficLogAsync(string tenantId, string time, int requests = 1, int blocked = 0)
        {
            try 
            {
                using var connection = new ClickHouseConnection(_connectionString);
                await connection.OpenAsync();

                var command = connection.CreateCommand();
                command.CommandText = @"
                    INSERT INTO network_metadata (TenantId, Time, Requests, Blocked, CreatedAt)
                    VALUES ({tenantId:String}, {time:String}, {requests:Int32}, {blocked:Int32}, {createdAt:DateTime})
                ";
                
                command.Parameters.Add(new ClickHouseDbParameter { ParameterName = "tenantId", Value = string.IsNullOrEmpty(tenantId) ? "global" : tenantId });
                command.Parameters.Add(new ClickHouseDbParameter { ParameterName = "time", Value = time });
                command.Parameters.Add(new ClickHouseDbParameter { ParameterName = "requests", Value = requests });
                command.Parameters.Add(new ClickHouseDbParameter { ParameterName = "blocked", Value = blocked });
                command.Parameters.Add(new ClickHouseDbParameter { ParameterName = "createdAt", Value = DateTime.UtcNow });

                await command.ExecuteNonQueryAsync();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ClickHouse] Error inserting traffic log: {ex.Message}");
            }
        }

        public async Task InsertAiBlockedEventAsync(string tenantId, string url, string method, double score, double mlScore, double astScore, string[] matches, string ja4, byte schemaDeviation)
        {
            try
            {
                using var connection = new ClickHouseConnection(_connectionString);
                await connection.OpenAsync();

                // ── Insert into legacy table for backwards compat ──────────────
                var cmd1 = connection.CreateCommand();
                cmd1.CommandText = @"
                    INSERT INTO ai_blocked_events (TenantId, Url, Method, AnomalyScore, Matches, BlockedAt)
                    VALUES ({tenantId:String}, {url:String}, {method:String}, {anomalyScore:Float64}, {matches:Array(String)}, {blockedAt:DateTime})
                ";
                cmd1.Parameters.Add(new ClickHouseDbParameter { ParameterName = "tenantId", Value = string.IsNullOrEmpty(tenantId) ? "global" : tenantId });
                cmd1.Parameters.Add(new ClickHouseDbParameter { ParameterName = "url", Value = url ?? "" });
                cmd1.Parameters.Add(new ClickHouseDbParameter { ParameterName = "method", Value = method ?? "" });
                cmd1.Parameters.Add(new ClickHouseDbParameter { ParameterName = "anomalyScore", Value = score });
                cmd1.Parameters.Add(new ClickHouseDbParameter { ParameterName = "matches", Value = matches ?? Array.Empty<string>() });
                cmd1.Parameters.Add(new ClickHouseDbParameter { ParameterName = "blockedAt", Value = DateTime.UtcNow });
                await cmd1.ExecuteNonQueryAsync();

                // ── Phase 4: Insert into immutable audit table with hash chain ──
                // 1. Fetch prev_hash from the last inserted row for this tenant
                var prevHashCmd = connection.CreateCommand();
                prevHashCmd.CommandText = @"
                    SELECT row_hash FROM waf_events_audit
                    WHERE tenant_id = {tenantId2:String}
                    ORDER BY timestamp DESC
                    LIMIT 1
                ";
                prevHashCmd.Parameters.Add(new ClickHouseDbParameter { ParameterName = "tenantId2", Value = string.IsNullOrEmpty(tenantId) ? "global" : tenantId });
                var prevHashResult = await prevHashCmd.ExecuteScalarAsync();
                var prevHash = prevHashResult?.ToString() ?? new string('0', 64);

                // 2. Compute SHA256 of (prevHash + tenantId + url + score + utcNow)
                var timestamp = DateTime.UtcNow;
                var rawInput = $"{prevHash}|{tenantId}|{url}|{score:F4}|{timestamp:O}";
                var rowHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(rawInput))).ToLowerInvariant();

                // 3. Insert audit row with hash chain
                var cmd2 = connection.CreateCommand();
                cmd2.CommandText = @"
                    INSERT INTO waf_events_audit
                    (tenant_id, timestamp, url, method, body, ja4_fingerprint,
                     anomaly_score, ml_score, ast_score, matches, action, prev_hash, row_hash, schema_deviation)
                    VALUES
                    ({auditTenantId:String}, {auditTs:DateTime64}, {auditUrl:String}, {auditMethod:String},
                     '', {auditJa4:String}, {auditScore:Float32}, {auditMlScore:Float32}, {auditAstScore:Float32},
                     {auditMatches:Array(String)}, 'block',
                     {auditPrevHash:FixedString(64)}, {auditRowHash:FixedString(64)}, {auditSchemaDev:UInt8})
                ";
                cmd2.Parameters.Add(new ClickHouseDbParameter { ParameterName = "auditTenantId", Value = string.IsNullOrEmpty(tenantId) ? "global" : tenantId });
                cmd2.Parameters.Add(new ClickHouseDbParameter { ParameterName = "auditTs", Value = timestamp });
                cmd2.Parameters.Add(new ClickHouseDbParameter { ParameterName = "auditUrl", Value = url ?? "" });
                cmd2.Parameters.Add(new ClickHouseDbParameter { ParameterName = "auditMethod", Value = method ?? "" });
                cmd2.Parameters.Add(new ClickHouseDbParameter { ParameterName = "auditJa4", Value = ja4 ?? "" });
                cmd2.Parameters.Add(new ClickHouseDbParameter { ParameterName = "auditScore", Value = (float)score });
                cmd2.Parameters.Add(new ClickHouseDbParameter { ParameterName = "auditMlScore", Value = (float)mlScore });
                cmd2.Parameters.Add(new ClickHouseDbParameter { ParameterName = "auditAstScore", Value = (float)astScore });
                cmd2.Parameters.Add(new ClickHouseDbParameter { ParameterName = "auditMatches", Value = matches ?? Array.Empty<string>() });
                cmd2.Parameters.Add(new ClickHouseDbParameter { ParameterName = "auditPrevHash", Value = prevHash.PadRight(64, '0')[..64] });
                cmd2.Parameters.Add(new ClickHouseDbParameter { ParameterName = "auditRowHash", Value = rowHash[..64] });
                cmd2.Parameters.Add(new ClickHouseDbParameter { ParameterName = "auditSchemaDev", Value = schemaDeviation });
                await cmd2.ExecuteNonQueryAsync();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ClickHouse] Error inserting WAF AI block event: {ex.Message}");
            }
        }

        public async Task<long> GetTotalRequestsAsync()
        {
            try 
            {
                using var connection = new ClickHouseConnection(_connectionString);
                await connection.OpenAsync();

                var command = connection.CreateCommand();
                command.CommandText = "SELECT sum(Requests) FROM network_metadata";
                var result = await command.ExecuteScalarAsync();
                
                if (result != DBNull.Value && result != null)
                {
                    return Convert.ToInt64(result);
                }
                return 0;
            }
            catch 
            {
                return 0;
            }
        }

        public async Task<List<AiBlockedEvent>> GetAiBlockedEventsAsync(string tenantId)
        {
            var events = new List<AiBlockedEvent>();
            try
            {
                using var connection = new ClickHouseConnection(_connectionString);
                await connection.OpenAsync();

                var command = connection.CreateCommand();
                command.CommandText = @"
                    SELECT tenant_id, url, method, anomaly_score, ml_score, ast_score, ja4_fingerprint, matches, timestamp
                    FROM waf_events_audit
                    WHERE tenant_id = {tenantId:String} 
                      AND action = 'block'
                    ORDER BY timestamp DESC
                    LIMIT 500
                ";
                command.Parameters.Add(new ClickHouseDbParameter { ParameterName = "tenantId", Value = tenantId });

                using var reader = await command.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    events.Add(new AiBlockedEvent
                    {
                        TenantId = reader.GetString(0),
                        Url = reader.GetString(1),
                        Method = reader.GetString(2),
                        AnomalyScore = reader.GetFloat(3),
                        MLScore = reader.GetFloat(4),
                        ASTScore = reader.GetFloat(5),
                        JA4Fingerprint = reader.GetString(6),
                        Matches = reader.IsDBNull(7) ? Array.Empty<string>() : (string[])reader.GetValue(7),
                        BlockedAt = reader.GetDateTime(8)
                    });
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ClickHouse] Error retrieving WAF AI blocked events: {ex.Message}");
            }
            return events;
        }
        public async Task<List<AiBlockedEvent>> GetAiBlockedEventsByIdentifiersAsync(List<string> identifiers)
        {
            var events = new List<AiBlockedEvent>();
            if (identifiers == null || identifiers.Count == 0) return events;
            try
            {
                using var connection = new ClickHouseConnection(_connectionString);
                await connection.OpenAsync();

                var command = connection.CreateCommand();
                // Build IN (...) clause with quoted literals
                var quoted = string.Join(", ", identifiers.Select(id => $"'{id.Replace("'", "\\'")}'"));
                command.CommandText = $@"
                    SELECT tenant_id, url, method, anomaly_score, ml_score, ast_score, ja4_fingerprint, matches, timestamp
                    FROM waf_events_audit
                    WHERE tenant_id IN ({quoted})
                      AND action = 'block'
                    ORDER BY timestamp DESC
                    LIMIT 500
                ";

                using var reader = await command.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    events.Add(new AiBlockedEvent
                    {
                        TenantId = reader.GetString(0),
                        Url = reader.GetString(1),
                        Method = reader.GetString(2),
                        AnomalyScore = reader.GetFloat(3),
                        MLScore = reader.GetFloat(4),
                        ASTScore = reader.GetFloat(5),
                        JA4Fingerprint = reader.GetString(6),
                        Matches = reader.IsDBNull(7) ? Array.Empty<string>() : (string[])reader.GetValue(7),
                        BlockedAt = reader.GetDateTime(8)
                    });
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ClickHouse] Error querying waf_events_audit by identifiers: {ex.Message}");
            }
            return events;
        }

        public async Task<AnomalyAnalytics> GetAnomalyAnalyticsAsync()
        {
            var result = new AnomalyAnalytics();
            try
            {
                using var connection = new ClickHouseConnection(_connectionString);
                await connection.OpenAsync();

                // ── 1. Hourly time-series: past 24 hours ──────────────────────────
                var seriesCmd = connection.CreateCommand();
                seriesCmd.CommandText = @"
                    SELECT
                        formatDateTime(toStartOfHour(BlockedAt), '%Y-%m-%dT%H') AS Hour,
                        count() AS Count,
                        avg(AnomalyScore) AS AvgScore
                    FROM ai_blocked_events
                    WHERE BlockedAt >= now() - INTERVAL 24 HOUR
                    GROUP BY Hour
                    ORDER BY Hour ASC
                ";

                using var seriesReader = await seriesCmd.ExecuteReaderAsync();
                while (await seriesReader.ReadAsync())
                {
                    result.HourlySeries.Add(new HourlyBlockStat
                    {
                        Hour = seriesReader.GetString(0),
                        Count = Convert.ToInt32(seriesReader.GetValue(1)),
                        AvgScore = Convert.ToDouble(seriesReader.GetValue(2))
                    });
                }

                // Fill hours with 0 if missing so the chart line is continuous
                var now = DateTime.UtcNow;
                var hourSlots = Enumerable.Range(0, 24)
                    .Select(h => now.AddHours(-23 + h).ToString("yyyy-MM-ddTHH"))
                    .ToList();
                var existingHours = result.HourlySeries.ToDictionary(h => h.Hour);
                result.HourlySeries = hourSlots.Select(slot =>
                    existingHours.ContainsKey(slot)
                        ? existingHours[slot]
                        : new HourlyBlockStat { Hour = slot, Count = 0, AvgScore = 0 }
                ).ToList();

                // ── 2. Attack vector aggregation: top patterns across all time ────
                var vectorCmd = connection.CreateCommand();
                vectorCmd.CommandText = @"
                    SELECT
                        arrayJoin(Matches) AS Pattern,
                        count() AS Count,
                        max(AnomalyScore) AS MaxScore
                    FROM ai_blocked_events
                    WHERE length(Matches) > 0
                    GROUP BY Pattern
                    ORDER BY Count DESC
                    LIMIT 10
                ";

                using var vectorReader = await vectorCmd.ExecuteReaderAsync();
                while (await vectorReader.ReadAsync())
                {
                    result.AttackVectors.Add(new AttackVectorStat
                    {
                        Pattern = vectorReader.GetString(0),
                        Count = Convert.ToInt32(vectorReader.GetValue(1)),
                        MaxScore = Convert.ToDouble(vectorReader.GetValue(2))
                    });
                }

                // ── 3. Summary aggregates ─────────────────────────────────────────
                var summaryCmd = connection.CreateCommand();
                summaryCmd.CommandText = @"
                    SELECT count(), avg(AnomalyScore)
                    FROM ai_blocked_events
                    WHERE BlockedAt >= now() - INTERVAL 24 HOUR
                ";
                using var summaryReader = await summaryCmd.ExecuteReaderAsync();
                if (await summaryReader.ReadAsync())
                {
                    result.TotalBlocks24h = Convert.ToInt32(summaryReader.GetValue(0));
                    result.AvgScore24h = Convert.ToDouble(summaryReader.GetValue(1));
                }

                // Peak hour
                if (result.HourlySeries.Count > 0)
                {
                    var peak = result.HourlySeries.OrderByDescending(h => h.Count).First();
                    result.PeakHourCount = peak.Count;
                    result.PeakHour = peak.Hour;
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ClickHouse] Error computing anomaly analytics: {ex.Message}");
            }
            return result;
        }
        public async Task<Dictionary<string, int>> GetAiBlockCountPerTenantAsync()
        {
            var result = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            try
            {
                using var connection = new ClickHouseConnection(_connectionString);
                await connection.OpenAsync();

                var cmd = connection.CreateCommand();
                cmd.CommandText = @"
                    SELECT TenantId, count() as cnt
                    FROM ai_blocked_events
                    WHERE BlockedAt >= now() - INTERVAL 24 HOUR
                    GROUP BY TenantId
                ";

                using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    var tenantId = reader.GetString(0);
                    var count    = Convert.ToInt32(reader.GetValue(1));
                    result[tenantId] = count;
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ClickHouse] Error fetching block counts per tenant: {ex.Message}");
            }
            return result;
        }

        public async Task<GlobalThreatReport> GetGlobalThreatCorrelationAsync()
        {
            var report = new GlobalThreatReport();
            try
            {
                using var connection = new ClickHouseConnection(_connectionString);
                await connection.OpenAsync();

                // ── 1. Top Targeted Tenants (24h) ────────────────────────────
                var topTenantsCmd = connection.CreateCommand();
                topTenantsCmd.CommandText = @"
                    SELECT
                        TenantId,
                        count() AS Blocks,
                        avg(AnomalyScore) AS AvgScore,
                        max(AnomalyScore) AS MaxScore
                    FROM ai_blocked_events
                    WHERE BlockedAt >= now() - INTERVAL 24 HOUR
                    GROUP BY TenantId
                    ORDER BY Blocks DESC
                    LIMIT 20
                ";
                using var tenantsReader = await topTenantsCmd.ExecuteReaderAsync();
                while (await tenantsReader.ReadAsync())
                {
                    report.TopTargetedTenants.Add(new TenantThreatStat
                    {
                        TenantId  = tenantsReader.GetString(0),
                        Blocks24h = Convert.ToInt32(tenantsReader.GetValue(1)),
                        AvgScore  = Convert.ToDouble(tenantsReader.GetValue(2)),
                        MaxScore  = Convert.ToDouble(tenantsReader.GetValue(3)),
                    });
                }

                // ── 2. Platform-Wide Attack Patterns (7d) ───────────────────
                var patternsCmd = connection.CreateCommand();
                patternsCmd.CommandText = @"
                    SELECT
                        arrayJoin(Matches) AS Pattern,
                        count() AS TotalCount,
                        uniqExact(TenantId) AS AffectedTenants,
                        max(AnomalyScore) AS MaxScore
                    FROM ai_blocked_events
                    WHERE BlockedAt >= now() - INTERVAL 7 DAY
                        AND length(Matches) > 0
                    GROUP BY Pattern
                    ORDER BY TotalCount DESC
                    LIMIT 15
                ";
                using var patternsReader = await patternsCmd.ExecuteReaderAsync();
                while (await patternsReader.ReadAsync())
                {
                    report.TopPatterns.Add(new GlobalPatternStat
                    {
                        Pattern         = patternsReader.GetString(0),
                        TotalCount      = Convert.ToInt32(patternsReader.GetValue(1)),
                        AffectedTenants = Convert.ToInt32(patternsReader.GetValue(2)),
                        MaxScore        = Convert.ToDouble(patternsReader.GetValue(3)),
                    });
                }

                // ── 3. 7-Day Daily Trend ─────────────────────────────────────
                var dailyCmd = connection.CreateCommand();
                dailyCmd.CommandText = @"
                    SELECT
                        formatDateTime(toStartOfDay(BlockedAt), '%Y-%m-%d') AS Day,
                        count() AS Count,
                        avg(AnomalyScore) AS AvgScore
                    FROM ai_blocked_events
                    WHERE BlockedAt >= now() - INTERVAL 7 DAY
                    GROUP BY Day
                    ORDER BY Day ASC
                ";
                using var dailyReader = await dailyCmd.ExecuteReaderAsync();
                while (await dailyReader.ReadAsync())
                {
                    report.DailyTrend.Add(new DailyBlockStat
                    {
                        Day      = dailyReader.GetString(0),
                        Count    = Convert.ToInt32(dailyReader.GetValue(1)),
                        AvgScore = Convert.ToDouble(dailyReader.GetValue(2)),
                    });
                }

                // Fill missing days with 0 for a continuous chart
                var today = DateTime.UtcNow.Date;
                var daySlots = Enumerable.Range(0, 7).Select(d => today.AddDays(-6 + d).ToString("yyyy-MM-dd")).ToList();
                var existingDays = report.DailyTrend.ToDictionary(d => d.Day);
                report.DailyTrend = daySlots.Select(slot =>
                    existingDays.ContainsKey(slot)
                        ? existingDays[slot]
                        : new DailyBlockStat { Day = slot, Count = 0, AvgScore = 0 }
                ).ToList();

                // ── 4. Summary KPIs ───────────────────────────────────────────
                var summaryCmd = connection.CreateCommand();
                summaryCmd.CommandText = @"
                    SELECT
                        countIf(BlockedAt >= now() - INTERVAL 24 HOUR) AS Blocks24h,
                        countIf(BlockedAt >= now() - INTERVAL 7 DAY)   AS Blocks7d,
                        uniqExactIf(TenantId, BlockedAt >= now() - INTERVAL 24 HOUR) AS Tenants24h
                    FROM ai_blocked_events
                    WHERE BlockedAt >= now() - INTERVAL 7 DAY
                ";
                using var summaryReader = await summaryCmd.ExecuteReaderAsync();
                if (await summaryReader.ReadAsync())
                {
                    report.TotalBlocks24h    = Convert.ToInt32(summaryReader.GetValue(0));
                    report.TotalBlocks7d     = Convert.ToInt32(summaryReader.GetValue(1));
                    report.UniqueTenants24h  = Convert.ToInt32(summaryReader.GetValue(2));
                }

                report.TopPattern = report.TopPatterns.FirstOrDefault()?.Pattern ?? "";
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ClickHouse] Error computing global threat correlation: {ex.Message}");
            }
            return report;
        }
    }
}


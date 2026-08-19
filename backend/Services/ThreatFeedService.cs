using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;
using AffiniSecurity.Waf.Data;
using AffiniSecurity.Waf.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace AffiniSecurity.Waf.Services
{
    /// <summary>
    /// Multi-source threat intelligence background service.
    /// Ingests IOCs from multiple global feeds every 6 hours:
    ///   1. AlienVault OTX          — IP, Domain, Hash (API key required)
    ///   2. CISA KEV Catalog        — CVE exploited vulnerabilities (public, no auth)
    ///   3. Abuse.ch URLhaus        — Malicious URLs (free API key from auth.abuse.ch)
    ///   4. Abuse.ch MalwareBazaar  — File hashes (free API key from auth.abuse.ch)
    /// </summary>
    public class ThreatFeedService : BackgroundService
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly IConfiguration _configuration;
        private readonly ILogger<ThreatFeedService> _logger;
        private readonly HttpClient _httpClient;
        private readonly IThreatIntelligenceService _threatIntel;

        // Publicly tracked sync state
        public static DateTime? LastSyncedAt { get; private set; }
        public static Dictionary<string, int> LastSyncCounts { get; private set; } = new();

        public ThreatFeedService(
            IServiceScopeFactory scopeFactory,
            IConfiguration configuration,
            ILogger<ThreatFeedService> logger,
            IThreatIntelligenceService threatIntel)
        {
            _scopeFactory = scopeFactory;
            _configuration = configuration;
            _logger = logger;
            _threatIntel = threatIntel;
            _httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
            _httpClient.DefaultRequestHeaders.Add("User-Agent", "AffiniSecurity-WAF/1.0 ThreatFeed-Integrator");
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("[ThreatFeed] Multi-source threat feed service starting up.");
            while (!stoppingToken.IsCancellationRequested)
            {
                await SyncAllFeedsAsync(stoppingToken);
                var refreshHours = _configuration.GetValue<int>("Waf:ThreatFeed:RefreshIntervalHours", 6);
                _logger.LogInformation("[ThreatFeed] All feeds synced. Next refresh in {Hours} hours.", refreshHours);
                await Task.Delay(TimeSpan.FromHours(refreshHours), stoppingToken);
            }
        }

        private async Task SyncAllFeedsAsync(CancellationToken ct)
        {
            var counts = new Dictionary<string, int>();

            // Run all feeds concurrently for faster startup
            var tasks = new[]
            {
                SyncOtxAsync(ct).ContinueWith(t => { if (!t.IsFaulted) counts["AlienVault-OTX"] = t.Result; }, ct),
                SyncCisaKevAsync(ct).ContinueWith(t => { if (!t.IsFaulted) counts["CISA-KEV"] = t.Result; }, ct),
                SyncAbusechUrlhausAsync(ct).ContinueWith(t => { if (!t.IsFaulted) counts["Abuse.ch-URLhaus"] = t.Result; }, ct),
                SyncAbusechMalwareBazaarAsync(ct).ContinueWith(t => { if (!t.IsFaulted) counts["Abuse.ch-MalwareBazaar"] = t.Result; }, ct),
                SyncFeodoTrackerAsync(ct).ContinueWith(t => { if (!t.IsFaulted) counts["Abuse.ch-FeodoTracker"] = t.Result; }, ct),
                SyncTorExitNodesAsync(ct).ContinueWith(t => { if (!t.IsFaulted) counts["Tor-Exit-Nodes"] = t.Result; }, ct),
                SyncInsaThreatFeedAsync(ct).ContinueWith(t => { if (!t.IsFaulted) counts["INSA-Ethiopia"] = t.Result; }, ct),
            };

            await Task.WhenAll(tasks);

            LastSyncCounts = counts;
            LastSyncedAt = DateTime.UtcNow;

            _logger.LogInformation("[ThreatFeed] Sync complete. Results: {Summary}",
                string.Join(", ", counts.Select(kv => $"{kv.Key}={kv.Value}")));

            // If no real data anywhere, seed demo indicators
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<WafDbContext>();
            var hasAny = await db.IocIndicators.IgnoreQueryFilters().AnyAsync(ct);
            if (!hasAny)
            {
                await SeedDemoIndicatorsAsync(ct);
            }

            // 5. Prune expired indicators (LastSeen > 90 days ago)
            await PruneExpiredIndicatorsAsync(ct);
        }

        // ─────────────────────────────────────────────────────────────────────
        // 1. AlienVault OTX
        // ─────────────────────────────────────────────────────────────────────

        private async Task<int> SyncOtxAsync(CancellationToken ct)
        {
            var apiKey = _configuration.GetValue<string>("Waf:ThreatFeed:OtxApiKey");
            if (string.IsNullOrWhiteSpace(apiKey))
            {
                _logger.LogWarning("[ThreatFeed] AlienVault OTX: No API key configured (Waf__ThreatFeed__OtxApiKey). Skipping.");
                return 0;
            }

            var maxPerPulse = _configuration.GetValue<int>("Waf:ThreatFeed:MaxIndicatorsPerPulse", 500);
            int newCount = 0;

            try
            {
                _logger.LogInformation("[ThreatFeed] AlienVault OTX: Starting sync...");
                _httpClient.DefaultRequestHeaders.Remove("X-OTX-API-KEY");
                _httpClient.DefaultRequestHeaders.Add("X-OTX-API-KEY", apiKey);

                var url = "https://otx.alienvault.com/api/v1/pulses/subscribed?limit=50";
                int page = 1;

                while (!string.IsNullOrEmpty(url) && page <= 5)
                {
                    var response = await _httpClient.GetAsync(url, ct);
                    if (!response.IsSuccessStatusCode) break;

                    var json = await response.Content.ReadAsStringAsync(ct);
                    var pulseResponse = JsonSerializer.Deserialize<OtxPulseResponse>(json);
                    if (pulseResponse?.Results == null) break;

                    using var scope = _scopeFactory.CreateScope();
                    var db = scope.ServiceProvider.GetRequiredService<WafDbContext>();

                    foreach (var pulse in pulseResponse.Results)
                    {
                        foreach (var ind in (pulse.Indicators ?? []).Take(maxPerPulse))
                        {
                            if (string.IsNullOrWhiteSpace(ind.Indicator)) continue;
                            var existing = await db.IocIndicators.IgnoreQueryFilters()
                                .FirstOrDefaultAsync(i => i.IndicatorValue == ind.Indicator && i.Source == "AlienVault-OTX", ct);
                            if (existing != null) { existing.LastSeen = DateTime.UtcNow; existing.IsActive = true; }
                            else
                            {
                                db.IocIndicators.Add(new IocIndicator
                                {
                                    IndicatorValue = ind.Indicator,
                                    IndicatorType = MapOtxType(ind.Type),
                                    PulseName = pulse.Name,
                                    ThreatType = pulse.Tags?.FirstOrDefault() ?? "Malware",
                                    Severity = CalculateSeverity(pulse.SubscriberCount),
                                    Source = "AlienVault-OTX",
                                    Country = ind.Country,
                                    ExternalId = pulse.Id,
                                    ExternalLink = !string.IsNullOrEmpty(pulse.Id) ? $"https://otx.alienvault.com/pulse/{pulse.Id}" : null,
                                    ConfidenceScore = Math.Min(100, pulse.SubscriberCount * 2),
                                });
                                newCount++;
                            }
                        }
                    }
                    await db.SaveChangesAsync(ct);
                    url = pulseResponse.Next;
                    page++;
                }
                _logger.LogInformation("[ThreatFeed] AlienVault OTX: +{Count} new indicators.", newCount);
            }
            catch (Exception ex) { _logger.LogError(ex, "[ThreatFeed] AlienVault OTX sync failed."); }
            return newCount;
        }

        // ─────────────────────────────────────────────────────────────────────
        // 2. CISA Known Exploited Vulnerabilities (KEV)
        //    Public endpoint — no auth required.
        // ─────────────────────────────────────────────────────────────────────

        private async Task<int> SyncCisaKevAsync(CancellationToken ct)
        {
            int newCount = 0;
            try
            {
                _logger.LogInformation("[ThreatFeed] CISA KEV: Fetching known exploited vulnerabilities...");
                const string url = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json";
                var response = await _httpClient.GetAsync(url, ct);
                if (!response.IsSuccessStatusCode)
                {
                    _logger.LogWarning("[ThreatFeed] CISA KEV: HTTP {Status}", response.StatusCode);
                    return 0;
                }

                var json = await response.Content.ReadAsStringAsync(ct);
                var catalog = JsonSerializer.Deserialize<CisaKevCatalog>(json);
                if (catalog?.Vulnerabilities == null) return 0;

                using var scope = _scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<WafDbContext>();

                foreach (var vuln in catalog.Vulnerabilities)
                {
                    if (string.IsNullOrWhiteSpace(vuln.CveId)) continue;
                    var existing = await db.IocIndicators.IgnoreQueryFilters()
                        .FirstOrDefaultAsync(i => i.IndicatorValue == vuln.CveId && i.Source == "CISA-KEV", ct);
                    if (existing != null) { existing.LastSeen = DateTime.UtcNow; existing.IsActive = true; continue; }

                    // Severity: if due date is within 30 days — CRITICAL, otherwise HIGH
                    var dueDate = DateTime.TryParse(vuln.DueDate, out var d) ? d : DateTime.MaxValue;
                    var severity = dueDate < DateTime.UtcNow.AddDays(30) ? "CRITICAL" : "HIGH";

                        db.IocIndicators.Add(new IocIndicator
                        {
                            IndicatorValue = vuln.CveId,
                            IndicatorType = "CVE",
                            PulseName = $"{vuln.VendorProject} — {vuln.Product}",
                            ThreatType = vuln.RequiredAction?.Length > 50
                                ? vuln.RequiredAction[..50] + "…"
                                : (vuln.RequiredAction ?? "Patch Required"),
                            Severity = severity,
                            Source = "CISA-KEV",
                            ExternalId = vuln.CveId,
                            ExternalLink = $"https://www.cisa.gov/known-exploited-vulnerabilities-catalog?search={vuln.CveId}",
                            Country = null,
                            ConfidenceScore = 100, // CISA is the highest authority
                        });
                        await _threatIntel.UpdateIocCacheAsync(vuln.CveId, "CVE", "CISA-KEV", severity);
                        newCount++;
                }
                await db.SaveChangesAsync(ct);
                _logger.LogInformation("[ThreatFeed] CISA KEV: +{Count} new CVEs.", newCount);
            }
            catch (Exception ex) { _logger.LogError(ex, "[ThreatFeed] CISA KEV sync failed."); }
            return newCount;
        }

        // ─────────────────────────────────────────────────────────────────────
        // 3. Abuse.ch URLhaus — Malicious URLs
        //    Free API key from https://auth.abuse.ch
        // ─────────────────────────────────────────────────────────────────────

        private async Task<int> SyncAbusechUrlhausAsync(CancellationToken ct)
        {
            var apiKey = _configuration.GetValue<string>("Waf:ThreatFeed:AbusechApiKey");
            if (string.IsNullOrWhiteSpace(apiKey))
            {
                _logger.LogWarning("[ThreatFeed] Abuse.ch URLhaus: No API key (Waf__ThreatFeed__AbusechApiKey). Skipping.");
                return 0;
            }

            int newCount = 0;
            try
            {
                _logger.LogInformation("[ThreatFeed] Abuse.ch URLhaus: Fetching recent malicious URLs...");
                // URLhaus v2 API — fetch recent URLs
                var request = new HttpRequestMessage(HttpMethod.Post, "https://urlhaus-api.abuse.ch/v1/urls/recent/")
                {
                    Content = new StringContent("", Encoding.UTF8, "application/x-www-form-urlencoded")
                };
                request.Headers.Add("Auth-Key", apiKey);
                var response = await _httpClient.SendAsync(request, ct);
                if (!response.IsSuccessStatusCode) return 0;

                var json = await response.Content.ReadAsStringAsync(ct);
                var result = JsonSerializer.Deserialize<UrlhausResponse>(json);
                if (result?.Urls == null) return 0;

                using var scope = _scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<WafDbContext>();

                // Take top 200 active malicious URLs
                foreach (var url in result.Urls.Where(u => u.UrlStatus == "online").Take(200))
                {
                    if (string.IsNullOrWhiteSpace(url.Url)) continue;
                    var existing = await db.IocIndicators.IgnoreQueryFilters()
                        .FirstOrDefaultAsync(i => i.IndicatorValue == url.Url && i.Source == "Abuse.ch-URLhaus", ct);
                    if (existing != null) { existing.LastSeen = DateTime.UtcNow; existing.IsActive = true; continue; }

                        db.IocIndicators.Add(new IocIndicator
                        {
                            IndicatorValue = url.Url,
                            IndicatorType = "URL",
                            PulseName = $"URLhaus — {url.Threat ?? "Malware"}",
                            ThreatType = url.Threat ?? "Malware",
                            Severity = "HIGH",
                            Source = "Abuse.ch-URLhaus",
                            ExternalId = url.Id,
                            ExternalLink = !string.IsNullOrEmpty(url.Id) ? $"https://urlhaus.abuse.ch/url/{url.Id}/" : null,
                            Country = url.CountryCode,
                            ConfidenceScore = 90,
                        });
                        await _threatIntel.UpdateIocCacheAsync(url.Url, "URL", "Abuse.ch-URLhaus", "HIGH");
                        newCount++;
                }
                await db.SaveChangesAsync(ct);
                _logger.LogInformation("[ThreatFeed] Abuse.ch URLhaus: +{Count} new URLs.", newCount);
            }
            catch (Exception ex) { _logger.LogError(ex, "[ThreatFeed] Abuse.ch URLhaus sync failed."); }
            return newCount;
        }

        // ─────────────────────────────────────────────────────────────────────
        // 4. Abuse.ch MalwareBazaar — File Hashes
        //    Same API key as URLhaus (auth.abuse.ch)
        // ─────────────────────────────────────────────────────────────────────

        private async Task<int> SyncAbusechMalwareBazaarAsync(CancellationToken ct)
        {
            var apiKey = _configuration.GetValue<string>("Waf:ThreatFeed:AbusechApiKey");
            if (string.IsNullOrWhiteSpace(apiKey))
            {
                _logger.LogWarning("[ThreatFeed] Abuse.ch MalwareBazaar: No API key configured. Skipping.");
                return 0;
            }

            int newCount = 0;
            try
            {
                _logger.LogInformation("[ThreatFeed] Abuse.ch MalwareBazaar: Fetching recent malware hashes...");
                var request = new HttpRequestMessage(HttpMethod.Post, "https://mb-api.abuse.ch/api/v1/")
                {
                    Content = new FormUrlEncodedContent(new Dictionary<string, string>
                    {
                        ["query"] = "get_recent",
                        ["selector"] = "time"
                    })
                };
                request.Headers.Add("Auth-Key", apiKey);
                var response = await _httpClient.SendAsync(request, ct);
                if (!response.IsSuccessStatusCode) return 0;

                var json = await response.Content.ReadAsStringAsync(ct);
                var result = JsonSerializer.Deserialize<MalwareBazaarResponse>(json);
                if (result?.Data == null) return 0;

                using var scope = _scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<WafDbContext>();

                foreach (var sample in result.Data.Take(150))
                {
                    if (string.IsNullOrWhiteSpace(sample.Sha256Hash)) continue;
                    var existing = await db.IocIndicators.IgnoreQueryFilters()
                        .FirstOrDefaultAsync(i => i.IndicatorValue == sample.Sha256Hash && i.Source == "Abuse.ch-MalwareBazaar", ct);
                    if (existing != null) { existing.LastSeen = DateTime.UtcNow; existing.IsActive = true; continue; }

                        db.IocIndicators.Add(new IocIndicator
                        {
                            IndicatorValue = sample.Sha256Hash,
                            IndicatorType = "FileHash-SHA256",
                            PulseName = $"MalwareBazaar — {sample.MalwareName ?? sample.FileType ?? "Unknown"}",
                            ThreatType = sample.MalwareName ?? "Malware",
                            Severity = "HIGH",
                            Source = "Abuse.ch-MalwareBazaar",
                            ExternalId = sample.Sha256Hash,
                            ExternalLink = $"https://bazaar.abuse.ch/sample/{sample.Sha256Hash}/",
                            Country = null,
                            ConfidenceScore = 88,
                        });
                        await _threatIntel.UpdateIocCacheAsync(sample.Sha256Hash, "FileHash-SHA256", "Abuse.ch-MalwareBazaar", "HIGH");
                        newCount++;
                }
                await db.SaveChangesAsync(ct);
                _logger.LogInformation("[ThreatFeed] Abuse.ch MalwareBazaar: +{Count} new hashes.", newCount);
            }
            catch (Exception ex) { _logger.LogError(ex, "[ThreatFeed] Abuse.ch MalwareBazaar sync failed."); }
            return newCount;
        }

        // ─────────────────────────────────────────────────────────────────────
        // 5. Abuse.ch Feodo Tracker — Banking Malware Botnet C2s
        //    Public endpoint for tracking TrickBot, QakBot, Emotet (No Auth)
        // ─────────────────────────────────────────────────────────────────────

        private async Task<int> SyncFeodoTrackerAsync(CancellationToken ct)
        {
            int newCount = 0;
            try
            {
                _logger.LogInformation("[ThreatFeed] Abuse.ch Feodo Tracker: Fetching live botnet C2 IPs...");
                const string url = "https://feodotracker.abuse.ch/downloads/ipblocklist.json";
                var response = await _httpClient.GetAsync(url, ct);
                if (!response.IsSuccessStatusCode)
                {
                    _logger.LogWarning("[ThreatFeed] Abuse.ch Feodo Tracker: HTTP {Status}", response.StatusCode);
                    return 0;
                }

                var json = await response.Content.ReadAsStringAsync(ct);
                var botnetIps = JsonSerializer.Deserialize<List<FeodoTrackerResponse>>(json);
                if (botnetIps == null) return 0;

                using var scope = _scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<WafDbContext>();

                // Only take active/online infrastructure
                foreach (var botnet in botnetIps.Where(b => b.Status == "online").Take(300))
                {
                    if (string.IsNullOrWhiteSpace(botnet.IpAddress)) continue;

                    var existing = await db.IocIndicators.IgnoreQueryFilters()
                        .FirstOrDefaultAsync(i => i.IndicatorValue == botnet.IpAddress && i.Source == "Abuse.ch-FeodoTracker", ct);
                    
                    if (existing != null) { existing.LastSeen = DateTime.UtcNow; existing.IsActive = true; continue; }

                    var malwareFam = botnet.Malware ?? "Botnet-C2";
                    db.IocIndicators.Add(new IocIndicator
                    {
                        IndicatorValue = botnet.IpAddress,
                        IndicatorType = "IPv4",
                        PulseName = $"Feodo Tracker — {malwareFam}",
                        ThreatType = malwareFam,
                        Severity = "CRITICAL",  // Explicit banking/botnet malware gets CRITICAL rating
                        Source = "Abuse.ch-FeodoTracker",
                        ExternalId = botnet.IpAddress, // Feodo doesn't have an ID string natively beyond IP
                        ExternalLink = $"https://feodotracker.abuse.ch/browse/host/{botnet.IpAddress}/",
                        Country = botnet.Country,
                        ConfidenceScore = 95,
                    });
                    
                    await _threatIntel.UpdateIocCacheAsync(botnet.IpAddress, "IPv4", "Abuse.ch-FeodoTracker", "CRITICAL");
                    newCount++;
                }
                
                await db.SaveChangesAsync(ct);
                _logger.LogInformation("[ThreatFeed] Abuse.ch Feodo Tracker: +{Count} new botnet C2 IPs.", newCount);
            }
            catch (Exception ex) { _logger.LogError(ex, "[ThreatFeed] Abuse.ch Feodo Tracker sync failed."); }
            return newCount;
        }

        // ─────────────────────────────────────────────────────────────────────
        // 6. Tor Exit Nodes (Public)
        // ─────────────────────────────────────────────────────────────────────

        private async Task<int> SyncTorExitNodesAsync(CancellationToken ct)
        {
            int newCount = 0;
            try
            {
                _logger.LogInformation("[ThreatFeed] Tor Exit Nodes: Fetching latest exit IPs...");
                const string url = "https://check.torproject.org/torbulkexitlist";
                var response = await _httpClient.GetAsync(url, ct);
                if (!response.IsSuccessStatusCode) return 0;

                var text = await response.Content.ReadAsStringAsync(ct);
                var ips = text.Split('\n', StringSplitOptions.RemoveEmptyEntries)
                              .Where(ip => !ip.StartsWith("#") && !string.IsNullOrWhiteSpace(ip))
                              .Take(500); // Take top 500 for demo size bounds

                using var scope = _scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<WafDbContext>();

                foreach (var ip in ips)
                {
                    var existing = await db.IocIndicators.IgnoreQueryFilters()
                        .FirstOrDefaultAsync(i => i.IndicatorValue == ip && i.Source == "Tor-Exit-Nodes", ct);
                    if (existing != null) { existing.LastSeen = DateTime.UtcNow; existing.IsActive = true; continue; }

                    db.IocIndicators.Add(new IocIndicator
                    {
                        IndicatorValue = ip,
                        IndicatorType = "IPv4",
                        PulseName = "Tor Exit Node",
                        ThreatType = "Anonymization",
                        Severity = "MEDIUM",
                        Source = "Tor-Exit-Nodes",
                        ExternalId = ip,
                        ConfidenceScore = 100,
                    });
                    
                    await _threatIntel.UpdateIocCacheAsync(ip, "IPv4", "Tor-Exit-Nodes", "MEDIUM");
                    newCount++;
                }
                
                await db.SaveChangesAsync(ct);
                _logger.LogInformation("[ThreatFeed] Tor Exit Nodes: +{Count} new IPs.", newCount);
            }
            catch (Exception ex) { _logger.LogError(ex, "[ThreatFeed] Tor Exit Nodes sync failed."); }
            return newCount;
        }

        // ─────────────────────────────────────────────────────────────────────────
        // 7. Ethiopian INSA / CERT-ET Threat Feed
        //    Supports two wire formats (auto-detected from Content-Type / body):
        //    a) STIX 2.1 JSON Bundle  — { "type": "bundle", "objects": [...] }
        //       Extracts ipv4-addr, domain-name, url, and file SHA256 indicators.
        //    b) Plain newline-delimited IP / domain list (e.g., text/plain)
        //       Each non-comment line is classified as IPv4 or domain by parsing.
        // ─────────────────────────────────────────────────────────────────────────

        private async Task<int> SyncInsaThreatFeedAsync(CancellationToken ct)
        {
            int newCount = 0;
            try
            {
                var insaUrl = _configuration.GetValue<string>("Waf:ThreatFeed:InsaCertUrl");
                if (string.IsNullOrWhiteSpace(insaUrl))
                {
                    _logger.LogInformation("[ThreatFeed] INSA Feed: No Waf:ThreatFeed:InsaCertUrl configured. Skipping.");
                    return 0;
                }

                _logger.LogInformation("[ThreatFeed] INSA/CERT-ET: Fetching from {Url}...", insaUrl);
                var response = await _httpClient.GetAsync(insaUrl, ct);
                if (!response.IsSuccessStatusCode)
                {
                    _logger.LogWarning("[ThreatFeed] INSA Feed: HTTP {Status}", response.StatusCode);
                    return 0;
                }

                var contentType = response.Content.Headers.ContentType?.MediaType ?? "";
                var body = await response.Content.ReadAsStringAsync(ct);

                using var scope = _scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<WafDbContext>();

                // Auto-detect format: JSON (STIX bundle) vs plain text (IP list)
                if (contentType.Contains("json", StringComparison.OrdinalIgnoreCase)
                    || body.TrimStart().StartsWith('{'))
                {
                    newCount += await ParseStixBundleAsync(db, body, ct);
                }
                else
                {
                    newCount += await ParsePlainIpListAsync(db, body, ct);
                }

                await db.SaveChangesAsync(ct);
                _logger.LogInformation("[ThreatFeed] INSA/CERT-ET: +{Count} new indicators.", newCount);
            }
            catch (Exception ex) { _logger.LogError(ex, "[ThreatFeed] INSA Feed sync failed."); }
            return newCount;
        }

        /// <summary>
        /// Parses a STIX 2.1 JSON bundle. Walks bundle.objects[] for type="indicator"
        /// and extracts values from the STIX pattern field using regex.
        /// Supported pattern types: ipv4-addr, domain-name, url, file:hashes.SHA256
        /// </summary>
        private async Task<int> ParseStixBundleAsync(WafDbContext db, string json, CancellationToken ct)
        {
            int count = 0;
            try
            {
                using var doc = System.Text.Json.JsonDocument.Parse(json);
                if (!doc.RootElement.TryGetProperty("objects", out var objects)) return 0;

                var ipPat     = new System.Text.RegularExpressions.Regex(@"\[ipv4-addr:value\s*=\s*'([^']+)'\]");
                var domainPat = new System.Text.RegularExpressions.Regex(@"\[domain-name:value\s*=\s*'([^']+)'\]");
                var urlPat    = new System.Text.RegularExpressions.Regex(@"\[url:value\s*=\s*'([^']+)'\]");
                var hashPat   = new System.Text.RegularExpressions.Regex(@"\[file:hashes\.SHA256\s*=\s*'([^']+)'\]");

                foreach (var obj in objects.EnumerateArray())
                {
                    if (!obj.TryGetProperty("type", out var typeEl) || typeEl.GetString() != "indicator") continue;
                    if (!obj.TryGetProperty("pattern", out var patEl)) continue;

                    var pattern  = patEl.GetString() ?? "";
                    var name     = obj.TryGetProperty("name",   out var nameEl)   ? nameEl.GetString()   : "INSA Indicator";
                    var severity = obj.TryGetProperty("labels", out var labelsEl)
                        && labelsEl.EnumerateArray().Any(l => l.GetString()?.Contains("malicious") == true)
                        ? "HIGH" : "MEDIUM";

                    count += await UpsertInsaAsync(db, ipPat.Match(pattern).Groups[1].Value,      "IPv4",            name ?? "INSA", severity, ct);
                    count += await UpsertInsaAsync(db, domainPat.Match(pattern).Groups[1].Value,  "domain",          name ?? "INSA", severity, ct);
                    count += await UpsertInsaAsync(db, urlPat.Match(pattern).Groups[1].Value,     "URL",             name ?? "INSA", severity, ct);
                    count += await UpsertInsaAsync(db, hashPat.Match(pattern).Groups[1].Value,    "FileHash-SHA256", name ?? "INSA", severity, ct);
                }
            }
            catch (Exception ex) { _logger.LogError(ex, "[ThreatFeed] STIX bundle parse error."); }
            return count;
        }

        /// <summary>
        /// Parses a plain newline-delimited list of IPs or domain names.
        /// Lines starting with '#' are treated as comments and skipped.
        /// </summary>
        private async Task<int> ParsePlainIpListAsync(WafDbContext db, string text, CancellationToken ct)
        {
            int count = 0;
            foreach (var rawLine in text.Split('\n', StringSplitOptions.RemoveEmptyEntries))
            {
                var entry = rawLine.Trim();
                if (string.IsNullOrWhiteSpace(entry) || entry.StartsWith('#')) continue;
                var indicatorType = System.Net.IPAddress.TryParse(entry, out _) ? "IPv4" : "domain";
                count += await UpsertInsaAsync(db, entry, indicatorType, "INSA-Ethiopia Plain List", "MEDIUM", ct);
            }
            return count;
        }

        private async Task<int> UpsertInsaAsync(WafDbContext db, string value, string type, string pulseName, string severity, CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(value)) return 0;
            var existing = await db.IocIndicators.IgnoreQueryFilters()
                .FirstOrDefaultAsync(i => i.IndicatorValue == value && i.Source == "INSA-Ethiopia", ct);
            if (existing != null) { existing.LastSeen = DateTime.UtcNow; existing.IsActive = true; return 0; }

            db.IocIndicators.Add(new IocIndicator
            {
                IndicatorValue  = value,
                IndicatorType   = type,
                PulseName       = pulseName,
                ThreatType      = "Local Threat (INSA/CERT-ET)",
                Severity        = severity,
                Source          = "INSA-Ethiopia",
                ExternalId      = value,
                ConfidenceScore = 85, // Ethiopian government-sourced intel
            });
            await _threatIntel.UpdateIocCacheAsync(value, type, "INSA-Ethiopia", severity);
            return 1;
        }

        // ─────────────────────────────────────────────────────────────────────
        // Demo Seeding (no API keys present at all)
        // ─────────────────────────────────────────────────────────────────────

        private async Task SeedDemoIndicatorsAsync(CancellationToken ct)
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<WafDbContext>();
            var exists = await db.IocIndicators.IgnoreQueryFilters().AnyAsync(ct);
            if (exists) { LastSyncedAt = DateTime.UtcNow; return; }

            _logger.LogInformation("[ThreatFeed] No API keys configured — seeding demo IOC indicators for UI preview.");
            var now = DateTime.UtcNow;
            db.IocIndicators.AddRange(new[]
            {
                // AlienVault OTX
                new IocIndicator { IndicatorValue = "45.142.212.100", IndicatorType = "IPv4", PulseName = "Ryuk Ransomware C2 Servers", ThreatType = "Ransomware", Severity = "CRITICAL", Source = "AlienVault-OTX", Country = "RU", ConfidenceScore = 95 },
                new IocIndicator { IndicatorValue = "91.108.4.0", IndicatorType = "IPv4", PulseName = "APT28 Infrastructure", ThreatType = "APT", Severity = "CRITICAL", Source = "AlienVault-OTX", Country = "RU", ConfidenceScore = 99 },
                new IocIndicator { IndicatorValue = "185.220.101.45", IndicatorType = "IPv4", PulseName = "Tor Exit Nodes", ThreatType = "Anonymization", Severity = "HIGH", Source = "AlienVault-OTX", Country = "DE", ConfidenceScore = 88 },
                new IocIndicator { IndicatorValue = "malware-cdn.xyz", IndicatorType = "domain", PulseName = "Emotet Payload Distribution", ThreatType = "Malware", Severity = "HIGH", Source = "AlienVault-OTX", Country = "NL", ConfidenceScore = 85 },
                new IocIndicator { IndicatorValue = "login-secure.bankofeth.tk", IndicatorType = "domain", PulseName = "Ethiopia Banking Phishing", ThreatType = "Phishing", Severity = "CRITICAL", Source = "AlienVault-OTX", Country = "NG", ConfidenceScore = 92 },
                new IocIndicator { IndicatorValue = "aae5b3f2d19a7563b73e6e4a3a5f3d8c1b2e4f6a", IndicatorType = "FileHash-SHA1", PulseName = "Conti Ransomware Payload", ThreatType = "Ransomware", Severity = "CRITICAL", Source = "AlienVault-OTX", Country = null, ConfidenceScore = 97 },
                // CISA KEV
                new IocIndicator { IndicatorValue = "CVE-2024-21887", IndicatorType = "CVE", PulseName = "Ivanti Connect Secure", ThreatType = "Apply mitigations per vendor instructions", Severity = "CRITICAL", Source = "CISA-KEV", Country = null, ConfidenceScore = 100 },
                new IocIndicator { IndicatorValue = "CVE-2024-3400", IndicatorType = "CVE", PulseName = "Palo Alto PAN-OS", ThreatType = "Apply updates per vendor instructions immediately", Severity = "CRITICAL", Source = "CISA-KEV", Country = null, ConfidenceScore = 100 },
                new IocIndicator { IndicatorValue = "CVE-2023-44487", IndicatorType = "CVE", PulseName = "HTTP/2 Rapid Reset Attack", ThreatType = "Apply patches or implement rate-limiting mitigations", Severity = "HIGH", Source = "CISA-KEV", Country = null, ConfidenceScore = 100 },
                new IocIndicator { IndicatorValue = "CVE-2023-23397", IndicatorType = "CVE", PulseName = "Microsoft Outlook (NTLM)", ThreatType = "Apply vendor-provided update immediately", Severity = "CRITICAL", Source = "CISA-KEV", Country = null, ConfidenceScore = 100 },
                // Abuse.ch URLhaus
                new IocIndicator { IndicatorValue = "http://94.103.91.245/bins/arm7", IndicatorType = "URL", PulseName = "URLhaus — Mirai Botnet Distribution", ThreatType = "Botnet", Severity = "HIGH", Source = "Abuse.ch-URLhaus", Country = "NL", ConfidenceScore = 90 },
                new IocIndicator { IndicatorValue = "http://dl.free-ebooks.net/ebook.php?id=malware", IndicatorType = "URL", PulseName = "URLhaus — Drive-by Downloads", ThreatType = "Malware", Severity = "HIGH", Source = "Abuse.ch-URLhaus", Country = "US", ConfidenceScore = 82 },
                // Abuse.ch MalwareBazaar
                new IocIndicator { IndicatorValue = "5f4dcc3b5aa765d61d8327deb882cf99a35d7b43927c615b01bf6a6e0000f1a0", IndicatorType = "FileHash-SHA256", PulseName = "MalwareBazaar — AgentTesla RAT", ThreatType = "RAT", Severity = "HIGH", Source = "Abuse.ch-MalwareBazaar", Country = null, ConfidenceScore = 88 },
                new IocIndicator { IndicatorValue = "d41d8cd98f00b204e9800998ecf8427e00000000000000000000000000000000", IndicatorType = "FileHash-SHA256", PulseName = "MalwareBazaar — Formbook Stealer", ThreatType = "Stealer", Severity = "HIGH", Source = "Abuse.ch-MalwareBazaar", Country = null, ConfidenceScore = 84 },
                // Abuse.ch Feodo Tracker
                new IocIndicator { IndicatorValue = "192.168.100.55", IndicatorType = "IPv4", PulseName = "Feodo Tracker — QakBot", ThreatType = "QakBot", Severity = "CRITICAL", Source = "Abuse.ch-FeodoTracker", Country = "CH", ConfidenceScore = 95 },
            });
            await db.SaveChangesAsync(ct);
            LastSyncedAt = DateTime.UtcNow;
            _logger.LogInformation("[ThreatFeed] Demo seeding complete: 15 indicators across 5 sources.");
        }

        // ─────────────────────────────────────────────────────────────────────
        // Helpers
        // ─────────────────────────────────────────────────────────────────────

        private static string MapOtxType(string? t) => t switch
        {
            "IPv4" => "IPv4", "IPv6" => "IPv6",
            "domain" or "hostname" => "domain",
            "URL" => "URL",
            "FileHash-MD5" => "FileHash-MD5",
            "FileHash-SHA1" => "FileHash-SHA1",
            "FileHash-SHA256" => "FileHash-SHA256",
            _ => "other"
        };

        private static string CalculateSeverity(int subscriberCount) => subscriberCount switch
        {
            > 500 => "CRITICAL", > 100 => "HIGH", > 20 => "MEDIUM", _ => "LOW"
        };

        // ─────────────────────────────────────────────────────────────────────
        // API Response DTOs
        // ─────────────────────────────────────────────────────────────────────

        // AlienVault OTX
        private class OtxPulseResponse
        {
            [JsonPropertyName("next")] public string? Next { get; set; }
            [JsonPropertyName("results")] public List<OtxPulse>? Results { get; set; }
        }
        private class OtxPulse
        {
            [JsonPropertyName("id")] public string? Id { get; set; }
            [JsonPropertyName("name")] public string? Name { get; set; }
            [JsonPropertyName("subscriber_count")] public int SubscriberCount { get; set; }
            [JsonPropertyName("tags")] public List<string>? Tags { get; set; }
            [JsonPropertyName("indicators")] public List<OtxIndicator>? Indicators { get; set; }
        }
        private class OtxIndicator
        {
            [JsonPropertyName("indicator")] public string? Indicator { get; set; }
            [JsonPropertyName("type")] public string? Type { get; set; }
            [JsonPropertyName("country_name")] public string? Country { get; set; }
        }

        // CISA KEV
        private class CisaKevCatalog
        {
            [JsonPropertyName("vulnerabilities")] public List<CisaVuln>? Vulnerabilities { get; set; }
        }
        private class CisaVuln
        {
            [JsonPropertyName("cveID")] public string? CveId { get; set; }
            [JsonPropertyName("vendorProject")] public string? VendorProject { get; set; }
            [JsonPropertyName("product")] public string? Product { get; set; }
            [JsonPropertyName("requiredAction")] public string? RequiredAction { get; set; }
            [JsonPropertyName("dueDate")] public string? DueDate { get; set; }
        }

        // Abuse.ch URLhaus
        private class UrlhausResponse
        {
            [JsonPropertyName("urls")] public List<UrlhausUrl>? Urls { get; set; }
        }
        private class UrlhausUrl
        {
            [JsonPropertyName("id")] public string? Id { get; set; }
            [JsonPropertyName("url")] public string? Url { get; set; }
            [JsonPropertyName("url_status")] public string? UrlStatus { get; set; }
            [JsonPropertyName("threat")] public string? Threat { get; set; }
            [JsonPropertyName("country_code")] public string? CountryCode { get; set; }
        }

        // Abuse.ch MalwareBazaar
        private class MalwareBazaarResponse
        {
            [JsonPropertyName("data")] public List<MalwareBazaarSample>? Data { get; set; }
        }
        private class MalwareBazaarSample
        {
            [JsonPropertyName("sha256_hash")] public string? Sha256Hash { get; set; }
            [JsonPropertyName("file_type")] public string? FileType { get; set; }
            [JsonPropertyName("signature")] public string? MalwareName { get; set; }
        }

        // Abuse.ch Feodo Tracker
        private class FeodoTrackerResponse
        {
            [JsonPropertyName("ip_address")] public string? IpAddress { get; set; }
            [JsonPropertyName("port")] public int? Port { get; set; }
            [JsonPropertyName("status")] public string? Status { get; set; }
            [JsonPropertyName("hostname")] public string? Hostname { get; set; }
            [JsonPropertyName("country")] public string? Country { get; set; }
            [JsonPropertyName("malware")] public string? Malware { get; set; }
        }

        private async Task PruneExpiredIndicatorsAsync(CancellationToken ct)
        {
            try
            {
                int retentionDays = _configuration.GetValue<int>("Waf:ThreatFeed:RetentionDays", 90);
                var threshold = DateTime.UtcNow.AddDays(-retentionDays);

                using var scope = _scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<WafDbContext>();

                // We only prune if they weren't seen recently. 
                // Many feeds update LastSeen.
                var staleCount = await db.IocIndicators
                    .IgnoreQueryFilters()
                    .Where(i => i.LastSeen < threshold)
                    .ExecuteUpdateAsync(s => s.SetProperty(i => i.IsActive, false), ct);

                if (staleCount > 0)
                {
                    _logger.LogInformation("[ThreatFeed] Automated Retention: Pruned {Count} stale indicators older than {Days} days.", staleCount, retentionDays);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[ThreatFeed] Error during automated retention pruning.");
            }
        }
    }
}

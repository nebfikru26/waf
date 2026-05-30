using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.DependencyInjection;
using AffiniSecurity.Waf.Data;
using AffiniSecurity.Waf.Models;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using System.IO.Compression;

namespace AffiniSecurity.Waf.Services
{
    public class CrsDiscoveryService : BackgroundService
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly ILogger<CrsDiscoveryService> _logger;
        private const string RulesPath = "/opt/coraza/owasp-crs/rules";

        public CrsDiscoveryService(IServiceProvider serviceProvider, ILogger<CrsDiscoveryService> logger)
        {
            _serviceProvider = serviceProvider;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("CRS Discovery Service starting...");

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    await ImportNewRulesAsync($"AUTO-{DateTime.UtcNow:yyyyMMdd}");
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error during CRS rule discovery.");
                }

                await Task.Delay(TimeSpan.FromHours(1), stoppingToken);
            }
        }

        // Called by the controller for manual sync from disk
        public async Task<int> RunManualDiscoveryAsync()
        {
            var tag = $"SYNC-{DateTime.UtcNow:yyyyMMdd-HHmm}";
            return await ImportNewRulesAsync(tag);
        }

        // Called by the controller for GitHub-based sync
        public async Task<int> DownloadLatestFromGitHubAsync()
        {
            _logger.LogInformation("Starting CRS update from GitHub OWASP Core Rule Set...");

            var tempZipPath = Path.Combine(Path.GetTempPath(), "crs.zip");
            var tempExtractPath = Path.Combine(Path.GetTempPath(), "crs_extracted");

            try
            {
                // Resolve URL from DB config
                using var scope = _serviceProvider.CreateScope();
                var context = scope.ServiceProvider.GetRequiredService<WafDbContext>();
                var config = await context.SystemConfigs.FirstOrDefaultAsync();
                var repoUrl = config?.CrsRulesRepositoryUrl
                    ?? "https://github.com/coreruleset/coreruleset/archive/refs/heads/main.zip";

                using var client = new HttpClient();
                client.Timeout = TimeSpan.FromMinutes(5);
                client.DefaultRequestHeaders.Add("User-Agent", "AffiniSecurity-WAF-Bot/2026");

                _logger.LogInformation("Downloading CRS archive from {Url}...", repoUrl);
                var response = await client.GetAsync(repoUrl);
                response.EnsureSuccessStatusCode();

                await using (var fs = new FileStream(tempZipPath, FileMode.Create))
                {
                    await response.Content.CopyToAsync(fs);
                }

                if (Directory.Exists(tempExtractPath)) Directory.Delete(tempExtractPath, true);
                ZipFile.ExtractToDirectory(tempZipPath, tempExtractPath);

                var rootDir = Directory.GetDirectories(tempExtractPath).FirstOrDefault();
                if (rootDir == null) throw new InvalidOperationException("Failed to find root directory in CRS archive.");

                var sourceRulesPath = Path.Combine(rootDir, "rules");
                if (!Directory.Exists(sourceRulesPath)) throw new InvalidOperationException("Failed to find 'rules' folder in CRS archive.");

                _logger.LogInformation("Copying rules to: {Path}", RulesPath);
                if (!Directory.Exists(RulesPath)) Directory.CreateDirectory(RulesPath);

                foreach (var file in Directory.GetFiles(sourceRulesPath, "*.*")
                    .Where(f => f.EndsWith(".conf") || f.EndsWith(".data")))
                {
                    File.Copy(file, Path.Combine(RulesPath, Path.GetFileName(file)), overwrite: true);
                }

                _logger.LogInformation("Filesystem updated. Running discovery pass...");
                return await RunManualDiscoveryAsync();
            }
            finally
            {
                if (File.Exists(tempZipPath)) File.Delete(tempZipPath);
                if (Directory.Exists(tempExtractPath)) Directory.Delete(tempExtractPath, true);
            }
        }

        // Dry-run: returns list of rules on disk that are NOT yet in the database
        public async Task<List<OWASPRule>> PreviewRulesAsync()
        {
            _logger.LogInformation("Previewing new CRS rules from disk...");
            return await ScanRulesAsync(versionTag: null, dryRun: true);
        }

        // ── Core Implementation ──────────────────────────────────────────────────────

        private async Task<int> ImportNewRulesAsync(string versionTag)
        {
            var newRules = await ScanRulesAsync(versionTag, dryRun: false);
            return newRules.Count;
        }

        private async Task<List<OWASPRule>> ScanRulesAsync(string? versionTag, bool dryRun)
        {
            var results = new List<OWASPRule>();

            if (!Directory.Exists(RulesPath))
            {
                _logger.LogWarning("CRS Rules path not found: {Path}. Skipping discovery.", RulesPath);
                return results;
            }

            using var scope = _serviceProvider.CreateScope();
            var context = scope.ServiceProvider.GetRequiredService<WafDbContext>();

            var confFiles = Directory.GetFiles(RulesPath, "*.conf");
            var idRegex = new Regex(@"id:(\d+)", RegexOptions.Compiled);
            var msgRegex = new Regex(@"msg:'([^']+)'|msg:""([^""]+)""", RegexOptions.Compiled);

            foreach (var file in confFiles)
            {
                var content = await File.ReadAllTextAsync(file);
                var fileName = Path.GetFileName(file);
                var idMatches = idRegex.Matches(content);

                foreach (Match match in idMatches)
                {
                    var ruleId = match.Groups[1].Value;
                    var lookAhead = content.Substring(match.Index, Math.Min(500, content.Length - match.Index));
                    var msgMatch = msgRegex.Match(lookAhead);
                    var description = msgMatch.Success
                        ? (msgMatch.Groups[1].Value + msgMatch.Groups[2].Value)
                        : $"Rule {ruleId} from {fileName}";

                    var existing = await context.OWASPRules
                        .IgnoreQueryFilters()
                        .AnyAsync(r => r.Id == ruleId);

                    if (!existing)
                    {
                        var category = fileName.Contains("SQLI", StringComparison.OrdinalIgnoreCase) ? "SQL Injection" :
                                       fileName.Contains("XSS", StringComparison.OrdinalIgnoreCase) ? "Cross-Site Scripting" :
                                       fileName.Contains("LFI", StringComparison.OrdinalIgnoreCase) ? "Local File Inclusion" :
                                       fileName.Contains("RCE", StringComparison.OrdinalIgnoreCase) ? "Remote Code Execution" :
                                       fileName.Contains("BOT", StringComparison.OrdinalIgnoreCase) ? "Bot Detection" :
                                       fileName.Contains("PROTOCOL", StringComparison.OrdinalIgnoreCase) ? "Protocol Enforcement" : "General Protection";

                        var newRule = new OWASPRule
                        {
                            Id = ruleId,
                            RuleId = ruleId,
                            Name = description,
                            Description = $"Part of {fileName}",
                            Category = category,
                            Action = "LOG",
                            Severity = ruleId.StartsWith("9") ? "CRITICAL" : "MEDIUM",
                            VersionTag = versionTag,
                            ImportedAt = DateTime.UtcNow
                        };

                        results.Add(newRule);

                        if (!dryRun)
                        {
                            context.OWASPRules.Add(newRule);
                        }
                    }
                }
            }

            if (!dryRun && results.Count > 0)
            {
                await context.SaveChangesAsync();
                _logger.LogInformation("Imported {Count} new CRS rules with tag {Tag}", results.Count, versionTag);
            }

            return results;
        }
    }
}

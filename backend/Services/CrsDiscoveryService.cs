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
        private readonly string _rulesPath;

        public CrsDiscoveryService(IServiceProvider serviceProvider, ILogger<CrsDiscoveryService> logger, Microsoft.Extensions.Configuration.IConfiguration configuration)
        {
            _serviceProvider = serviceProvider;
            _logger = logger;
            
            var configPath = configuration["Waf:OwaspCrsPath"] ?? "owasp-crs/rules";
            // If the path is relative, make it relative to the app execution directory
            _rulesPath = Path.IsPathRooted(configPath) 
                ? configPath 
                : Path.Combine(AppDomain.CurrentDomain.BaseDirectory, configPath);
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

                _logger.LogInformation("Copying rules to: {Path}", _rulesPath);
                if (!Directory.Exists(_rulesPath)) Directory.CreateDirectory(_rulesPath);

                foreach (var file in Directory.GetFiles(sourceRulesPath, "*.*")
                    .Where(f => f.EndsWith(".conf") || f.EndsWith(".data")))
                {
                    File.Copy(file, Path.Combine(_rulesPath, Path.GetFileName(file)), overwrite: true);
                }

                _logger.LogInformation("Filesystem updated. Rules have been downloaded but NOT committed to the DB yet.");
                
                // Return the number of rules staged for preview
                var pendingRules = await ScanRulesAsync(versionTag: null, dryRun: true);
                return pendingRules.Count;
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

            if (!Directory.Exists(_rulesPath))
            {
                _logger.LogWarning("CRS Rules path not found: {Path}. Skipping discovery.", _rulesPath);
                return results;
            }

            using var scope = _serviceProvider.CreateScope();
            var context = scope.ServiceProvider.GetRequiredService<WafDbContext>();

            var confFiles = Directory.GetFiles(_rulesPath, "*.conf");
            var idRegex = new Regex(@"id:(\d+)", RegexOptions.Compiled);
            var msgRegex = new Regex(@"msg:'([^']+)'|msg:""([^""]+)""", RegexOptions.Compiled);

            foreach (var file in confFiles)
            {
                var content = await File.ReadAllTextAsync(file);
                var fileName = Path.GetFileName(file);
                var idMatches = idRegex.Matches(content);

                if (fileName.Contains("test-fake")) {
                    Console.WriteLine($"[DEBUG] Parsing {fileName}, found {idMatches.Count} matches for 'id:'.");
                }

                foreach (Match match in idMatches)
                {
                    var ruleId = match.Groups[1].Value;
                    var lookAhead = content.Substring(match.Index, Math.Min(500, content.Length - match.Index));
                    var msgMatch = msgRegex.Match(lookAhead);
                    var description = msgMatch.Success
                        ? (msgMatch.Groups[1].Value + msgMatch.Groups[2].Value)
                        : $"Rule {ruleId} from {fileName}";

                    if (fileName.Contains("test-fake")) {
                        Console.WriteLine($"[DEBUG] RuleId: {ruleId}. Description: {description}");
                    }

                    var category = fileName.Contains("SQLI", StringComparison.OrdinalIgnoreCase) ? "SQL Injection" :
                                   fileName.Contains("XSS", StringComparison.OrdinalIgnoreCase) ? "Cross-Site Scripting" :
                                   fileName.Contains("LFI", StringComparison.OrdinalIgnoreCase) ? "Local File Inclusion" :
                                   fileName.Contains("RFI", StringComparison.OrdinalIgnoreCase) ? "Remote File Inclusion" :
                                   fileName.Contains("RCE", StringComparison.OrdinalIgnoreCase) ? "Remote Code Execution" :
                                   fileName.Contains("PHP", StringComparison.OrdinalIgnoreCase) ? "PHP Injection" :
                                   fileName.Contains("JAVA", StringComparison.OrdinalIgnoreCase) ? "Java Injection" :
                                   fileName.Contains("NODEJS", StringComparison.OrdinalIgnoreCase) ? "Node.js Injection" :
                                   fileName.Contains("SCANNER", StringComparison.OrdinalIgnoreCase) ? "Scanner Detection" :
                                   fileName.Contains("LEAKAGE", StringComparison.OrdinalIgnoreCase) ? "Data Leakage" :
                                   fileName.Contains("PROTOCOL", StringComparison.OrdinalIgnoreCase) ? "Protocol Enforcement" :
                                   fileName.Contains("DOS", StringComparison.OrdinalIgnoreCase) ? "DoS Protection" :
                                   fileName.Contains("BOT", StringComparison.OrdinalIgnoreCase) ? "Bot Detection" :
                                   fileName.Contains("POLICY", StringComparison.OrdinalIgnoreCase) ? "Security Policy" :
                                   fileName.Contains("FIXATION", StringComparison.OrdinalIgnoreCase) ? "Session Fixation" :
                                   fileName.Contains("INITIALIZATION", StringComparison.OrdinalIgnoreCase) ? "Initialization" : "General Protection";

                    var existingRule = await context.OWASPRules
                        .IgnoreQueryFilters()
                        .FirstOrDefaultAsync(r => r.Id == ruleId);

                    if (existingRule == null)
                    {
                        var newRule = new OWASPRule
                        {
                            Id = ruleId,
                            RuleId = ruleId,
                            TenantId = null,
                            Name = description,
                            Description = $"Part of {fileName}",
                            Category = category,
                            Action = "LOG",
                            Severity = ruleId.StartsWith("9") ? "CRITICAL" : "MEDIUM",
                            VersionTag = versionTag,
                            ImportedAt = DateTime.UtcNow
                        };

                        results.Add(newRule);
                        if (!dryRun) context.OWASPRules.Add(newRule);
                    }
                    else if (!dryRun && (existingRule.Category == "General Protection" || string.IsNullOrEmpty(existingRule.Category) || existingRule.Category == "PROTOCOL"))
                    {
                        // Update category if it was previously miscategorized or generic
                        existingRule.Category = category;
                        existingRule.VersionTag = versionTag;
                        results.Add(existingRule);
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

using System;
using System.IO;
using System.Text;
using System.Net.Http;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.EntityFrameworkCore;
using AffiniSecurity.Waf.Data;
using System.Net.Http.Json;

namespace AffiniSecurity.Waf.Services
{
    public class WafConfigGenerator
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly ILogger<WafConfigGenerator> _logger;
        private readonly string _configPath;
        private readonly string _routesPath;
        private readonly string _nginxReloadSignalPath;

        public WafConfigGenerator(IServiceScopeFactory scopeFactory, ILogger<WafConfigGenerator> logger, Microsoft.Extensions.Configuration.IConfiguration configuration)
        {
            _scopeFactory = scopeFactory;
            _logger = logger;

            var baseDir = AppDomain.CurrentDomain.BaseDirectory;
            var nginxDir = Path.Combine(baseDir, "nginx");
            if (!Directory.Exists(nginxDir)) Directory.CreateDirectory(nginxDir);
            if (!Directory.Exists(Path.Combine(nginxDir, "conf.d", "tenants"))) Directory.CreateDirectory(Path.Combine(nginxDir, "conf.d", "tenants"));

            _configPath = configuration["Waf:NginxConfigPath"] ?? Path.Combine(nginxDir, "coraza", "tenant-rules.conf");
            _routesPath = configuration["Waf:NginxRoutesPath"] ?? Path.Combine(nginxDir, "conf.d", "tenants", "tenants.conf");
            _nginxReloadSignalPath = Path.Combine(nginxDir, "reload.signal");
            
            // Initial generation on startup
            _ = GenerateAndReloadAsync();
        }

        public async Task GenerateAndReloadAsync()
        {
            _logger.LogInformation("Generating dynamic Nginx/WAF configuration for all tenants...");

            var sb = new StringBuilder();
            sb.AppendLine("# --- DYNAMIC TENANT ORCHESTRATION ---");
            sb.AppendLine("# Generated automatically. Do not edit manually.");
            sb.AppendLine();

            var routesSb = new StringBuilder();
            routesSb.AppendLine("# --- DYNAMIC TENANT ROUTES ---");
            routesSb.AppendLine("# Generated automatically. Do not edit manually.");
            routesSb.AppendLine();

            using (var scope = _scopeFactory.CreateScope())
            {
                var context = scope.ServiceProvider.GetRequiredService<WafDbContext>();
                var domains = await context.Domains.IgnoreQueryFilters().ToListAsync();
                var allSettings = await context.SecuritySettings.IgnoreQueryFilters().ToListAsync();
                
                var allOwaspOverrides = await context.OWASPRules.IgnoreQueryFilters()
                    .Where(r => r.TenantId != null && r.RuleId != null)
                    .ToListAsync();
                
                var allCustomRules = await context.CustomRules.IgnoreQueryFilters()
                    .Where(r => r.Enabled)
                    .ToListAsync();
                    
                var allRuleExclusions = await context.OWASPRuleExclusions.IgnoreQueryFilters()
                    .Where(r => r.TenantId != null)
                    .ToListAsync();

                // Fetch all rule files to identify valid rule IDs and prevent "Rule not found" crashes in Nginx/Coraza
                var validRuleIds = new HashSet<int>();
                var rulesDir = scope.ServiceProvider.GetRequiredService<Microsoft.Extensions.Configuration.IConfiguration>()["Waf:OwaspCrsPath"] 
                               ?? Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "owasp-rules", "rules");
                
                if (Directory.Exists(rulesDir))
                {
                    var ruleFiles = Directory.GetFiles(rulesDir, "*.conf");
                    foreach (var file in ruleFiles)
                    {
                        var content = await File.ReadAllTextAsync(file);
                        var matches = System.Text.RegularExpressions.Regex.Matches(content, @"id:(\d+)");
                        foreach (System.Text.RegularExpressions.Match match in matches)
                        {
                            if (int.TryParse(match.Groups[1].Value, out int rid)) validRuleIds.Add(rid);
                        }
                    }
                }

                int ruleIdBase = 400000;

                foreach (var domain in domains)
                {
                    if (string.IsNullOrWhiteSpace(domain.DomainName)) continue;
                    
                    string engineMode = domain.ProtectionMode?.ToLower() == "detection" ? "DetectionOnly" : "On";
                    int paranoia = domain.Sensitivity > 0 ? domain.Sensitivity : 1;

                    sb.AppendLine($"# Orchestration for Domain: {domain.DomainName}");
                    sb.AppendLine($"SecRule REQUEST_HEADERS:Host \"@streq {domain.DomainName}\" \"id:{ruleIdBase++},phase:1,t:none,nolog,pass,ctl:ruleEngine={engineMode}\"");
                    sb.AppendLine($"SecRule REQUEST_HEADERS:Host \"@streq {domain.DomainName}\" \"id:{ruleIdBase++},phase:1,t:none,nolog,pass,setvar:tx.paranoia_level={paranoia}\"");
                    
                    // --- OWASP Rule URI Exclusions ---
                    var tenantExclusions = allRuleExclusions.Where(r => r.TenantId == domain.TenantId).ToList();
                    foreach (var exc in tenantExclusions)
                    {
                        if (int.TryParse(exc.RuleId, out int rid) && !validRuleIds.Contains(rid)) continue;
                        
                        sb.AppendLine($"SecRule REQUEST_HEADERS:Host \"@streq {domain.DomainName}\" \"id:{ruleIdBase++},phase:1,t:none,nolog,pass,chain\"");
                        sb.AppendLine($"  SecRule REQUEST_URI \"@beginsWith {exc.UriPattern}\" \"ctl:ruleRemoveById={exc.RuleId}\"");
                    }

                    // --- OWASP Core Rule Set Overrides ---
                    var tenantOverrides = allOwaspOverrides.Where(r => r.TenantId == domain.TenantId).ToList();
                    foreach (var ovr in tenantOverrides)
                    {
                        if (string.IsNullOrEmpty(ovr.RuleId) || !int.TryParse(ovr.RuleId, out int rid) || !validRuleIds.Contains(rid)) continue;

                        string corazaAction = ovr.Action.ToUpper() switch {
                            "BLOCK" => "deny",
                            "DISABLED" => "remove",
                            _ => "pass"
                        };
                        
                        if (corazaAction == "remove") {
                            sb.AppendLine($"SecRule REQUEST_HEADERS:Host \"@streq {domain.DomainName}\" \"id:{ruleIdBase++},phase:1,t:none,nolog,pass,ctl:ruleRemoveById={ovr.RuleId}\"");
                        } else {
                            string severityAction = !string.IsNullOrEmpty(ovr.Severity) ? $",severity:'{ovr.Severity}'" : "";
                            sb.AppendLine($"SecRuleUpdateActionById {ovr.RuleId} \"{corazaAction}{severityAction}\"");
                        }
                    }

                    // --- Custom Rules ---
                    var customRules = allCustomRules.Where(r => r.TenantId == domain.TenantId).OrderBy(r => r.Priority).ToList();
                    foreach (var rule in customRules)
                    {
                        if (rule.IsRaw && !string.IsNullOrWhiteSpace(rule.RawContent))
                        {
                            sb.AppendLine(rule.RawContent);
                        }
                        else
                        {
                            string op = rule.ConditionOperator.ToLower() switch {
                                "contains" => "@contains",
                                "starts_with" => "@beginsWith",
                                "ends_with" => "@endsWith",
                                "regex" => "@rx",
                                _ => "@streq"
                            };
                            string field = rule.ConditionField.ToUpper() switch {
                                "IP" => "REMOTE_ADDR",
                                "URL" => "REQUEST_URI",
                                "USER_AGENT" => "REQUEST_HEADERS:User-Agent",
                                "METHOD" => "REQUEST_METHOD",
                                _ => "REQUEST_URI"
                            };
                            string action = rule.Action.ToUpper() == "BLOCK" ? "deny,status:403" : "pass,log";
                            sb.AppendLine($"SecRule {field} \"{op} {rule.ConditionValue}\" \"id:{ruleIdBase++},phase:2,t:none,{action},msg:'Custom Rule: {rule.Name}'\"");
                        }
                    }
                    sb.AppendLine();

                    if (!string.IsNullOrWhiteSpace(domain.OriginIp))
                    {
                        routesSb.AppendLine($"# Server block for {domain.DomainName}");
                        routesSb.AppendLine($"server {{");
                        routesSb.AppendLine($"    listen 80;");
                        routesSb.AppendLine($"    server_name {domain.DomainName};");
                        routesSb.AppendLine();
                        routesSb.AppendLine($"    # WAF Enabled");
                        routesSb.AppendLine($"    coraza on;");
                        routesSb.AppendLine($"    coraza_rules_file /opt/coraza/config/coraza-rules.conf;");
                        routesSb.AppendLine();
                        
                        var settings = allSettings.FirstOrDefault(s => s.TenantId == domain.TenantId);
                        bool isChallengeForced = domain.UnderAttackMode || 
                            (settings != null && settings.BotProtectionEnabled && 
                            (settings.JsChallengeEnabled || settings.CaptchaEnabled || settings.FingerprintingEnabled));

                        if (isChallengeForced)
                        {
                            routesSb.AppendLine("    location /api/waf/verify {");
                            routesSb.AppendLine("        proxy_pass http://api-dotnet:8080;");
                            routesSb.AppendLine("    }");
                            routesSb.AppendLine();
                            routesSb.AppendLine("    location / {");
                            routesSb.AppendLine("        if ($http_cookie !~* \"affini_clearance=\") {");
                            routesSb.AppendLine($"            rewrite ^ /api/waf/challenge?domain={domain.DomainName}&target=$request_uri break;");
                            routesSb.AppendLine("            proxy_pass http://api-dotnet:8080;");
                            routesSb.AppendLine("        }");
                            routesSb.AppendLine($"        proxy_pass http://{domain.OriginIp};");
                            routesSb.AppendLine("        proxy_set_header Host $host;");
                            routesSb.AppendLine("        proxy_set_header X-Real-IP $remote_addr;");
                            routesSb.AppendLine("        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;");
                            routesSb.AppendLine("    }");
                        }
                        else
                        {
                            routesSb.AppendLine("    location / {");
                            routesSb.AppendLine($"        proxy_pass http://{domain.OriginIp};");
                            routesSb.AppendLine("        proxy_set_header Host $host;");
                            routesSb.AppendLine("        proxy_set_header X-Real-IP $remote_addr;");
                            routesSb.AppendLine("        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;");
                            routesSb.AppendLine("    }");
                        }
                        routesSb.AppendLine("}");
                        routesSb.AppendLine();
                    }
                }
            }

            try
            {
                await File.WriteAllTextAsync(_configPath, sb.ToString());
                await File.WriteAllTextAsync(_routesPath, routesSb.ToString());
                _logger.LogInformation($"Wrote WAF configs. Triggering Nginx reload signal...");

                await SignalNginxReloadAsync();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to generate or reload WAF configuration.");
            }
        }

        private async Task SignalNginxReloadAsync()
        {
            try
            {
                // In this local Docker transition, we write a signal file that a sidecar or cron can pick up.
                // In production Kubernetes, we would update an Ingress or ConfigMap instead.
                await File.WriteAllTextAsync(_nginxReloadSignalPath, DateTime.UtcNow.ToString());
                _logger.LogInformation("Nginx reload signal written to shared volume.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to write Nginx reload signal.");
            }
        }
    }
}

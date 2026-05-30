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
        private readonly string _configPath = "/app/caddy/tenant-rules.conf";
        private readonly string _routesPath = "/app/caddy/tenant-routes.caddy";
        private readonly string _caddyApiUrl = "http://coraza-waf:2019/load";

        public WafConfigGenerator(IServiceScopeFactory scopeFactory, ILogger<WafConfigGenerator> logger)
        {
            _scopeFactory = scopeFactory;
            _logger = logger;
            
            // Initial generation on startup to ensure persistence across container restarts
            _ = GenerateAndReloadAsync();
        }

        public async Task GenerateAndReloadAsync()
        {
            _logger.LogInformation("Generating dynamic WAF configuration for all tenants...");

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
                
                // Fetch all overrides and custom rules upfront to minimize DB roundtrips in the loop
                var allOwaspOverrides = await context.OWASPRules.IgnoreQueryFilters()
                    .Where(r => r.TenantId != null && r.RuleId != null)
                    .ToListAsync();
                
                var allCustomRules = await context.CustomRules.IgnoreQueryFilters()
                    .Where(r => r.Enabled)
                    .ToListAsync();
                    
                var allRuleExclusions = await context.OWASPRuleExclusions.IgnoreQueryFilters()
                    .Where(r => r.TenantId != null)
                    .ToListAsync();

                int ruleIdBase = 400000;
                int routesRuleIdBase = 500000;

                foreach (var domain in domains)
                {
                    if (string.IsNullOrWhiteSpace(domain.DomainName)) continue;
                    
                    // localhost orchestration is now enabled for testing
                    if (domain.DomainName.ToLower() == "localhost") { 
                        // Proceed with orchestration
                    }

                    string engineMode = domain.ProtectionMode?.ToLower() == "detection" ? "DetectionOnly" : "On";
                    int paranoia = domain.Sensitivity > 0 ? domain.Sensitivity : 1;

                    sb.AppendLine($"# Orchestration for Domain: {domain.DomainName}");
                    sb.AppendLine($"SecRule REQUEST_HEADERS:Host \"@streq {domain.DomainName}\" \"id:{ruleIdBase++},phase:1,t:none,nolog,pass,ctl:ruleEngine={engineMode}\"");
                    sb.AppendLine($"SecRule REQUEST_HEADERS:Host \"@streq {domain.DomainName}\" \"id:{ruleIdBase++},phase:1,t:none,nolog,pass,setvar:tx.paranoia_level={paranoia}\"");
                    
                    // --- OWASP Rule URI Exclusions ---
                    var tenantExclusions = allRuleExclusions.Where(r => r.TenantId == domain.TenantId).ToList();
                    if (tenantExclusions.Any())
                    {
                        sb.AppendLine($"# OWASP URI Exclusions for Tenant {domain.TenantId}");
                        foreach (var exc in tenantExclusions)
                        {
                            // Scoped exclusion: Only remove the rule if BOTH the Host and the URI pattern match
                            sb.AppendLine($"SecRule REQUEST_HEADERS:Host \"@streq {domain.DomainName}\" \"id:{ruleIdBase++},phase:1,t:none,nolog,pass,chain\"");
                            sb.AppendLine($"  SecRule REQUEST_URI \"@beginsWith {exc.UriPattern}\" \"ctl:ruleRemoveById={exc.RuleId}\"");
                        }
                    }

                    // --- OWASP Core Rule Set Overrides ---
                    var tenantOverrides = allOwaspOverrides.Where(r => r.TenantId == domain.TenantId).ToList();
                    if (tenantOverrides.Any())
                    {
                        sb.AppendLine($"# OWASP Overrides for Tenant {domain.TenantId}");
                        foreach (var ovr in tenantOverrides)
                        {
                            string corazaAction = ovr.Action.ToUpper() switch {
                                "BLOCK" => "deny",
                                "DISABLED" => "remove",
                                _ => "pass" // LOG/SIMULATE
                            };
                            
                            // Using ctl:ruleRemoveById for disabling, or SecRuleUpdateActionById for blocking
                            if (corazaAction == "remove") {
                                sb.AppendLine($"SecRule REQUEST_HEADERS:Host \"@streq {domain.DomainName}\" \"id:{ruleIdBase++},phase:1,t:none,nolog,pass,ctl:ruleRemoveById={ovr.RuleId}\"");
                            } else {
                                string severityAction = !string.IsNullOrEmpty(ovr.Severity) ? $",severity:'{ovr.Severity}'" : "";
                                sb.AppendLine($"SecRuleUpdateActionById {ovr.RuleId} \"{corazaAction}{severityAction}\"");
                            }
                        }
                    }

                    // --- Custom Rules ---
                    var customRules = allCustomRules.Where(r => r.TenantId == domain.TenantId).OrderBy(r => r.Priority).ToList();
                    if (customRules.Any())
                    {
                        sb.AppendLine($"# Custom Policies for Tenant {domain.TenantId}");
                        foreach (var rule in customRules)
                        {
                            if (rule.IsRaw && !string.IsNullOrWhiteSpace(rule.RawContent))
                            {
                                sb.AppendLine($"# Raw Policy: {rule.Name}");
                                sb.AppendLine(rule.RawContent);
                            }
                            else
                            {
                                // Generate structured SecRule
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
                    }
                    sb.AppendLine();

                    if (!string.IsNullOrWhiteSpace(domain.OriginIp))
                    {
                        routesSb.AppendLine($"# Route for Domain: {domain.DomainName}");
                        
                        var settings = allSettings.FirstOrDefault(s => s.TenantId == domain.TenantId);
                        bool isChallengeForced = domain.UnderAttackMode || 
                            (settings != null && settings.BotProtectionEnabled && 
                            (settings.JsChallengeEnabled || settings.CaptchaEnabled || settings.FingerprintingEnabled));

                        if (isChallengeForced)
                        {
                            string safeId = domain.Id.ToString().Replace("-", "");
                            
                            routesSb.AppendLine($"@ua_{safeId} {{");
                            routesSb.AppendLine($"    host {domain.DomainName}");
                            routesSb.AppendLine("    not header Cookie *affini_clearance=*");
                            routesSb.AppendLine("    not path /api/waf/verify");
                            routesSb.AppendLine("}");
                            routesSb.AppendLine($"handle @ua_{safeId} {{");
                            routesSb.AppendLine($"    rewrite * /api/waf/challenge?domain={domain.DomainName}&target={{uri}}");
                            routesSb.AppendLine("    reverse_proxy api-dotnet:8080 {");
                            routesSb.AppendLine("        header_up X-JA3-Fingerprint {tls.client.ja3_md5}");
                            routesSb.AppendLine("    }");
                            routesSb.AppendLine("}");
                            routesSb.AppendLine();
                            
                            routesSb.AppendLine($"@v_{safeId} {{");
                            routesSb.AppendLine($"    host {domain.DomainName}");
                            routesSb.AppendLine("    path /api/waf/verify");
                            routesSb.AppendLine("}");
                            routesSb.AppendLine($"handle @v_{safeId} {{");
                            routesSb.AppendLine("    reverse_proxy api-dotnet:8080");
                            routesSb.AppendLine("}");
                        }

                        string safeIdForRoute = domain.Id.ToString().Replace("-", "");
                        routesSb.AppendLine($"@h_{safeIdForRoute} host {domain.DomainName}");
                        routesSb.AppendLine($"handle @h_{safeIdForRoute} {{");
                        routesSb.AppendLine($"    reverse_proxy {domain.OriginIp} {{");
                        routesSb.AppendLine("        header_up Host {http.request.host}");
                        routesSb.AppendLine("        header_up X-JA3-Fingerprint {tls.client.ja3_md5}");
                        routesSb.AppendLine("    }");
                        routesSb.AppendLine("}");
                        routesSb.AppendLine();
                    }
                }
            }

            // Always add localhost route for the WAF dashboard frontend & API
            routesSb.AppendLine("# Route for WAF Dashboard (localhost)");
            routesSb.AppendLine("@assets {");
            routesSb.AppendLine("    path /api/* /uploads/*");
            routesSb.AppendLine("}");
            routesSb.AppendLine("handle @assets {");
            routesSb.AppendLine("    reverse_proxy api-dotnet:8080 {");
            routesSb.AppendLine("        header_up X-JA3-Fingerprint {tls.client.ja3_md5}");
            routesSb.AppendLine("    }");
            routesSb.AppendLine("}");
            routesSb.AppendLine();
            routesSb.AppendLine("handle {");
            routesSb.AppendLine("    reverse_proxy host.docker.internal:5173 {");
            routesSb.AppendLine("        header_up Host {http.request.host}");
            routesSb.AppendLine("        header_up X-JA3-Fingerprint {tls.client.ja3_md5}");
            routesSb.AppendLine("    }");
            routesSb.AppendLine("}");
            routesSb.AppendLine();

            try
            {
                await File.WriteAllTextAsync(_configPath, sb.ToString());
                await File.WriteAllTextAsync(_routesPath, routesSb.ToString());
                _logger.LogInformation($"Wrote WAF configs. Triggering edge reload...");

                await ReloadCaddyAsync();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to generate or reload WAF configuration.");
            }
        }

        private async Task ReloadCaddyAsync()
        {
            try
            {
                using var client = new HttpClient();
                
                // Caddy expects the Caddyfile in the body for /load, or we can just send the same JSON it currently runs
                // Wait! To reload, we send the Caddyfile. But the easiest way to reload Caddy via API if the file changed on disk is NOT /load with empty body.
                // Actually, sending a POST to /load requires the config. 
                // Alternatively, we can just execute `caddy reload --config /templates/Caddyfile` inside the container, but we are in a different container.
                // Let's send the Caddyfile content to the API.
                
                string caddyfileContent = await File.ReadAllTextAsync("/app/caddy/Caddyfile");
                
                var content = new StringContent(caddyfileContent, Encoding.UTF8, "text/caddyfile");
                client.DefaultRequestHeaders.Add("Cache-Control", "must-revalidate");
                
                var response = await client.PostAsync(_caddyApiUrl, content);
                
                if (response.IsSuccessStatusCode)
                {
                    _logger.LogInformation("WAF Edge Sync Complete. Hot-reload successful.");
                }
                else
                {
                    string error = await response.Content.ReadAsStringAsync();
                    _logger.LogError($"WAF Reload failed. Status: {response.StatusCode}. Error: {error}");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Could not reach the WAF Admin API. Is the coraza-waf container running?");
            }
        }
    }
}

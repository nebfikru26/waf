using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using AffiniSecurity.Waf.Data;
using AffiniSecurity.Waf.Models;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using AffiniSecurity.Waf.Security;
using System.Text.Json;
using System.Text.Json.Serialization;
using System;
using System.Linq;
using System.Collections.Generic;
using AffiniSecurity.Waf.Services;

namespace AffiniSecurity.Waf.Controllers
{
    // Default: read access. Mutating endpoints below explicitly require FirewallEdit.
    [Authorize(Policy = WafPermissions.FirewallView)]
    [ApiController]
    [Route("api/firewall")]
    public class FirewallController : ControllerBase
    {
        private readonly WafDbContext _context;
        private readonly WafConfigGenerator _configGenerator;
        private readonly CrsDiscoveryService _crsDiscoveryService;

        public FirewallController(WafDbContext context, WafConfigGenerator configGenerator, CrsDiscoveryService crsDiscoveryService)
        {
            _context = context;
            _configGenerator = configGenerator;
            _crsDiscoveryService = crsDiscoveryService;
        }

        // --- Global Mode & OWASP Rules ---
        
        [HttpGet("crs/batches")]
        [Authorize(Policy = WafPolicies.RequirePlatformAdmin)]
        public async Task<IActionResult> GetRuleBatches()
        {
            var batches = await _context.OWASPRules
                .IgnoreQueryFilters()
                .Where(r => r.VersionTag != null)
                .GroupBy(r => r.VersionTag)
                .Select(g => new {
                    Tag = g.Key,
                    Count = g.Count(),
                    ImportedAt = g.Max(r => r.ImportedAt)
                })
                .OrderByDescending(b => b.ImportedAt)
                .ToListAsync();
            return Ok(batches);
        }

        [HttpGet("crs/sync/preview")]
        [Authorize(Policy = WafPolicies.RequirePlatformAdmin)]
        public async Task<IActionResult> PreviewCrsSync()
        {
            try
            {
                var pendingRules = await _crsDiscoveryService.PreviewRulesAsync();
                return Ok(pendingRules);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { Message = "Preview Failed", Error = ex.Message });
            }
        }

        [HttpPost("crs/github-sync")]
        [Authorize(Policy = WafPolicies.RequirePlatformAdmin)]
        public async Task<IActionResult> SyncFromGitHub()
        {
            try 
            {
                var addedCount = await _crsDiscoveryService.DownloadLatestFromGitHubAsync();
                return Ok(new { message = "GitHub sync complete", newRulesAdded = addedCount });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "GitHub Sync Failed", error = ex.Message });
            }
        }

        [HttpPost("crs/sync")]
        [Authorize(Policy = WafPolicies.RequirePlatformAdmin)]
        public async Task<IActionResult> SyncCrsRules()
        {
            try
            {
                var newRulesCount = await _crsDiscoveryService.RunManualDiscoveryAsync();
                
                return Ok(new { 
                    Message = "Successfully synced CRS rules from disk.",
                    NewRulesAdded = newRulesCount 
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { Message = "Failed to sync CRS rules", Error = ex.Message });
            }
        }

        [HttpPost("mode")]
        [Authorize(Policy = WafPermissions.FirewallEdit)]
        public async Task<IActionResult> SetGlobalMode([FromBody] WafModeUpdateModel model)
        {
            Console.WriteLine($"[WAF-MODE] Request to change mode to: {model?.Mode}");

            var action = model.Mode == "BLOCK" ? "BLOCK" : "LOG";
            var dbMode = model.Mode == "BLOCK" ? "prevention" : "detection";

            Console.WriteLine($"[WAF-MODE] Updating database with Action: {action}, DbMode: {dbMode}");

            try 
            {
                // Use Raw SQL for high-performance bulk update of 800+ rules
                var rulesUpdated = await _context.Database.ExecuteSqlRawAsync(
                    "UPDATE owasp_rules SET \"Action\" = {0} WHERE \"Action\" != 'DISABLED'", 
                    action
                );

                var settingsUpdated = await _context.Database.ExecuteSqlRawAsync(
                    "UPDATE security_settings SET waf_mode = {0}", 
                    dbMode
                );

                Console.WriteLine($"[WAF-MODE] Success. Rules updated: {rulesUpdated}, Settings updated: {settingsUpdated}");
                return Ok(new { message = $"WAF switched to {model.Mode} mode successfully.", rulesUpdated, settingsUpdated });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[WAF-MODE] CRITICAL ERROR: {ex.Message}");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("owasp-rules")]
        public async Task<IActionResult> GetOWASPRules()
        {
            var tenantId = _context.CurrentTenantId;

            // IgnoreQueryFilters so we get BOTH global (TenantId=null) and tenant-specific overrides
            var globalRules = await _context.OWASPRules
                .IgnoreQueryFilters()
                .AsNoTracking()
                .Where(r => r.TenantId == null)
                .ToListAsync();

            var tenantOverridesList = await _context.OWASPRules
                .IgnoreQueryFilters()
                .AsNoTracking()
                .Where(r => r.TenantId == tenantId && r.RuleId != null)
                .ToListAsync();

            var tenantOverrides = tenantOverridesList
                .GroupBy(r => r.RuleId!)
                .ToDictionary(g => g.Key, g => g.First());

            // Merge: overlay tenant action on global baseline
            foreach (var rule in globalRules)
            {
                if (tenantOverrides.TryGetValue(rule.RuleId, out var ovr))
                    rule.Action = ovr.Action;
            }
            
            Console.WriteLine($"[WAF-API] Returning {globalRules.Count} OWASP rules for tenant {tenantId}");
            return Ok(globalRules.OrderBy(r => r.RuleId).ToList());
        }

        [HttpPatch("owasp-rules/{id}")]
        [Authorize(Policy = WafPermissions.FirewallEdit)]
        public async Task<IActionResult> UpdateOWASPRule(string id, [FromBody] RuleActionUpdateModel model)
        {
            var tenantId = _context.CurrentTenantId;
            if (string.IsNullOrEmpty(tenantId)) return Unauthorized();
            if (string.IsNullOrEmpty(model?.Action)) return BadRequest(new { error = "Action is required." });

            // 'id' passed by frontend is the Guid of the Global Rule. 
            var globalRule = await _context.OWASPRules
                .IgnoreQueryFilters()
                .AsNoTracking()
                .FirstOrDefaultAsync(r => r.Id == id && r.TenantId == null);
            if (globalRule == null) return NotFound(new { error = "Global OWASP rule not found." });

            // Check if tenant already has an override for this RuleId — IgnoreQueryFilters required
            var overrideRule = await _context.OWASPRules
                .IgnoreQueryFilters()
                .FirstOrDefaultAsync(r => r.RuleId == globalRule.RuleId && r.TenantId == tenantId);
            
            if (overrideRule != null)
            {
                overrideRule.Action = model.Action;
                if (!string.IsNullOrEmpty(model.Severity)) overrideRule.Severity = model.Severity;
            }
            else
            {
                _context.OWASPRules.Add(new OWASPRule
                {
                    Id = Guid.NewGuid().ToString(),
                    TenantId = tenantId,
                    RuleId = globalRule.RuleId,
                    Name = globalRule.Name,
                    Description = globalRule.Description,
                    Severity = !string.IsNullOrEmpty(model.Severity) ? model.Severity : globalRule.Severity,
                    Category = globalRule.Category,
                    Action = model.Action
                });
            }

            try
            {
                await _context.SaveChangesAsync();
                Console.WriteLine($"[WAF-OWASP] Override saved: rule={id}, tenant={tenantId}, action={model.Action}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[WAF-OWASP] Save failed for rule {id}: {ex.Message}");
                return StatusCode(500, new { error = "Failed to save rule override.", details = ex.Message });
            }

            // Fire-and-forget edge reload — must NOT block or fail this response
            _ = Task.Run(async () => {
                try { await _configGenerator.GenerateAndReloadAsync(); }
                catch (Exception ex) { Console.WriteLine($"[WAF-OWASP] Edge reload failed (non-fatal): {ex.Message}"); }
            });
            
            return Ok(new { id = id, action = model.Action, message = "Override saved." });
        }
        // --- OWASP Rule URI Exclusions ---

        [HttpGet("owasp-exclusions")]
        public async Task<IActionResult> GetOWASPExclusions([FromQuery] string? ruleId)
        {
            var tenantId = _context.CurrentTenantId;
            if (string.IsNullOrEmpty(tenantId)) return Unauthorized();

            // Use IgnoreQueryFilters to bypass global filter; then apply explicit tenant filter
            // (same pattern as GetOWASPRules). This avoids double-filter conflicts.
            var query = _context.OWASPRuleExclusions
                .IgnoreQueryFilters()
                .Where(e => e.TenantId == tenantId);

            if (!string.IsNullOrEmpty(ruleId))
            {
                query = query.Where(e => e.RuleId == ruleId);
            }

            var exclusions = await query.ToListAsync();
            Console.WriteLine($"[WAF-EXCLUSIONS] Returning {exclusions.Count} exclusions for tenant {tenantId}");
            return Ok(exclusions);
        }

        public class CreateExclusionModel
        {
            public string RuleId { get; set; }
            public string UriPattern { get; set; }
            public string Description { get; set; }
        }

        [HttpPost("owasp-exclusions")]
        [Authorize(Policy = WafPermissions.FirewallEdit)]
        public async Task<IActionResult> AddOWASPExclusion([FromBody] CreateExclusionModel model)
        {
            var tenantId = _context.CurrentTenantId;
            if (string.IsNullOrEmpty(tenantId)) return Unauthorized();

            var exclusion = new OWASPRuleExclusion
            {
                TenantId = tenantId,
                RuleId = model.RuleId,
                UriPattern = model.UriPattern,
                Description = model.Description
            };

            _context.OWASPRuleExclusions.Add(exclusion);
            await _context.SaveChangesAsync();
            
            _ = Task.Run(async () => {
                try { await _configGenerator.GenerateAndReloadAsync(); }
                catch (Exception ex) { Console.WriteLine($"[WAF-OWASP] Edge reload failed (non-fatal): {ex.Message}"); }
            });

            return Ok(exclusion);
        }

        [HttpPut("owasp-exclusions/{id}")]
        [Authorize(Policy = WafPermissions.FirewallEdit)]
        public async Task<IActionResult> UpdateOWASPExclusion(string id, [FromBody] CreateExclusionModel model)
        {
            var tenantId = _context.CurrentTenantId;
            if (string.IsNullOrEmpty(tenantId)) return Unauthorized();

            var exclusion = await _context.OWASPRuleExclusions.FirstOrDefaultAsync(e => e.Id == id && e.TenantId == tenantId);
            if (exclusion == null) return NotFound(new { error = "Exclusion not found." });

            exclusion.UriPattern = model.UriPattern;
            exclusion.Description = model.Description;

            await _context.SaveChangesAsync();

            _ = Task.Run(async () => {
                try { await _configGenerator.GenerateAndReloadAsync(); }
                catch (Exception ex) { Console.WriteLine($"[WAF-OWASP] Edge reload failed (non-fatal): {ex.Message}"); }
            });

            return Ok(exclusion);
        }

        [HttpDelete("owasp-exclusions/{id}")]
        [Authorize(Policy = WafPermissions.FirewallEdit)]
        public async Task<IActionResult> DeleteOWASPExclusion(string id)
        {
            var tenantId = _context.CurrentTenantId;
            if (string.IsNullOrEmpty(tenantId)) return Unauthorized();

            var exclusion = await _context.OWASPRuleExclusions.FirstOrDefaultAsync(e => e.Id == id && e.TenantId == tenantId);
            if (exclusion == null) return NotFound(new { error = "Exclusion not found." });

            _context.OWASPRuleExclusions.Remove(exclusion);
            await _context.SaveChangesAsync();

            _ = Task.Run(async () => {
                try { await _configGenerator.GenerateAndReloadAsync(); }
                catch (Exception ex) { Console.WriteLine($"[WAF-OWASP] Edge reload failed (non-fatal): {ex.Message}"); }
            });

            return Ok(new { success = true });
        }


        // --- IP Rules ---

        [HttpGet("rules")]
        public async Task<IActionResult> GetRules()
        {
            var rules = await _context.IPRules.ToListAsync();
            return Ok(rules);
        }

        [HttpPost("rules")]
        [Authorize(Policy = WafPermissions.FirewallEdit)]
        public async Task<IActionResult> CreateRule([FromBody] IPRule rule)
        {

            _context.IPRules.Add(rule);
            await _context.SaveChangesAsync();
            await _configGenerator.GenerateAndReloadAsync();
            return Ok(rule);
        }

        [HttpDelete("rules/{id}")]
        [Authorize(Policy = WafPermissions.FirewallEdit)]
        public async Task<IActionResult> DeleteRule(string id)
        {

            var rule = await _context.IPRules.FirstOrDefaultAsync(r => r.Id == id);
            if (rule == null) return NotFound(new { error = "Rule not found." });

            _context.IPRules.Remove(rule);
            await _context.SaveChangesAsync();
            return Ok();
        }

        // --- Custom Rules ---

        [HttpGet("custom-rules")]
        public async Task<IActionResult> GetCustomRules()
        {
            var rules = await _context.CustomRules.OrderBy(r => r.Priority).ToListAsync();
            return Ok(rules);
        }

        [HttpPost("custom-rules")]
        [Authorize(Policy = WafPermissions.FirewallEdit)]
        public async Task<IActionResult> CreateCustomRule([FromBody] CustomRule rule)
        {
            var tenantId = _context.CurrentTenantId;
            rule.TenantId = tenantId;

            _context.CustomRules.Add(rule);
            
            // Create initial version snapshot
            var email = User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.Email)?.Value;
            var snapshot = new RuleVersion
            {
                RuleId = rule.Id,
                TenantId = tenantId,
                SnapshotData = JsonSerializer.Serialize(rule),
                ChangedBy = email ?? "System (Creation)"
            };
            _context.RuleVersions.Add(snapshot);

            await _context.SaveChangesAsync();
            await _configGenerator.GenerateAndReloadAsync();
            return Ok(rule);
        }

        [HttpPatch("custom-rules/{id}")]
        [Authorize(Policy = WafPermissions.FirewallEdit)]
        public async Task<IActionResult> UpdateCustomRule(string id, [FromBody] CustomRuleUpdateModel model)
        {

            var rule = await _context.CustomRules.FirstOrDefaultAsync(r => r.Id == id);
            if (rule == null) return NotFound(new { error = "Rule not found." });

            rule.Enabled = model.Enabled;
            await _context.SaveChangesAsync();
            await _configGenerator.GenerateAndReloadAsync();
            return Ok(rule);
        }

        [HttpPut("custom-rules/{id}")]
        [Authorize(Policy = WafPermissions.FirewallEdit)]
        public async Task<IActionResult> UpdateCustomRuleFull(string id, [FromBody] CustomRule updateModel)
        {
            var rule = await _context.CustomRules.FirstOrDefaultAsync(r => r.Id == id);
            if (rule == null) return NotFound(new { error = "Rule not found." });

            // Create snapshot of existing rule before update
            var email = User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.Email)?.Value;
            var snapshot = new RuleVersion
            {
                RuleId = rule.Id,
                TenantId = rule.TenantId,
                SnapshotData = JsonSerializer.Serialize(rule),
                ChangedBy = email ?? "Unknown User"
            };
            _context.RuleVersions.Add(snapshot);

            // Update rule properties
            rule.Name = updateModel.Name;
            rule.Description = updateModel.Description;
            rule.ConditionField = updateModel.ConditionField;
            rule.ConditionOperator = updateModel.ConditionOperator;
            rule.ConditionValue = updateModel.ConditionValue;
            rule.Condition2Field = updateModel.Condition2Field;
            rule.Condition2Operator = updateModel.Condition2Operator;
            rule.Condition2Value = updateModel.Condition2Value;
            rule.LogicOperator = updateModel.LogicOperator;
            rule.Category = updateModel.Category ?? "Custom";
            rule.Action = updateModel.Action;
            rule.Priority = updateModel.Priority;
            rule.IsRaw = updateModel.IsRaw;
            rule.RawContent = updateModel.RawContent;

            await _context.SaveChangesAsync();
            await _configGenerator.GenerateAndReloadAsync();
            return Ok(rule);
        }

        [HttpDelete("custom-rules/{id}")]
        [Authorize(Policy = WafPermissions.FirewallEdit)]
        public async Task<IActionResult> DeleteCustomRule(string id)
        {
            var rule = await _context.CustomRules.FirstOrDefaultAsync(r => r.Id == id);
            if (rule == null) return NotFound(new { error = "Rule not found." });

            _context.CustomRules.Remove(rule);
            
            // Optionally remove versions as well, or keep for audit
            var versions = await _context.RuleVersions.Where(v => v.RuleId == id).ToListAsync();
            if (versions.Any()) _context.RuleVersions.RemoveRange(versions);

            await _context.SaveChangesAsync();
            await _configGenerator.GenerateAndReloadAsync();
            return Ok();
        }

        [HttpGet("custom-rules/{id}/versions")]
        public async Task<IActionResult> GetRuleVersions(string id)
        {
            var versions = await _context.RuleVersions
                .Where(v => v.RuleId == id)
                .OrderByDescending(v => v.VersionTimestamp)
                .ToListAsync();
            return Ok(versions);
        }

        [HttpPost("custom-rules/{id}/rollback/{versionId}")]
        [Authorize(Policy = WafPermissions.FirewallEdit)]
        public async Task<IActionResult> RollbackRule(string id, string versionId)
        {
            var rule = await _context.CustomRules.FirstOrDefaultAsync(r => r.Id == id);
            if (rule == null) return NotFound(new { error = "Rule not found." });

            var version = await _context.RuleVersions.FirstOrDefaultAsync(v => v.Id == versionId && v.RuleId == id);
            if (version == null) return NotFound(new { error = "Version not found." });

            var historicRule = JsonSerializer.Deserialize<CustomRule>(version.SnapshotData);
            if (historicRule == null) return BadRequest(new { error = "Corrupt snapshot data." });

            // Create snapshot of current state before rollback
            var email = User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.Email)?.Value;
            var snapshot = new RuleVersion
            {
                RuleId = rule.Id,
                TenantId = rule.TenantId,
                SnapshotData = JsonSerializer.Serialize(rule),
                ChangedBy = email ?? "Rollback Action"
            };
            _context.RuleVersions.Add(snapshot);

            // Restore properties
            rule.Name = historicRule.Name;
            rule.Description = historicRule.Description;
            rule.ConditionField = historicRule.ConditionField;
            rule.ConditionOperator = historicRule.ConditionOperator;
            rule.ConditionValue = historicRule.ConditionValue;
            rule.Condition2Field = historicRule.Condition2Field;
            rule.Condition2Operator = historicRule.Condition2Operator;
            rule.Condition2Value = historicRule.Condition2Value;
            rule.LogicOperator = historicRule.LogicOperator;
            rule.Category = historicRule.Category ?? "Custom";
            rule.Action = historicRule.Action;
            rule.Priority = historicRule.Priority;
            rule.IsRaw = historicRule.IsRaw;
            rule.RawContent = historicRule.RawContent;

            await _context.SaveChangesAsync();
            await _configGenerator.GenerateAndReloadAsync();
            return Ok(rule);
        }

        [HttpGet("custom-rules/export")]
        public async Task<IActionResult> ExportCustomRules()
        {
            var rules = await _context.CustomRules.ToListAsync();
            var json = JsonSerializer.Serialize(rules, new JsonSerializerOptions { WriteIndented = true });
            var bytes = System.Text.Encoding.UTF8.GetBytes(json);
            return File(bytes, "application/json", "waf_custom_rules_export.json");
        }

        [HttpPost("custom-rules/import")]
        [Authorize(Policy = WafPermissions.FirewallEdit)]
        public async Task<IActionResult> ImportCustomRules([FromBody] List<CustomRule> importedRules)
        {
            if (importedRules == null || !importedRules.Any()) 
                return BadRequest(new { error = "No rules provided for import." });

            var tenantId = _context.CurrentTenantId;
            var email = User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.Email)?.Value;

            foreach (var rule in importedRules)
            {
                // Reset metadata for the local environment
                rule.Id = Guid.NewGuid().ToString();
                rule.TenantId = tenantId;
                rule.CreatedAt = DateTime.UtcNow;

                _context.CustomRules.Add(rule);

                // Create initial version for the imported rule
                _context.RuleVersions.Add(new RuleVersion
                {
                    RuleId = rule.Id,
                    TenantId = tenantId,
                    SnapshotData = JsonSerializer.Serialize(rule),
                    ChangedBy = email ?? "Import Action"
                });
            }

            await _context.SaveChangesAsync();
            await _configGenerator.GenerateAndReloadAsync();

            return Ok(new { message = $"Successfully imported {importedRules.Count} custom rules." });
        }

        // --- URI Exclusions ---

        [HttpGet("uri-exclusions")]
        public async Task<IActionResult> GetUriExclusions()
        {
            var exclusions = await _context.URIExclusions.ToListAsync();
            return Ok(exclusions);
        }

        [HttpPost("uri-exclusions")]
        [Authorize(Policy = WafPermissions.FirewallEdit)]
        public async Task<IActionResult> CreateUriExclusion([FromBody] URIExclusion exclusion)
        {

            _context.URIExclusions.Add(exclusion);
            await _context.SaveChangesAsync();
            return Ok(exclusion);
        }

        [HttpPatch("uri-exclusions/{id}")]
        [Authorize(Policy = WafPermissions.FirewallEdit)]
        public async Task<IActionResult> UpdateUriExclusion(string id, [FromBody] URIUpdateModel model)
        {

            var exclusion = await _context.URIExclusions.FirstOrDefaultAsync(e => e.Id == id);
            if (exclusion == null) return NotFound(new { error = "Exclusion not found." });

            exclusion.Enabled = model.Enabled;
            await _context.SaveChangesAsync();
            return Ok(exclusion);
        }

        [HttpDelete("uri-exclusions/{id}")]
        [Authorize(Policy = WafPermissions.FirewallEdit)]
        public async Task<IActionResult> DeleteUriExclusion(string id)
        {

            var exclusion = await _context.URIExclusions.FirstOrDefaultAsync(e => e.Id == id);
            if (exclusion == null) return NotFound(new { error = "Exclusion not found." });

            _context.URIExclusions.Remove(exclusion);
            await _context.SaveChangesAsync();
            return Ok();
        }

        // --- Settings (Geo & Rate Limit) ---

        private async Task SyncToRedis(SecuritySettings settings, IRedisService redisService)
        {
            var isEnabledStr = settings.MlDetectionEnabled.ToString().ToLower();
            // 1. Sync by TenantId
            await redisService.SetValueAsync($"tenant:ai:{settings.TenantId}:enabled", isEnabledStr);

            // 2. Sync by DomainNames associated with this TenantId
            var domains = await _context.Domains
                .IgnoreQueryFilters()
                .Where(d => d.TenantId == settings.TenantId)
                .ToListAsync();

            foreach (var domain in domains)
            {
                if (!string.IsNullOrEmpty(domain.DomainName))
                {
                    await redisService.SetValueAsync($"tenant:ai:{domain.DomainName}:enabled", isEnabledStr);
                }
            }
        }

        [HttpGet("settings")]
        public async Task<IActionResult> GetSettings([FromServices] IRedisService redisService)
        {
            var settings = await _context.SecuritySettings.FirstOrDefaultAsync();
            if (settings == null)
            {
                settings = new SecuritySettings();
                _context.SecuritySettings.Add(settings);
                await _context.SaveChangesAsync();
            }
            await SyncToRedis(settings, redisService);
            return Ok(settings);
        }

        [HttpPut("settings")]
        [Authorize(Policy = WafPermissions.FirewallEdit)]
        public async Task<IActionResult> UpdateSettings([FromBody] SecuritySettings settings, [FromServices] IRedisService redisService)
        {
            var existing = await _context.SecuritySettings.FirstOrDefaultAsync();
            if (existing == null)
            {
                _context.SecuritySettings.Add(settings);
                await _context.SaveChangesAsync();
                await SyncToRedis(settings, redisService);
                return Ok(settings);
            }

            // Map all properties to prevent loss of settings during partial updates
            existing.GeoEnabled = settings.GeoEnabled;
            existing.GeoMode = settings.GeoMode;
            existing.GeoAllowlist = settings.GeoAllowlist;
            existing.GeoBlocklist = settings.GeoBlocklist;
            existing.RateLimitRps = settings.RateLimitRps;
            existing.WafMode = settings.WafMode;
            
            // Also preserve/map new attributes added for the modular engine
            existing.BotProtectionEnabled = settings.BotProtectionEnabled;
            existing.JsChallengeEnabled = settings.JsChallengeEnabled;
            existing.CaptchaEnabled = settings.CaptchaEnabled;
            existing.FingerprintingEnabled = settings.FingerprintingEnabled;
            existing.MlDetectionEnabled = settings.MlDetectionEnabled;
            existing.DdosProtectionEnabled = settings.DdosProtectionEnabled;
            existing.L7ProtectionEnabled = settings.L7ProtectionEnabled;
            existing.DdosThresholdRps = settings.DdosThresholdRps;
            existing.SensitivityLevel = settings.SensitivityLevel;

            _context.Entry(existing).State = EntityState.Modified;
            await _context.SaveChangesAsync();
            
            await SyncToRedis(existing, redisService);
            
            // Also trigger configuration regeneration
            await _configGenerator.GenerateAndReloadAsync();

            return Ok(existing);
        }
    }

    public class CustomRuleUpdateModel { public bool Enabled { get; set; } }
    public class URIUpdateModel { public bool Enabled { get; set; } }
    public class WafModeUpdateModel { [JsonPropertyName("mode")] public string Mode { get; set; } }
    public class RuleActionUpdateModel { 
        [JsonPropertyName("action")] public string Action { get; set; } 
        [JsonPropertyName("severity")] public string? Severity { get; set; } 
    }
}

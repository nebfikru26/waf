using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using AffiniSecurity.Waf.Data;
using Microsoft.EntityFrameworkCore;

namespace AffiniSecurity.Waf.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/alerts")]
    public class AlertsController : ControllerBase
    {
        private readonly WafDbContext _context;

        public AlertsController(WafDbContext context)
        {
            _context = context;
        }

        [HttpGet]
        public async Task<IActionResult> GetAlerts()
        {
            var query = _context.AlertLogs.AsQueryable();
            
            // Admins see all alerts (IgnoreQueryFilters bypasses tenantId filter)
            if (User.IsInRole("admin") || User.IsInRole("super_admin") || User.IsInRole("support_engineer"))
            {
                query = query.IgnoreQueryFilters();
            }

            var alerts = await query
                .OrderByDescending(a => a.Timestamp)
                .Take(100)
                .ToListAsync();

            // Fetch all global OWASP rules (no tenant filter) for MITRE lookup
            var owaspRules = await _context.OWASPRules
                .IgnoreQueryFilters()
                .Where(r => r.TenantId == null && r.MitreTechnique != null)
                .ToDictionaryAsync(r => r.RuleId ?? "", r => r);

            // Also fetch custom rules in case alert was triggered by a custom rule
            var customRules = await _context.CustomRules
                .IgnoreQueryFilters()
                .Where(r => r.MitreTechnique != null)
                .ToDictionaryAsync(r => r.Id, r => r);

            foreach (var alert in alerts)
            {
                // Only enrich if not already set in DB
                if (!string.IsNullOrEmpty(alert.MitreTechnique)) continue;

                // 1. Try OWASP rule lookup by RuleId
                if (!string.IsNullOrEmpty(alert.RuleId) && owaspRules.TryGetValue(alert.RuleId, out var owaspRule))
                {
                    alert.MitreTechnique = owaspRule.MitreTechnique;
                    alert.MitreTactic    = owaspRule.MitreTactic;
                }
                // 2. Try custom rule lookup by the rule's database Id
                else if (!string.IsNullOrEmpty(alert.RuleId) && customRules.TryGetValue(alert.RuleId, out var customRule))
                {
                    alert.MitreTechnique = customRule.MitreTechnique ?? "T1210";
                    alert.MitreTactic    = customRule.MitreTactic    ?? "Lateral Movement";
                }
                // 3. Category-based fallback (for rules not yet seeded with MITRE data)
                else
                {
                    var ruleName = alert.Rule?.ToLower() ?? "";
                    (alert.MitreTechnique, alert.MitreTactic) = ruleName switch
                    {
                        _ when ruleName.Contains("sql")        => ("T1190",     "Initial Access"),
                        _ when ruleName.Contains("xss")        => ("T1059.007", "Execution"),
                        _ when ruleName.Contains("traversal")  => ("T1083",     "Discovery"),
                        _ when ruleName.Contains("rce") 
                            || ruleName.Contains("command")    => ("T1059",     "Execution"),
                        _ when ruleName.Contains("scanner")    => ("T1595",     "Reconnaissance"),
                        _ when ruleName.Contains("php")        => ("T1059.004", "Execution"),
                        _ when ruleName.Contains("java")       => ("T1059.007", "Execution"),
                        _ when ruleName.Contains("log4")       => ("T1190",     "Initial Access"),
                        _                                      => ("T1210",     "Lateral Movement"),
                    };
                }
            }
                
            return Ok(alerts);
        }
    }
}

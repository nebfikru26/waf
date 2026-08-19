using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using AffiniSecurity.Waf.Data;
using AffiniSecurity.Waf.Models;
using AffiniSecurity.Waf.Models.DTOs;
using Microsoft.AspNetCore.Authorization;
using AffiniSecurity.Waf.Security;

namespace AffiniSecurity.Waf.Controllers
{
    [Authorize(Policy = WafPolicies.RequirePlatformAdmin)]
    [ApiController]
    [Route("api/admin/tenants/{tenantId}/rulesets")]
    public class TenantRuleSetsController : ControllerBase
    {
        private readonly WafDbContext _context;

        public TenantRuleSetsController(WafDbContext context)
        {
            _context = context;
        }

        [HttpGet]
        public async Task<ActionResult<IEnumerable<TenantRuleSetDto>>> GetRuleSets(string tenantId)
        {
            var ruleSets = await _context.TenantRuleSets
                .Where(rs => rs.TenantId == tenantId)
                .OrderByDescending(rs => rs.CreatedAt)
                .ToListAsync();

            return Ok(ruleSets.Select(rs => new TenantRuleSetDto
            {
                Id = rs.Id,
                TenantId = rs.TenantId,
                Name = rs.Name,
                Description = rs.Description,
                RuleIds = rs.RuleIds?.Split(',', StringSplitOptions.RemoveEmptyEntries).ToList() ?? new List<string>(),
                DisabledRuleIds = rs.DisabledRuleIds?.Split(',', StringSplitOptions.RemoveEmptyEntries).ToList() ?? new List<string>(),
                SourceTemplateId = rs.SourceTemplateId,
                CreatedAt = rs.CreatedAt,
                UpdatedAt = rs.UpdatedAt
            }));
        }

        [HttpPost]
        public async Task<ActionResult<TenantRuleSetDto>> CreateRuleSet(string tenantId, [FromBody] CreateTenantRuleSetRequest request)
        {
            var ruleSet = new TenantRuleSet
            {
                TenantId = tenantId,
                Name = request.Name,
                Description = request.Description,
                RuleIds = string.Join(",", request.RuleIds),
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            _context.TenantRuleSets.Add(ruleSet);
            await _context.SaveChangesAsync();

            return Ok(new TenantRuleSetDto
            {
                Id = ruleSet.Id,
                TenantId = ruleSet.TenantId,
                Name = ruleSet.Name,
                Description = ruleSet.Description,
                RuleIds = request.RuleIds,
                CreatedAt = ruleSet.CreatedAt,
                UpdatedAt = ruleSet.UpdatedAt
            });
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteRuleSet(string id)
        {
            var ruleSet = await _context.TenantRuleSets.FindAsync(id);
            if (ruleSet == null) return NotFound();

            _context.TenantRuleSets.Remove(ruleSet);
            await _context.SaveChangesAsync();
            return NoContent();
        }

        [HttpPost("{id}/overrides")]
        public async Task<IActionResult> UpdateOverrides(string id, [FromBody] UpdateRuleOverridesRequest request)
        {
            var ruleSet = await _context.TenantRuleSets.FindAsync(id);
            if (ruleSet == null) return NotFound();

            var disabledIds = ruleSet.DisabledRuleIds?.Split(',', StringSplitOptions.RemoveEmptyEntries).ToList() ?? new List<string>();

            if (request.Enabled)
            {
                disabledIds.Remove(request.RuleId);
            }
            else
            {
                if (!disabledIds.Contains(request.RuleId))
                {
                    disabledIds.Add(request.RuleId);
                }
            }

            ruleSet.DisabledRuleIds = string.Join(",", disabledIds.Distinct());
            ruleSet.UpdatedAt = DateTime.UtcNow;

            _context.TenantRuleSets.Update(ruleSet);
            await _context.SaveChangesAsync();

            return Ok();
        }
    }
}

using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using AffiniSecurity.Waf.Data;
using AffiniSecurity.Waf.Models;
using Microsoft.EntityFrameworkCore;
using AffiniSecurity.Waf.Services;
using AffiniSecurity.Waf.Security;

namespace AffiniSecurity.Waf.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api")]
    public class WafController : ControllerBase
    {
        private readonly WafDbContext _context;
        private readonly WafConfigGenerator _wafConfigGenerator;

        public WafController(WafDbContext context, WafConfigGenerator wafConfigGenerator)
        {
            _context = context;
            _wafConfigGenerator = wafConfigGenerator;
        }

        [AllowAnonymous]
        [HttpGet("test")]
        public IActionResult Test()
        {
            return Ok(new { message = "Backend Reached. If you see this, the WAF did not block your request." });
        }

        [HttpGet("domains")]
        public async Task<IActionResult> GetDomains()
        {
            // Global Query Filter automatically adds "WHERE TenantId = @tenantId"
            var domains = await _context.Domains.ToListAsync();
            return Ok(domains);
        }

        [HttpPost("domains")]
        [Authorize(Policy = WafPermissions.DomainsManage)]
        public async Task<IActionResult> CreateDomain([FromBody] Domain domain)
        {
            if (await _context.Domains.IgnoreQueryFilters().AnyAsync(d => d.DomainName == domain.DomainName))
            {
                return BadRequest(new { error = "This domain is already registered in our system." });
            }
            if (await _context.Domains.IgnoreQueryFilters().AnyAsync(d => d.OriginIp == domain.OriginIp))
            {
                return BadRequest(new { error = "This Origin Server IP / Hostname is already in use by another domain." });
            }
            // SaveChangesAsync automatically injects the TenantId
            _context.Domains.Add(domain);
            await _context.SaveChangesAsync();
            
            // Trigger Edge Sync
            _ = _wafConfigGenerator.GenerateAndReloadAsync();
            
            return Ok(domain);
        }

        [HttpPut("domains/{id}")]
        [Authorize(Policy = WafPermissions.DomainsManage)]
        public async Task<IActionResult> UpdateDomain(string id, [FromBody] Domain domain)
        {
            // Filter guarantees we can only find domains belonging to current tenant
            var existing = await _context.Domains.FirstOrDefaultAsync(d => d.Id == id);
            if (existing == null) return NotFound();

            if (existing.DomainName != domain.DomainName && await _context.Domains.IgnoreQueryFilters().AnyAsync(d => d.DomainName == domain.DomainName))
            {
                return BadRequest(new { error = "This domain is already registered in our system." });
            }
            if (existing.OriginIp != domain.OriginIp && await _context.Domains.IgnoreQueryFilters().AnyAsync(d => d.OriginIp == domain.OriginIp))
            {
                return BadRequest(new { error = "This Origin Server IP / Hostname is already in use by another domain." });
            }

            existing.DomainName = domain.DomainName;
            existing.OriginIp = domain.OriginIp;
            existing.SslMode = domain.SslMode;
            existing.Status = domain.Status;
            existing.SslProvisioned = domain.SslProvisioned;
            existing.DnsVerified = domain.DnsVerified;
            existing.UnderAttackMode = domain.UnderAttackMode;
            existing.ForceHttps = domain.ForceHttps;
            existing.ProtectionMode = domain.ProtectionMode;
            existing.Sensitivity = domain.Sensitivity;

            await _context.SaveChangesAsync();
            
            // Trigger Edge Sync
            _ = _wafConfigGenerator.GenerateAndReloadAsync();
            
            return Ok(existing);
        }

        [HttpDelete("domains/{id}")]
        [Authorize(Policy = WafPermissions.DomainsManage)]
        public async Task<IActionResult> DeleteDomain(string id)
        {
            var domain = await _context.Domains.FirstOrDefaultAsync(d => d.Id == id);
            if (domain == null) return NotFound();

            _context.Domains.Remove(domain);
            await _context.SaveChangesAsync();
            
            // Trigger Edge Sync
            _ = _wafConfigGenerator.GenerateAndReloadAsync();
            
            return Ok();
        }

        [HttpGet("rules")]
        public async Task<IActionResult> GetRules()
        {
            var rules = await _context.OWASPRules.ToListAsync();
            
            if (rules.Count == 0)
            {
                // Seed default OWASP Rules - TenantId will be auto-set by SaveChangesAsync
                var defaults = new List<OWASPRule>
                {
                    new OWASPRule { Name = "SQL Injection Protection", Description = "Detects and blocks SQLi attempts in query params and bodies.", Action = "LOG" },
                    new OWASPRule { Name = "Cross-Site Scripting (XSS)", Description = "Prevents malicious scripts from being injected into web pages.", Action = "LOG" },
                    new OWASPRule { Name = "Local File Inclusion (LFI)", Description = "Blocks attempts to access files on the server using path traversal.", Action = "LOG" },
                    new OWASPRule { Name = "Remote File Inclusion (RFI)", Description = "Prevents the inclusion of remote files through external URLs.", Action = "LOG" },
                    new OWASPRule { Name = "Remote Code Execution (RCE)", Description = "Detects shell command injection and system execution attempts.", Action = "LOG" },
                    new OWASPRule { Name = "Protocol Violations", Description = "Enforces strict HTTP protocol compliance to block malformed requests.", Action = "LOG" }
                };
                _context.OWASPRules.AddRange(defaults);
                await _context.SaveChangesAsync();
                rules = defaults;
            }

            return Ok(rules);
        }
    }
}

using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using AffiniSecurity.Waf.Data;
using AffiniSecurity.Waf.Models;
using Microsoft.EntityFrameworkCore;
using AffiniSecurity.Waf.Services;
using AffiniSecurity.Waf.Security;
using System;
using System.Linq;

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

        /// <summary>
        /// Returns the DNS records the customer must create at their registrar/DNS provider to
        /// route traffic through the WAF edge and satisfy the Let's Encrypt HTTP-01 challenge used
        /// by cert-manager. The edge hostname is configurable (Waf:EdgeHostname) since it depends
        /// on the platform's deployment (a stable CNAME target for the ingress/load balancer).
        /// </summary>
        [HttpGet("domains/{id}/dns-instructions")]
        public async Task<IActionResult> GetDnsInstructions(string id, [FromServices] IConfiguration configuration)
        {
            var domain = await _context.Domains.FirstOrDefaultAsync(d => d.Id == id);
            if (domain == null) return NotFound();

            var edgeHostname = configuration["Waf:EdgeHostname"] ?? "edge.affinisecurity.io";

            var records = new[]
            {
                new
                {
                    type = "CNAME",
                    host = domain.DomainName,
                    value = edgeHostname,
                    ttl = "3600",
                    purpose = "Routes traffic for this domain through the WAF edge proxy."
                }
            };

            string nextStep = !domain.DnsVerified
                ? "Create the DNS record above, then click 'Verify DNS'."
                : !domain.SslProvisioned
                    ? "DNS verified. Click 'Provision SSL' to request a Let's Encrypt certificate."
                    : "Domain is fully protected.";

            return Ok(new
            {
                domain = domain.DomainName,
                records,
                verification_status = new { dns_verified = domain.DnsVerified, ssl_provisioned = domain.SslProvisioned },
                next_step = nextStep
            });
        }

        /// <summary>
        /// Performs a real DNS lookup to confirm the domain's CNAME/A record points at the WAF
        /// edge hostname before flipping DnsVerified. Unlike certificate issuance, this check is
        /// synchronous and does not depend on a live Kubernetes cluster.
        /// </summary>
        [HttpPatch("domains/{id}/verify-dns")]
        [Authorize(Policy = WafPermissions.DomainsManage)]
        public async Task<IActionResult> VerifyDns(string id, [FromServices] IConfiguration configuration)
        {
            var domain = await _context.Domains.FirstOrDefaultAsync(d => d.Id == id);
            if (domain == null) return NotFound();

            var edgeHostname = configuration["Waf:EdgeHostname"] ?? "edge.affinisecurity.io";

            bool verified;
            string? error = null;
            try
            {
                verified = await ResolvesToEdgeAsync(domain.DomainName, edgeHostname);
                if (!verified)
                {
                    error = $"DNS for {domain.DomainName} does not yet resolve to {edgeHostname}. DNS changes can take time to propagate — please retry shortly.";
                }
            }
            catch (Exception ex)
            {
                verified = false;
                error = $"DNS lookup failed: {ex.Message}";
            }

            if (!verified)
            {
                return BadRequest(new { error });
            }

            domain.DnsVerified = true;
            domain.Status = "active";
            await _context.SaveChangesAsync();

            _ = _wafConfigGenerator.GenerateAndReloadAsync();

            return Ok(domain);
        }

        /// <summary>
        /// Resolves whether a domain's DNS points at the configured edge hostname, either directly
        /// (CNAME chain resolves to the same IP set as the edge hostname) or the domain itself is
        /// the edge hostname. Real resolution via System.Net.Dns — genuinely testable without a
        /// Kubernetes cluster, unlike certificate issuance.
        /// </summary>
        private static async Task<bool> ResolvesToEdgeAsync(string domainName, string edgeHostname)
        {
            if (string.Equals(domainName, edgeHostname, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            var domainAddresses = await System.Net.Dns.GetHostAddressesAsync(domainName);
            var edgeAddresses = await System.Net.Dns.GetHostAddressesAsync(edgeHostname);

            return domainAddresses.Any(da => edgeAddresses.Any(ea => ea.Equals(da)));
        }

        /// <summary>
        /// Requests a certificate for a DNS-verified domain. Real issuance is asynchronous (see
        /// SSLController.Provision / CertbotBackgroundService) — this returns "pending", not
        /// immediate success, so the frontend must poll rather than assume completion.
        /// </summary>
        [HttpPatch("domains/{id}/provision-ssl")]
        [Authorize(Policy = WafPermissions.SslManage)]
        public async Task<IActionResult> ProvisionSsl(string id)
        {
            var domain = await _context.Domains.FirstOrDefaultAsync(d => d.Id == id);
            if (domain == null) return NotFound();

            if (!domain.DnsVerified)
            {
                return BadRequest(new { error = "DNS must be verified before SSL can be provisioned." });
            }

            if (domain.SslProvisioned)
            {
                return Ok(new { status = "active", domain });
            }

            var existingCert = await _context.SslCertificates.FirstOrDefaultAsync(c => c.Domain == domain.DomainName);
            if (existingCert == null)
            {
                _context.SslCertificates.Add(new Models.SSLCertificate
                {
                    Domain = domain.DomainName,
                    TenantId = domain.TenantId,
                    Issuer = "Let's Encrypt",
                    Status = "pending",
                    Protocol = "TLS 1.2/1.3",
                    Grade = "-",
                });
                await _context.SaveChangesAsync();
            }
            else if (existingCert.Status != "pending" && existingCert.Status != "active")
            {
                existingCert.Status = "pending";
                await _context.SaveChangesAsync();
            }

            // CertbotBackgroundService's reconciliation loop creates the cert-manager Certificate
            // CR and polls it to readiness on its next tick (runs every minute).
            return Accepted(new
            {
                status = "pending",
                message = "Certificate requested via Let's Encrypt/cert-manager. This is asynchronous — poll domain status for completion.",
                domain
            });
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

using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using AffiniSecurity.Waf.Data;
using AffiniSecurity.Waf.Models;
using AffiniSecurity.Waf.Security;
using Microsoft.EntityFrameworkCore;

namespace AffiniSecurity.Waf.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/ssl")]
    public class SSLController : ControllerBase
    {
        private readonly WafDbContext _context;

        public SSLController(WafDbContext context)
        {
            _context = context;
        }

        /// <summary>
        /// Returns the tenant's certificates, most recently created first. Rows are populated by
        /// <see cref="Services.CertbotBackgroundService"/> as domains are DNS-verified and their
        /// certificates are requested/issued via cert-manager — this is real state, not a stub.
        /// </summary>
        [HttpGet("certificates")]
        public async Task<IActionResult> GetCertificates()
        {
            // Global query filter automatically scopes this to the current tenant.
            var certificates = await _context.SslCertificates
                .OrderByDescending(c => c.CreatedAt)
                .ToListAsync();
            return Ok(certificates);
        }

        /// <summary>
        /// Get-or-create the tenant's singleton TLS configuration (same pattern as
        /// SecuritySettingsController) — every tenant has exactly one row, created lazily with
        /// safe defaults (HTTPS redirect + HSTS + OCSP stapling + auto-renewal on).
        /// </summary>
        [HttpGet("config")]
        public async Task<IActionResult> GetConfig()
        {
            var config = await _context.TlsConfigs.FirstOrDefaultAsync();
            if (config == null)
            {
                config = new TLSConfig();
                _context.TlsConfigs.Add(config);
                await _context.SaveChangesAsync();
            }
            return Ok(config);
        }

        [HttpPut("config")]
        [Authorize(Policy = WafPermissions.SslManage)]
        public async Task<IActionResult> UpdateConfig([FromBody] TLSConfig config)
        {
            var existing = await _context.TlsConfigs.FirstOrDefaultAsync();
            if (existing == null)
            {
                _context.TlsConfigs.Add(config);
                await _context.SaveChangesAsync();
                return Ok(config);
            }

            existing.HttpsRedirect = config.HttpsRedirect;
            existing.Hsts = config.Hsts;
            existing.HstsPreload = config.HstsPreload;
            existing.OcspStapling = config.OcspStapling;
            existing.AutoRenewal = config.AutoRenewal;
            existing.Tls13Only = config.Tls13Only;
            existing.MinTlsVersion = config.MinTlsVersion;

            await _context.SaveChangesAsync();
            return Ok(existing);
        }

        public class ProvisionRequest
        {
            public string Domain { get; set; } = string.Empty;
            public string? Email { get; set; }
            public bool UseStaging { get; set; }
        }

        /// <summary>
        /// Requests a new certificate for a domain already owned by this tenant. Real ACME
        /// issuance via cert-manager is asynchronous — this endpoint creates/updates the
        /// SSLCertificate row as "pending" and returns immediately; the
        /// CertbotBackgroundService reconciliation loop polls cert-manager and flips it to
        /// "active" once Let's Encrypt actually issues the certificate. Callers must poll
        /// GET /api/ssl/certificates (or the domain's status) rather than assume instant success.
        /// </summary>
        [HttpPost("provision")]
        [Authorize(Policy = WafPermissions.SslManage)]
        public async Task<IActionResult> Provision([FromBody] ProvisionRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Domain))
            {
                return BadRequest(new { error = "domain is required." });
            }

            // Query filter ensures this only matches a domain the current tenant owns.
            var domain = await _context.Domains.FirstOrDefaultAsync(d => d.DomainName == request.Domain);
            if (domain == null)
            {
                return NotFound(new { error = "Domain not found. Add it under Domains before requesting a certificate." });
            }

            if (!domain.DnsVerified)
            {
                return BadRequest(new { error = "DNS must be verified for this domain before a certificate can be requested." });
            }

            var existing = await _context.SslCertificates.FirstOrDefaultAsync(c => c.Domain == request.Domain);
            if (existing != null && existing.Status == "active")
            {
                return Ok(new { status = "active", message = "A certificate is already active for this domain.", certificate = existing });
            }

            if (existing == null)
            {
                existing = new SSLCertificate
                {
                    Domain = request.Domain,
                    TenantId = domain.TenantId,
                    Issuer = "Let's Encrypt",
                    Status = "pending",
                    Protocol = "TLS 1.2/1.3",
                    Grade = "-",
                };
                _context.SslCertificates.Add(existing);
            }
            else
            {
                existing.Status = "pending";
            }

            await _context.SaveChangesAsync();

            // The actual cert-manager Certificate CR creation and Ready-status polling happens in
            // CertbotBackgroundService's reconciliation loop (runs every minute), which is
            // responsible for both new domains and this explicit re-request path.
            return Accepted(new
            {
                status = "pending",
                message = "Certificate requested. Issuance via Let's Encrypt/cert-manager is asynchronous and typically completes within a few minutes; poll GET /api/ssl/certificates for status.",
                certificate = existing
            });
        }
    }
}

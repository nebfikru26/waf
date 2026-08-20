using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.DependencyInjection;
using System;
using System.Threading;
using System.Threading.Tasks;
using AffiniSecurity.Waf.Data;
using AffiniSecurity.Waf.Models;
using Microsoft.EntityFrameworkCore;
using System.Linq;

namespace AffiniSecurity.Waf.Services
{
    /// <summary>
    /// Reconciles per-tenant custom domain SSL certificates against cert-manager. On each tick:
    ///   1. Domains that are DNS-verified but have no certificate yet get a cert-manager
    ///      `Certificate` custom resource created (via <see cref="IK8sCertManagerService"/>) and a
    ///      corresponding `SSLCertificate` row with Status = "pending".
    ///   2. Existing "pending" `SSLCertificate` rows are polled against the live Certificate CR's
    ///      Ready condition; once cert-manager reports Ready, the row flips to "active" (with the
    ///      real expiry populated) and the linked Domain's SslProvisioned flag is set.
    ///
    /// When no Kubernetes cluster is reachable (local dev / CI — see
    /// <see cref="IK8sCertManagerService.IsAvailable"/>), this loop logs once per cycle and skips
    /// provisioning rather than throwing, so the app and test suite still run without a cluster.
    /// </summary>
    public class CertbotBackgroundService : BackgroundService
    {
        private readonly ILogger<CertbotBackgroundService> _logger;
        private readonly IServiceProvider _serviceProvider;

        public CertbotBackgroundService(ILogger<CertbotBackgroundService> logger, IServiceProvider serviceProvider)
        {
            _logger = logger;
            _serviceProvider = serviceProvider;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("cert-manager SSL auto-provisioning/reconciliation service is starting.");

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    using var scope = _serviceProvider.CreateScope();
                    var dbContext = scope.ServiceProvider.GetRequiredService<WafDbContext>();
                    var certManager = scope.ServiceProvider.GetRequiredService<IK8sCertManagerService>();

                    if (!certManager.IsAvailable)
                    {
                        _logger.LogDebug("Kubernetes API unavailable — skipping this SSL reconciliation cycle.");
                    }
                    else
                    {
                        await ReconcileAsync(dbContext, certManager, stoppingToken);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error occurred during SSL certificate reconciliation cycle.");
                }

                await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
            }
        }

        private async Task ReconcileAsync(WafDbContext dbContext, IK8sCertManagerService certManager, CancellationToken stoppingToken)
        {
            // Step 1: kick off provisioning for domains that are DNS-verified but have no
            // certificate record at all yet.
            var awaitingProvision = await dbContext.Domains
                .IgnoreQueryFilters()
                .Where(d => d.DnsVerified && !d.SslProvisioned)
                .ToListAsync(stoppingToken);

            foreach (var domain in awaitingProvision)
            {
                var certResourceName = CertResourceName(domain.DomainName);
                var existingCert = await dbContext.SslCertificates
                    .IgnoreQueryFilters()
                    .FirstOrDefaultAsync(c => c.Domain == domain.DomainName, stoppingToken);

                if (existingCert == null)
                {
                    var secretName = $"tls-{certResourceName}";
                    var (success, error) = await certManager.EnsureCertificateAsync(domain.DomainName, certResourceName, secretName, stoppingToken);

                    var cert = new SSLCertificate
                    {
                        Domain = domain.DomainName,
                        TenantId = domain.TenantId,
                        Issuer = "Let's Encrypt",
                        Status = success ? "pending" : "error",
                        Protocol = "TLS 1.2/1.3",
                        Grade = "-",
                    };
                    dbContext.SslCertificates.Add(cert);
                    _logger.LogInformation(success
                        ? "[cert-manager] Requested certificate for {Domain} (resource {Resource})"
                        : "[cert-manager] Failed to request certificate for {Domain}: {Error}",
                        domain.DomainName, success ? certResourceName : error);
                }
            }

            if (awaitingProvision.Any())
            {
                await dbContext.SaveChangesAsync(stoppingToken);
            }

            // Step 2: poll pending certificates for readiness.
            var pendingCerts = await dbContext.SslCertificates
                .IgnoreQueryFilters()
                .Where(c => c.Status == "pending")
                .ToListAsync(stoppingToken);

            var changed = false;
            foreach (var cert in pendingCerts)
            {
                var status = await certManager.GetCertificateStatusAsync(CertResourceName(cert.Domain), stoppingToken);
                if (!status.Exists)
                {
                    continue; // still waiting for cert-manager to pick up the CR
                }

                if (status.Ready)
                {
                    cert.Status = "active";
                    cert.Expiry = status.NotAfter;
                    cert.Grade = "A";

                    var domain = await dbContext.Domains
                        .IgnoreQueryFilters()
                        .FirstOrDefaultAsync(d => d.DomainName == cert.Domain, stoppingToken);
                    if (domain != null)
                    {
                        domain.SslProvisioned = true;
                    }

                    _logger.LogInformation("[cert-manager] Certificate for {Domain} is now Ready (expires {Expiry}).", cert.Domain, cert.Expiry);
                    changed = true;
                }
                else if (status.Message != null)
                {
                    _logger.LogDebug("[cert-manager] Certificate for {Domain} not yet ready: {Message}", cert.Domain, status.Message);
                }
            }

            if (changed)
            {
                await dbContext.SaveChangesAsync(stoppingToken);
            }
        }

        /// <summary>
        /// Deterministic, DNS-label-safe cert-manager resource name derived from a domain name
        /// (e.g. "shop.example.com" -&gt; "shop-example-com").
        /// </summary>
        internal static string CertResourceName(string domainName) =>
            domainName.Replace(".", "-").Replace("*", "wildcard").ToLowerInvariant();
    }
}

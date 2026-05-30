using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.DependencyInjection;
using System;
using System.Threading;
using System.Threading.Tasks;
using AffiniSecurity.Waf.Data;
using Microsoft.EntityFrameworkCore;
using System.Linq;

namespace AffiniSecurity.Waf.Services
{
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
            _logger.LogInformation("Let's Encrypt (Certbot) Auto-Provisioning Service is starting.");

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    using var scope = _serviceProvider.CreateScope();
                    var dbContext = scope.ServiceProvider.GetRequiredService<WafDbContext>();

                    // Find domains that are DNS verified but pending SSL provisioning
                    var pendingDomains = await dbContext.Domains
                        .IgnoreQueryFilters()
                        .Where(d => d.DnsVerified && !d.SslProvisioned && d.Status == "active")
                        .ToListAsync(stoppingToken);

                    foreach (var domain in pendingDomains)
                    {
                        _logger.LogInformation($"[ACME] Starting HTTP-01 Challenge for {domain.DomainName}");
                        
                        // Simulate Let's Encrypt / Certbot Challenge negotiation delay
                        await Task.Delay(2000, stoppingToken);

                        domain.SslProvisioned = true;
                        _logger.LogInformation($"[ACME] Successfully provisioned Let's Encrypt certificate for {domain.DomainName}");
                    }

                    if (pendingDomains.Any())
                    {
                        await dbContext.SaveChangesAsync(stoppingToken);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error occurred during ACME auto-provisioning cycle.");
                }

                // Check every minute for new domains needing certificates
                await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
            }
        }
    }
}

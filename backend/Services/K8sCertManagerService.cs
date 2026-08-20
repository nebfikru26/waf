using System;
using System.Net;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using k8s;
using k8s.Autorest;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace AffiniSecurity.Waf.Services
{
    /// <summary>
    /// Point-in-time snapshot of a cert-manager Certificate custom resource's status.
    /// </summary>
    public class CertificateStatus
    {
        public bool Exists { get; set; }
        public bool Ready { get; set; }
        public string? Message { get; set; }
        public DateTime? NotAfter { get; set; }
        public string? Issuer { get; set; }
    }

    public interface IK8sCertManagerService
    {
        /// <summary>
        /// True when a Kubernetes API connection was established at startup. When false, every
        /// operation returns a clear "unavailable" result instead of throwing — this lets the app
        /// run (and the test suite pass) in local/dev/CI environments with no cluster access.
        /// </summary>
        bool IsAvailable { get; }

        /// <summary>
        /// Ensures a cert-manager Certificate custom resource exists for the given domain,
        /// referencing the configured ClusterIssuer. Idempotent — a pre-existing resource with the
        /// same name is treated as success so this can be called repeatedly by the reconciliation loop.
        /// </summary>
        Task<(bool Success, string? Error)> EnsureCertificateAsync(string domainName, string certResourceName, string secretName, CancellationToken ct = default);

        /// <summary>
        /// Reads back the current status of a Certificate custom resource (Ready condition, expiry, etc).
        /// </summary>
        Task<CertificateStatus> GetCertificateStatusAsync(string certResourceName, CancellationToken ct = default);
    }

    /// <summary>
    /// Thin wrapper around the Kubernetes API for managing cert-manager `Certificate` custom
    /// resources (group `cert-manager.io`, version `v1`) so that per-tenant custom domains can be
    /// provisioned real Let's Encrypt certificates via the same `letsencrypt-prod` ClusterIssuer
    /// already used for the platform's own wildcard domain (see k8s/issuer.yaml).
    ///
    /// Construction never throws: if no cluster is reachable (no in-cluster service account token
    /// and no kubeconfig on disk — the case for local dev and the CI test environment), the client
    /// is left null and <see cref="IsAvailable"/> reports false so callers can degrade gracefully.
    /// </summary>
    public class K8sCertManagerService : IK8sCertManagerService
    {
        private const string Group = "cert-manager.io";
        private const string Version = "v1";
        private const string Plural = "certificates";

        private readonly ILogger<K8sCertManagerService> _logger;
        private readonly IKubernetes? _client;
        private readonly string _namespace;
        private readonly string _clusterIssuer;

        public bool IsAvailable => _client != null;

        public K8sCertManagerService(ILogger<K8sCertManagerService> logger, IConfiguration configuration)
        {
            _logger = logger;
            _namespace = configuration["Waf:K8sNamespace"] ?? "affinisecurity-waf";
            _clusterIssuer = configuration["Waf:ClusterIssuer"] ?? "letsencrypt-prod";

            try
            {
                var inCluster = KubernetesClientConfiguration.IsInCluster();
                var config = inCluster
                    ? KubernetesClientConfiguration.InClusterConfig()
                    : KubernetesClientConfiguration.BuildConfigFromConfigFile();

                _client = new Kubernetes(config);
                _logger.LogInformation("Kubernetes API client initialized ({Mode}). SSL auto-provisioning via cert-manager is enabled.",
                    inCluster ? "in-cluster service account" : "local kubeconfig");
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex,
                    "Kubernetes API is not reachable from this environment (expected in local dev / CI). " +
                    "Automated SSL certificate provisioning via cert-manager will be disabled until a cluster is available.");
                _client = null;
            }
        }

        public async Task<(bool Success, string? Error)> EnsureCertificateAsync(string domainName, string certResourceName, string secretName, CancellationToken ct = default)
        {
            if (_client == null)
            {
                return (false, "Kubernetes API is not available in this environment.");
            }

            var manifest = new
            {
                apiVersion = $"{Group}/{Version}",
                kind = "Certificate",
                metadata = new
                {
                    name = certResourceName,
                    @namespace = _namespace,
                    labels = new { app = "affinisecurity-waf", managedBy = "ssl-controller" }
                },
                spec = new
                {
                    secretName,
                    dnsNames = new[] { domainName },
                    issuerRef = new { name = _clusterIssuer, kind = "ClusterIssuer" }
                }
            };

            try
            {
                await _client.CustomObjects.CreateNamespacedCustomObjectAsync(manifest, Group, Version, _namespace, Plural, cancellationToken: ct);
                _logger.LogInformation("Created cert-manager Certificate resource {Name} for domain {Domain}", certResourceName, domainName);
                return (true, null);
            }
            catch (HttpOperationException ex) when (ex.Response.StatusCode == HttpStatusCode.Conflict)
            {
                // Certificate CR already exists — idempotent no-op, reconciliation continues via GetCertificateStatusAsync.
                return (true, null);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to create cert-manager Certificate resource {Name} for domain {Domain}", certResourceName, domainName);
                return (false, ex.Message);
            }
        }

        public async Task<CertificateStatus> GetCertificateStatusAsync(string certResourceName, CancellationToken ct = default)
        {
            if (_client == null)
            {
                return new CertificateStatus { Exists = false, Ready = false, Message = "Kubernetes API is not available in this environment." };
            }

            try
            {
                var raw = await _client.CustomObjects.GetNamespacedCustomObjectAsync(Group, Version, _namespace, Plural, certResourceName, cancellationToken: ct);
                var json = JsonSerializer.SerializeToElement(raw);
                var result = new CertificateStatus { Exists = true };

                if (json.TryGetProperty("status", out var statusEl))
                {
                    if (statusEl.TryGetProperty("notAfter", out var notAfterEl) && notAfterEl.ValueKind == JsonValueKind.String
                        && DateTime.TryParse(notAfterEl.GetString(), out var notAfter))
                    {
                        result.NotAfter = notAfter.ToUniversalTime();
                    }

                    if (statusEl.TryGetProperty("conditions", out var conditionsEl) && conditionsEl.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var condition in conditionsEl.EnumerateArray())
                        {
                            if (condition.TryGetProperty("type", out var typeEl) && typeEl.GetString() == "Ready")
                            {
                                result.Ready = condition.TryGetProperty("status", out var statusValEl) && statusValEl.GetString() == "True";
                                if (condition.TryGetProperty("message", out var msgEl))
                                {
                                    result.Message = msgEl.GetString();
                                }
                            }
                        }
                    }
                }

                return result;
            }
            catch (HttpOperationException ex) when (ex.Response.StatusCode == HttpStatusCode.NotFound)
            {
                return new CertificateStatus { Exists = false, Ready = false };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to read cert-manager Certificate status for {Name}", certResourceName);
                return new CertificateStatus { Exists = false, Ready = false, Message = ex.Message };
            }
        }
    }
}

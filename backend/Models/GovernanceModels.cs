using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace AffiniSecurity.Waf.Models
{
    /// <summary>
    /// Per-tenant record of what personal/regulated data is processed, why, under what legal
    /// basis, and for how long. Satisfies the "Processing Register" obligation of the Data
    /// Protection Proclamation 1321/2024 (the same artifact GDPR Art. 30 requires), and doubles
    /// as the DPIA (Data Protection Impact Assessment) tracker for higher-risk processing.
    /// </summary>
    [Table("data_processing_records")]
    public class DataProcessingRecord
    {
        [Key]
        [JsonPropertyName("id")]
        public string Id { get; set; } = Guid.NewGuid().ToString();

        [Required]
        [JsonPropertyName("tenantId")]
        public string TenantId { get; set; } = string.Empty;

        [Required]
        [JsonPropertyName("purpose")]
        public string Purpose { get; set; } = string.Empty;

        /// <summary>Comma-separated categories, e.g. "PII,Financial,Health,Traffic Logs".</summary>
        [JsonPropertyName("dataCategories")]
        public string DataCategories { get; set; } = string.Empty;

        /// <summary>e.g. "Consent", "Contract", "Legal Obligation", "Legitimate Interest".</summary>
        [JsonPropertyName("legalBasis")]
        public string LegalBasis { get; set; } = "Contract";

        [JsonPropertyName("retentionPeriod")]
        public string RetentionPeriod { get; set; } = "365 Days";

        /// <summary>Comma-separated list of third parties/sub-processors with access to this data.</summary>
        [JsonPropertyName("subProcessors")]
        public string? SubProcessors { get; set; }

        [JsonPropertyName("dpiaRequired")]
        public bool DpiaRequired { get; set; } = false;

        [JsonPropertyName("dpiaCompletedAt")]
        public DateTime? DpiaCompletedAt { get; set; }

        [JsonPropertyName("dpiaSummary")]
        public string? DpiaSummary { get; set; }

        [JsonPropertyName("createdAt")]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        [JsonPropertyName("updatedAt")]
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }

    /// <summary>
    /// A regulatory reporting-deadline clock opened whenever a security event may trigger a
    /// mandatory notification obligation. Critical Infrastructure Cybersecurity Proclamation
    /// 1426/2026 requires incident reports to the National CERT within 48 hours; the Data
    /// Protection Proclamation 1321/2024 requires personal-data breach notification within 72
    /// hours. Tracking both deadlines explicitly turns a manual legal deadline into a
    /// dashboard SLA that can't be missed silently.
    /// </summary>
    [Table("incident_clocks")]
    public class IncidentClock
    {
        [Key]
        [JsonPropertyName("id")]
        public string Id { get; set; } = Guid.NewGuid().ToString();

        [Required]
        [JsonPropertyName("tenantId")]
        public string TenantId { get; set; } = string.Empty;

        [JsonPropertyName("alertLogId")]
        public string? AlertLogId { get; set; }

        [Required]
        [JsonPropertyName("title")]
        public string Title { get; set; } = string.Empty;

        [JsonPropertyName("severity")]
        public string Severity { get; set; } = "HIGH";

        [JsonPropertyName("detectedAt")]
        public DateTime DetectedAt { get; set; } = DateTime.UtcNow;

        /// <summary>INSA National CERT notification deadline: DetectedAt + 48 hours.</summary>
        [JsonPropertyName("certDeadline")]
        public DateTime CertDeadline { get; set; }

        /// <summary>Personal-data breach notification deadline: DetectedAt + 72 hours.</summary>
        [JsonPropertyName("breachDeadline")]
        public DateTime BreachDeadline { get; set; }

        [JsonPropertyName("reportedToCertAt")]
        public DateTime? ReportedToCertAt { get; set; }

        [JsonPropertyName("reportedByCertEmail")]
        public string? ReportedByCertEmail { get; set; }

        [JsonPropertyName("reportedAsBreachAt")]
        public DateTime? ReportedAsBreachAt { get; set; }

        [JsonPropertyName("reportedByBreachEmail")]
        public string? ReportedByBreachEmail { get; set; }

        /// <summary>Open, CertReported, BreachReported, Resolved, Overdue.</summary>
        [JsonPropertyName("status")]
        public string Status { get; set; } = "Open";

        [JsonPropertyName("notes")]
        public string? Notes { get; set; }

        [JsonPropertyName("resolvedAt")]
        public DateTime? ResolvedAt { get; set; }
    }

    /// <summary>
    /// Tracks where the encryption keys protecting a tenant's data actually live. Data can be
    /// stored in-country and still fail a sovereignty audit if the decryption key is held by a
    /// foreign KMS — this is the most commonly missed control in data-localization reviews.
    /// </summary>
    [Table("key_custody_records")]
    public class KeyCustodyRecord
    {
        [Key]
        [JsonPropertyName("id")]
        public string Id { get; set; } = Guid.NewGuid().ToString();

        /// <summary>Null for platform-wide key custody (e.g. the shared DB-at-rest key).</summary>
        [JsonPropertyName("tenantId")]
        public string? TenantId { get; set; }

        /// <summary>TLS, DatabaseAtRest, BackupEncryption, AuditChainSecret.</summary>
        [Required]
        [JsonPropertyName("scope")]
        public string Scope { get; set; } = string.Empty;

        /// <summary>e.g. "HashiCorp Vault - Addis Ababa DC1", "AWS KMS - eu-west-1".</summary>
        [Required]
        [JsonPropertyName("keyManagementSystem")]
        public string KeyManagementSystem { get; set; } = string.Empty;

        [JsonPropertyName("isInCountry")]
        public bool IsInCountry { get; set; } = true;

        [JsonPropertyName("custodian")]
        public string? Custodian { get; set; }

        [JsonPropertyName("lastRotatedAt")]
        public DateTime? LastRotatedAt { get; set; }

        [JsonPropertyName("verifiedAt")]
        public DateTime? VerifiedAt { get; set; }

        [JsonPropertyName("createdAt")]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}

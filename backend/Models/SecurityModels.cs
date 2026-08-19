using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace AffiniSecurity.Waf.Models
{
    [Table("traffic_logs")]
    public class TrafficLog
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public int Id { get; set; }
        
        public string TenantId { get; set; }
        
        public string Time { get; set; }
        public int Requests { get; set; } = 0;
        public int Blocked { get; set; } = 0;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }

    [Table("top_ips")]
    public class TopIP
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public int Id { get; set; }
        
        public string TenantId { get; set; }
        
        public string Ip { get; set; }
        public int Requests { get; set; } = 0;
        public int Blocked { get; set; } = 0;
        public string Country { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }

    [Table("alert_logs")]
    public class AlertLog
    {
        [Key]
        public string Id { get; set; } = Guid.NewGuid().ToString();
        
        public string TenantId { get; set; }
        
        public string Ip { get; set; }
        public string RuleId { get; set; }
        public string Rule { get; set; }
        public string Uri { get; set; }
        public string Timestamp { get; set; }
        public string Severity { get; set; }
        public string Action { get; set; }
        public string? RawData { get; set; }
        
        [JsonPropertyName("mitre_technique")]
        public string? MitreTechnique { get; set; }
        
        [JsonPropertyName("mitre_tactic")]
        public string? MitreTactic { get; set; }
    }

    [Table("ip_rules")]
    public class IPRule
    {
        [Key]
        [JsonPropertyName("id")]
        public string Id { get; set; } = Guid.NewGuid().ToString();
        
        [JsonPropertyName("tenant_id")]
        public string? TenantId { get; set; }
        
        [JsonPropertyName("ip_address")]
        public string IpAddress { get; set; }
        
        [JsonPropertyName("rule_type")]
        public string RuleType { get; set; } // "whitelist", "blacklist"
        
        [JsonPropertyName("note")]
        public string Note { get; set; }
        
        [JsonPropertyName("created_at")]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }

    [Table("owasp_rules")]
    public class OWASPRule
    {
        [Key]
        [JsonPropertyName("id")]
        public string Id { get; set; } = Guid.NewGuid().ToString();
        
        [JsonPropertyName("tenant_id")]
        public string? TenantId { get; set; }
        
        [JsonPropertyName("rule_id")]
        public string? RuleId { get; set; }

        [JsonPropertyName("name")]
        public string Name { get; set; }

        [JsonPropertyName("category")]
        public string? Category { get; set; }

        [JsonPropertyName("severity")]
        public string? Severity { get; set; }

        [JsonPropertyName("action")]
        public string Action { get; set; } = "LOG"; // "BLOCK", "LOG", "DISABLED"

        [JsonPropertyName("description")]
        public string Description { get; set; }

        [JsonPropertyName("version_tag")]
        public string? VersionTag { get; set; }

        [JsonPropertyName("imported_at")]
        public DateTime ImportedAt { get; set; } = DateTime.UtcNow;

        [JsonPropertyName("mitre_technique")]
        public string? MitreTechnique { get; set; }

        [JsonPropertyName("mitre_tactic")]
        public string? MitreTactic { get; set; }
    }

    [Table("owasp_rule_exclusions")]
    public class OWASPRuleExclusion
    {
        [Key]
        [JsonPropertyName("id")]
        public string Id { get; set; } = Guid.NewGuid().ToString();

        [JsonPropertyName("tenant_id")]
        public string TenantId { get; set; }

        [JsonPropertyName("rule_id")]
        public string RuleId { get; set; }

        [JsonPropertyName("uri_pattern")]
        public string UriPattern { get; set; }

        [JsonPropertyName("description")]
        public string Description { get; set; }

        [JsonPropertyName("created_at")]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }


    [Table("custom_rules")]
    public class CustomRule
    {
        [Key]
        [JsonPropertyName("id")]
        public string Id { get; set; } = Guid.NewGuid().ToString();

        [JsonPropertyName("tenant_id")]
        public string? TenantId { get; set; }

        [JsonPropertyName("name")]
        public string Name { get; set; }

        [JsonPropertyName("description")]
        public string Description { get; set; }

        [JsonPropertyName("condition_field")]
        public string ConditionField { get; set; }

        [JsonPropertyName("condition_operator")]
        public string ConditionOperator { get; set; }

        [JsonPropertyName("condition_value")]
        public string ConditionValue { get; set; }

        [JsonPropertyName("condition2_field")]
        public string? Condition2Field { get; set; }

        [JsonPropertyName("condition2_operator")]
        public string? Condition2Operator { get; set; }

        [JsonPropertyName("condition2_value")]
        public string? Condition2Value { get; set; }

        [JsonPropertyName("logic_operator")]
        public string? LogicOperator { get; set; }

        [JsonPropertyName("category")]
        public string? Category { get; set; } // "SQLi", "XSS", "RCE", "Custom", etc.

        [JsonPropertyName("action")]
        public string Action { get; set; } = "BLOCK";

        [JsonPropertyName("priority")]
        public int Priority { get; set; } = 100;

        [JsonPropertyName("enabled")]
        public bool Enabled { get; set; } = true;

        [Column("is_raw")]
        [JsonPropertyName("is_raw")]
        public bool IsRaw { get; set; } = false;

        [Column("raw_content")]
        [JsonPropertyName("raw_content")]
        public string? RawContent { get; set; }

        [JsonPropertyName("created_at")]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        [JsonPropertyName("mitre_technique")]
        public string? MitreTechnique { get; set; }

        [JsonPropertyName("mitre_tactic")]
        public string? MitreTactic { get; set; }
    }

    [Table("uri_exclusions")]
    public class URIExclusion
    {
        [Key]
        [JsonPropertyName("id")]
        public string Id { get; set; } = Guid.NewGuid().ToString();

        [JsonPropertyName("tenant_id")]
        public string? TenantId { get; set; }

        [JsonPropertyName("uri_pattern")]
        public string UriPattern { get; set; }

        [JsonPropertyName("description")]
        public string Description { get; set; }

        [JsonPropertyName("enabled")]
        public bool Enabled { get; set; } = true;

        [JsonPropertyName("created_at")]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }

    [Table("known_bots")]
    public class KnownBot
    {
        [Key]
        [JsonPropertyName("id")]
        public string Id { get; set; } = Guid.NewGuid().ToString();

        [JsonPropertyName("name")]
        public string Name { get; set; } // e.g., "Googlebot"

        [JsonPropertyName("user_agent_pattern")]
        public string UserAgentPattern { get; set; } // e.g., "Googlebot"

        [JsonPropertyName("action")]
        public string Action { get; set; } = "allow"; // "allow", "challenge", "block"

        [JsonPropertyName("category")]
        public string Category { get; set; } // "Search Engine", "Monitoring", etc.

        [JsonPropertyName("is_verified")]
        public bool IsVerified { get; set; } = true; // Whether this is a verified global bot

        [JsonPropertyName("created_at")]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }

    [Table("rule_versions")]
    public class RuleVersion
    {
        [Key]
        [JsonPropertyName("id")]
        public string Id { get; set; } = Guid.NewGuid().ToString();

        [JsonPropertyName("rule_id")]
        public string RuleId { get; set; }

        [JsonPropertyName("tenant_id")]
        public string? TenantId { get; set; }

        [JsonPropertyName("snapshot_data")]
        public string SnapshotData { get; set; } // JSON serialized representation of the CustomRule

        [JsonPropertyName("version_timestamp")]
        public DateTime VersionTimestamp { get; set; } = DateTime.UtcNow;

        [JsonPropertyName("changed_by")]
        public string? ChangedBy { get; set; }
    }

    /// <summary>
    /// Represents a single Indicator of Compromise (IOC) ingested from a global threat feed (e.g., AlienVault OTX).
    /// </summary>
    [Table("ioc_indicators")]
    public class IocIndicator
    {
        [Key]
        [JsonPropertyName("id")]
        public string Id { get; set; } = Guid.NewGuid().ToString();

        /// <summary>The raw indicator value — e.g., "192.168.1.1", "malware.example.com", "d41d8cd98f00b204e9800998ecf8427e"</summary>
        [JsonPropertyName("indicator_value")]
        public string IndicatorValue { get; set; }

        /// <summary>Type of indicator: IPv4, IPv6, domain, URL, FileHash-MD5, FileHash-SHA1, FileHash-SHA256</summary>
        [JsonPropertyName("indicator_type")]
        public string IndicatorType { get; set; }

        /// <summary>The OTX pulse name this indicator belongs to.</summary>
        [JsonPropertyName("pulse_name")]
        public string? PulseName { get; set; }

        /// <summary>Primary threat category: Malware, Ransomware, C2, Phishing, Scanner, etc.</summary>
        [JsonPropertyName("threat_type")]
        public string? ThreatType { get; set; }

        /// <summary>Calculated severity: CRITICAL, HIGH, MEDIUM, LOW</summary>
        [JsonPropertyName("severity")]
        public string Severity { get; set; } = "MEDIUM";

        /// <summary>Source feed provider identifier.</summary>
        [JsonPropertyName("source")]
        public string Source { get; set; } = "AlienVault-OTX";

        /// <summary>Country code associated with the indicator (if available).</summary>
        [JsonPropertyName("country")]
        public string? Country { get; set; }

        /// <summary>External ID from the source provider (e.g., OTX Pulse ID, CVE ID).</summary>
        [JsonPropertyName("external_id")]
        public string? ExternalId { get; set; }

        /// <summary>Direct link to the threat information portal (e.g., OTX pulse page).</summary>
        [JsonPropertyName("external_link")]
        public string? ExternalLink { get; set; }

        /// <summary>Number of OTX subscribers who also track this indicator — higher = more credible.</summary>
        [JsonPropertyName("confidence_score")]
        public int ConfidenceScore { get; set; } = 50;

        [JsonPropertyName("first_seen")]
        public DateTime FirstSeen { get; set; } = DateTime.UtcNow;

        [JsonPropertyName("last_seen")]
        public DateTime LastSeen { get; set; } = DateTime.UtcNow;

        [JsonPropertyName("ingested_at")]
        public DateTime IngestedAt { get; set; } = DateTime.UtcNow;
        
        [JsonPropertyName("is_active")]
        public bool IsActive { get; set; } = true;
    }
}

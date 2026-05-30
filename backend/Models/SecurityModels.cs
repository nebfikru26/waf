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
}

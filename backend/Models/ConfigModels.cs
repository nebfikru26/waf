using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace AffiniSecurity.Waf.Models
{
    [Table("system_configs")]
    public class SystemConfig
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        [JsonPropertyName("id")]
        public int Id { get; set; }
        
        [JsonPropertyName("salesContactEmail")]
        public string SalesContactEmail { get; set; }
        
        [JsonPropertyName("salesContactPhone")]
        public string SalesContactPhone { get; set; }
        
        [JsonPropertyName("supportEmail")]
        public string SupportEmail { get; set; }

        [Column("crs_rules_repository_url")]
        [JsonPropertyName("crsRulesRepositoryUrl")]
        public string? CrsRulesRepositoryUrl { get; set; } = "https://github.com/coreruleset/coreruleset/archive/refs/heads/main.zip";

        [Column("eca_certification_number")]
        [JsonPropertyName("ecaCertificationNumber")]
        public string? EcaCertificationNumber { get; set; }
    }

    [Table("plan_configs")]
    public class PlanConfig
    {
        [Key]
        [JsonPropertyName("id")]
        public string Id { get; set; } = Guid.NewGuid().ToString();
        
        [Required]
        [JsonPropertyName("name")]
        public string Name { get; set; }
        
        [JsonPropertyName("maxDomains")]
        public int MaxDomains { get; set; } = 1;
        
        [JsonPropertyName("hasWafDetection")]
        public bool HasWafDetection { get; set; } = true;
        
        [JsonPropertyName("hasWafBlocking")]
        public bool HasWafBlocking { get; set; } = false;
        
        [JsonPropertyName("hasApiProtection")]
        public bool HasApiProtection { get; set; } = false;
        
        [JsonPropertyName("hasBotProtection")]
        public bool HasBotProtection { get; set; } = false;
        
        [JsonPropertyName("hasDdosProtection")]
        public bool HasDdosProtection { get; set; } = false;
        
        [JsonPropertyName("hasAccountTakeover")]
        public bool HasAccountTakeover { get; set; } = false;
        
        [JsonPropertyName("hasRateLimiting")]
        public bool HasRateLimiting { get; set; } = false;
        
        [JsonPropertyName("hasSslManagement")]
        public bool HasSslManagement { get; set; } = false;
        
        [JsonPropertyName("hasThreatIntel")]
        public bool HasThreatIntel { get; set; } = false;
        
        [JsonPropertyName("hasAttackLogs")]
        public bool HasAttackLogs { get; set; } = false;
        
        [JsonPropertyName("hasNotifications")]
        public bool HasNotifications { get; set; } = false;
        
        [JsonPropertyName("hasAnalytics")]
        public bool HasAnalytics { get; set; } = false;
        
        [JsonPropertyName("priceEtb")]
        public double PriceEtb { get; set; } = 0.0;
        
        [JsonPropertyName("isActive")]
        public bool IsActive { get; set; } = true;
        
        [JsonPropertyName("createdAt")]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }

    [Table("subscriptions")]
    public class Subscription
    {
        [Key]
        [JsonPropertyName("id")]
        public string Id { get; set; } = Guid.NewGuid().ToString();
        
        [JsonPropertyName("tenantId")]
        public string TenantId { get; set; }
        
        [JsonPropertyName("planName")]
        public string PlanName { get; set; }
        
        [JsonPropertyName("status")]
        public string Status { get; set; } // "Active", "Pending_Payment"
        
        [JsonPropertyName("gateway")]
        public string Gateway { get; set; } // "Chapa", "Telebirr"
        
        [JsonPropertyName("createdAt")]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}

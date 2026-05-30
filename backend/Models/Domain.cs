using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace AffiniSecurity.Waf.Models
{
    [Table("domains")]
    public class Domain
    {
        [Key]
        [JsonPropertyName("id")]
        public string Id { get; set; } = Guid.NewGuid().ToString();
        
        [JsonPropertyName("tenant_id")]
        public string? TenantId { get; set; }
        
        [JsonPropertyName("domain_name")]
        public string DomainName { get; set; }
        
        [JsonPropertyName("origin_ip")]
        public string OriginIp { get; set; }
        
        [JsonPropertyName("ssl_mode")]
        public string SslMode { get; set; }
        
        [JsonPropertyName("status")]
        public string Status { get; set; } = "pending"; // "active", "pending"
        
        [JsonPropertyName("ssl_provisioned")]
        public bool SslProvisioned { get; set; } = false;
        
        [JsonPropertyName("dns_verified")]
        public bool DnsVerified { get; set; } = false;
        
        [JsonPropertyName("created_at")]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        [JsonPropertyName("under_attack_mode")]
        public bool UnderAttackMode { get; set; } = false;

        [JsonPropertyName("force_https")]
        public bool ForceHttps { get; set; } = true;

        [JsonPropertyName("protection_mode")]
        public string ProtectionMode { get; set; } = "prevention"; // "prevention", "detection"

        [JsonPropertyName("sensitivity")]
        public int Sensitivity { get; set; } = 1; // Maps to CRS Paranoia Levels 1-4
    }
}

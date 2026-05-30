using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace AffiniSecurity.Waf.Models
{
    [Table("ssl_certificates")]
    public class SSLCertificate
    {
        [Key]
        public string Id { get; set; } = Guid.NewGuid().ToString();
        
        public string Domain { get; set; }
        
        public string TenantId { get; set; }
        
        public string Issuer { get; set; }
        public DateTime? Expiry { get; set; }
        public string Status { get; set; }
        public string Grade { get; set; }
        public string Protocol { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }

    [Table("tls_configs")]
    public class TLSConfig
    {
        [Key]
        public string Id { get; set; } = Guid.NewGuid().ToString();
        
        public string TenantId { get; set; }
        
        public bool HttpsRedirect { get; set; } = true;
        public bool Hsts { get; set; } = true;
        public bool HstsPreload { get; set; } = false;
        public bool OcspStapling { get; set; } = true;
        public bool AutoRenewal { get; set; } = true;
        public bool Tls13Only { get; set; } = false;
        public string MinTlsVersion { get; set; } = "1.2";
    }

    [Table("api_endpoints")]
    public class APIEndpoint
    {
        [Key]
        [JsonPropertyName("id")]
        public string Id { get; set; } = Guid.NewGuid().ToString();
        
        [JsonPropertyName("tenant_id")]
        public string? TenantId { get; set; }
        
        [JsonPropertyName("path")]
        public string Path { get; set; }
        
        [JsonPropertyName("method")]
        public string Method { get; set; }
        
        [JsonPropertyName("allowed_methods")]
        public string AllowedMethods { get; set; }
        
        [JsonPropertyName("rate_limit")]
        public int RateLimit { get; set; } = 100;
        
        [JsonPropertyName("auth_required")]
        public bool AuthRequired { get; set; } = false;
        
        [JsonPropertyName("schema_validation")]
        public bool SchemaValidation { get; set; } = false;
        
        [JsonPropertyName("schema_mode")]
        public string SchemaMode { get; set; } = "monitor";
        
        [JsonPropertyName("required_params")]
        public string RequiredParams { get; set; }
        
        [JsonPropertyName("max_body_kb")]
        public int MaxBodyKb { get; set; } = 0;
        
        [JsonPropertyName("description")]
        public string Description { get; set; }
        
        [JsonPropertyName("status")]
        public string Status { get; set; }
    }
}

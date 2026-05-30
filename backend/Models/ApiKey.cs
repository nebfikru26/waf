using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace AffiniSecurity.Waf.Models
{
    [Table("api_keys")]
    public class ApiKey
    {
        [Key]
        [Column("id")]
        [JsonPropertyName("id")]
        public string Id { get; set; } = Guid.NewGuid().ToString();

        [Column("tenant_id")]
        [JsonPropertyName("tenant_id")]
        public string TenantId { get; set; } = string.Empty;

        [Column("name")]
        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        [Column("key_hash")]
        [JsonIgnore] // Never send the hash back to the frontend
        public string KeyHash { get; set; } = string.Empty;

        [Column("prefix")]
        [JsonPropertyName("prefix")]
        public string Prefix { get; set; } = string.Empty;

        [Column("is_revoked")]
        [JsonPropertyName("is_revoked")]
        public bool IsRevoked { get; set; } = false;

        [Column("created_at")]
        [JsonPropertyName("created_at")]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        [Column("expires_at")]
        [JsonPropertyName("expires_at")]
        public DateTime? ExpiresAt { get; set; }

        [Column("last_used_at")]
        [JsonPropertyName("last_used_at")]
        public DateTime? LastUsedAt { get; set; }
    }
}

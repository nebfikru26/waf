using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace AffiniSecurity.Waf.Models
{
    [Table("audit_logs")]
    public class AuditLog
    {
        [Key]
        [Column("id")]
        [JsonPropertyName("id")]
        public string Id { get; set; } = Guid.NewGuid().ToString();

        [Column("tenant_id")]
        [JsonPropertyName("tenant_id")]
        public string? TenantId { get; set; }

        [Column("user_id")]
        [JsonPropertyName("user_id")]
        public string? UserId { get; set; }

        [Column("user_email")]
        [JsonPropertyName("user_email")]
        public string? UserEmail { get; set; }

        [Column("action")]
        [JsonPropertyName("action")]
        public string Action { get; set; } = string.Empty; // e.g. "Modified", "Created", "Deleted"

        [Column("entity_name")]
        [JsonPropertyName("entity_name")]
        public string EntityName { get; set; } = string.Empty; // e.g. "SecuritySettings"

        [Column("entity_id")]
        [JsonPropertyName("entity_id")]
        public string EntityId { get; set; } = string.Empty;

        [Column("old_values", TypeName = "jsonb")]
        [JsonPropertyName("old_values")]
        public string? OldValues { get; set; } // JSON serialized state

        [Column("new_values", TypeName = "jsonb")]
        [JsonPropertyName("new_values")]
        public string? NewValues { get; set; } // JSON serialized state

        [Column("ip_address")]
        [JsonPropertyName("ip_address")]
        public string? IpAddress { get; set; }

        [Column("request_path")]
        [JsonPropertyName("request_path")]
        public string? RequestPath { get; set; }

        [Column("request_method")]
        [JsonPropertyName("request_method")]
        public string? RequestMethod { get; set; }

        [Column("timestamp")]
        [JsonPropertyName("timestamp")]
        public DateTime Timestamp { get; set; } = DateTime.UtcNow;

        [Column("hash_chain")]
        [JsonPropertyName("hash_chain")]
        public string? HashChain { get; set; } // Cryptographic chain for integrity
    }
}

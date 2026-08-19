using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace AffiniSecurity.Waf.Models
{
    [Table("service_subscriptions")]
    public class ServiceSubscription
    {
        [Key]
        [JsonPropertyName("id")]
        public string Id { get; set; } = Guid.NewGuid().ToString();

        [JsonPropertyName("tenantId")]
        public string TenantId { get; set; } = string.Empty;

        [JsonPropertyName("serviceName")]
        public string ServiceName { get; set; } = string.Empty;

        [JsonPropertyName("subscribedAt")]
        public DateTime SubscribedAt { get; set; } = DateTime.UtcNow;

        [JsonPropertyName("expiration")]
        public DateTime? Expiration { get; set; }
    }
}

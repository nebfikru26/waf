using System;
using System.Text.Json.Serialization;

namespace AffiniSecurity.Waf.Models.DTOs
{
    public class ServiceSubscriptionDto
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = string.Empty;

        [JsonPropertyName("tenantId")]
        public string TenantId { get; set; } = string.Empty;

        [JsonPropertyName("serviceName")]
        public string ServiceName { get; set; } = string.Empty;

        [JsonPropertyName("subscribedAt")]
        public DateTime SubscribedAt { get; set; }

        [JsonPropertyName("expiration")]
        public DateTime? Expiration { get; set; }
    }
}

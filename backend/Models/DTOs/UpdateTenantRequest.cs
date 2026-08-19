using System.Text.Json.Serialization;

namespace AffiniSecurity.Waf.Models.DTOs
{
    public class UpdateTenantRequest
    {
        [JsonPropertyName("name")]
        public string? Name { get; set; }

        [JsonPropertyName("legalName")]
        public string? LegalName { get; set; }

        [JsonPropertyName("domain")]
        public string? Domain { get; set; }

        [JsonPropertyName("contactEmail")]
        public string? ContactEmail { get; set; }

        [JsonPropertyName("contactPhone")]
        public string? ContactPhone { get; set; }

        [JsonPropertyName("address")]
        public string? Address { get; set; }

        [JsonPropertyName("industry")]
        public string? Industry { get; set; }

        [JsonPropertyName("manager")]
        public string? Manager { get; set; }

        [JsonPropertyName("isActive")]
        public bool? IsActive { get; set; }

        [JsonPropertyName("onboardingStep")]
        public int? OnboardingStep { get; set; }

        [JsonPropertyName("mlDetectionEnabled")]
        public bool? MlDetectionEnabled { get; set; }

        [JsonPropertyName("wafMode")]
        public string? WafMode { get; set; }
    }
}


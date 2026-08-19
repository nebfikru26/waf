using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace AffiniSecurity.Waf.Models.DTOs
{
    public class TenantDetailDto
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = string.Empty;

        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        [JsonPropertyName("legalName")]
        public string LegalName { get; set; } = string.Empty;

        [JsonPropertyName("domain")]
        public string Domain { get; set; } = string.Empty;

        [JsonPropertyName("contactPhone")]
        public string ContactPhone { get; set; } = string.Empty;

        [JsonPropertyName("contactEmail")]
        public string ContactEmail { get; set; } = string.Empty;

        [JsonPropertyName("address")]
        public string Address { get; set; } = string.Empty;

        [JsonPropertyName("industry")]
        public string Industry { get; set; } = string.Empty;

        [JsonPropertyName("manager")]
        public string Manager { get; set; } = string.Empty;

        [JsonPropertyName("isActive")]
        public bool IsActive { get; set; } = true;

        [JsonPropertyName("isProfileComplete")]
        public bool IsProfileComplete { get; set; }

        [JsonPropertyName("onboardingStep")]
        public int OnboardingStep { get; set; }

        [JsonPropertyName("createdAt")]
        public DateTime CreatedAt { get; set; }

        [JsonPropertyName("subscriptions")]
        public List<ServiceSubscriptionDto> Subscriptions { get; set; } = new();

        [JsonPropertyName("paymentInfo")]
        public PaymentInfoDto? PaymentInfo { get; set; }

        [JsonPropertyName("members")]
        public List<TenantMemberDto> Members { get; set; } = new();

        [JsonPropertyName("mlDetectionEnabled")]
        public bool MlDetectionEnabled { get; set; } = true;

        [JsonPropertyName("wafMode")]
        public string WafMode { get; set; } = "detection";
    }
}


using System;
using System.Text.Json.Serialization;

namespace AffiniSecurity.Waf.Models.DTOs
{
    public class TenantDto
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = string.Empty;

        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        [JsonPropertyName("legalName")]
        public string LegalName { get; set; } = string.Empty;

        [JsonPropertyName("tinNo")]
        public string TinNo { get; set; } = string.Empty;

        [JsonPropertyName("licenseNo")]
        public string LicenseNo { get; set; } = string.Empty;

        [JsonPropertyName("category")]
        public string Category { get; set; } = string.Empty;

        [JsonPropertyName("industry")]
        public string Industry { get; set; } = string.Empty;

        [JsonPropertyName("address")]
        public string Address { get; set; } = string.Empty;

        [JsonPropertyName("domain")]
        public string Domain { get; set; } = string.Empty;

        // Admin User Details (for provisioning)
        [JsonPropertyName("adminName")]
        public string? AdminName { get; set; }

        [JsonPropertyName("adminEmail")]
        public string? AdminEmail { get; set; }

        [JsonPropertyName("adminPhone")]
        public string? AdminPhone { get; set; }

        [JsonPropertyName("adminPassword")]
        public string? AdminPassword { get; set; }

        [JsonPropertyName("createdAt")]
        public DateTime CreatedAt { get; set; }
    }
}

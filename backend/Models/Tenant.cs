using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace AffiniSecurity.Waf.Models
{
    [Table("tenants")]
    public class Tenant
    {
        [Key]
        [JsonPropertyName("id")]
        public string Id { get; set; } = Guid.NewGuid().ToString();
        
        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;
        
        [JsonPropertyName("legalName")]
        public string LegalName { get; set; } = string.Empty;
        
        [JsonPropertyName("manager")]
        public string Manager { get; set; } = string.Empty;
        
        [JsonPropertyName("licenseNo")]
        public string LicenseNo { get; set; } = string.Empty;
        
        [JsonPropertyName("tinNo")]
        public string TinNo { get; set; } = string.Empty;
        
        [JsonPropertyName("address")]
        public string Address { get; set; } = string.Empty;
        
        [JsonPropertyName("industry")]
        public string Industry { get; set; } = string.Empty;
        
        [JsonPropertyName("category")]
        public string Category { get; set; } = string.Empty;
        
        [JsonPropertyName("contactPhone")]
        public string ContactPhone { get; set; } = string.Empty;
        
        [JsonPropertyName("contactEmail")]
        public string ContactEmail { get; set; } = string.Empty;
        
        [JsonPropertyName("contactPerson")]
        public string ContactPerson { get; set; } = string.Empty;
        
        [JsonPropertyName("website")]
        public string Website { get; set; } = string.Empty;
        
        [JsonPropertyName("isProfileComplete")]
        public bool IsProfileComplete { get; set; } = false;
        
        [JsonPropertyName("isActive")]
        public bool IsActive { get; set; } = true;
        
        [JsonPropertyName("createdAt")]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        
        // Branding & White-labeling
        [JsonPropertyName("logoUrl")]
        public string? LogoUrl { get; set; }
        
        [JsonPropertyName("primaryColor")]
        public string? PrimaryColor { get; set; } = "#1a75d1"; // Corporate blue (rgb(26, 117, 209))
        
        [JsonPropertyName("brandName")]
        public string? BrandName { get; set; }

        /// <summary>Current step in the multi-step onboarding wizard (0 = not started, 5 = complete).</summary>
        [JsonPropertyName("onboardingStep")]
        public int OnboardingStep { get; set; } = 0;

        [JsonIgnore]
        public virtual ICollection<ServiceSubscription> Subscriptions { get; set; } = new List<ServiceSubscription>();
        
        [JsonIgnore]
        public virtual PaymentInfo? Payment { get; set; }
        
        [JsonIgnore]
        public virtual ICollection<TenantMember> Members { get; set; } = new List<TenantMember>();
    }
}

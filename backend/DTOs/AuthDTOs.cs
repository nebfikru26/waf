using System.Collections.Generic;
using System.Text.Json.Serialization;
using AffiniSecurity.Waf.Models;

namespace AffiniSecurity.Waf.DTOs
{
    public class LoginRequest
    {
        [JsonPropertyName("email")]
        public string Email { get; set; } = string.Empty;
        
        [JsonPropertyName("password")]
        public string Password { get; set; } = string.Empty;
    }

    public class ResetPasswordRequest
    {
        [JsonPropertyName("email")]
        public string Email { get; set; } = string.Empty;
        
        [JsonPropertyName("password")]
        public string Password { get; set; } = string.Empty;
    }

    public class SignupRequest
    {
        [JsonPropertyName("email")]
        public string Email { get; set; } = string.Empty;
        
        [JsonPropertyName("password")]
        public string Password { get; set; } = string.Empty;
        
        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        [JsonPropertyName("companyName")]
        public string CompanyName { get; set; } = string.Empty;

        [JsonPropertyName("legalName")]
        public string? LegalName { get; set; }

        [JsonPropertyName("phone")]
        public string Phone { get; set; } = string.Empty;

        [JsonPropertyName("tinNo")]
        public string? TinNo { get; set; }

        [JsonPropertyName("licenseNo")]
        public string? LicenseNo { get; set; }

        [JsonPropertyName("industry")]
        public string? Industry { get; set; }

        [JsonPropertyName("category")]
        public string? Category { get; set; }

        [JsonPropertyName("address")]
        public string? Address { get; set; }
    }

    public class UserDTO
    {
        [JsonPropertyName("id")] public string Id { get; set; } = string.Empty;
        [JsonPropertyName("email")] public string Email { get; set; } = string.Empty;
        [JsonPropertyName("name")] public string Name { get; set; } = string.Empty;
        [JsonPropertyName("role")] public string Role { get; set; } = string.Empty;
        [JsonPropertyName("tenantId")] public string TenantId { get; set; } = string.Empty;

        /// <summary>
        /// Named permissions granted to this user's role (see WafPermissions), so the
        /// frontend can gate UI affordances (buttons/menus) on the same claims the backend
        /// authorization policies enforce, instead of hardcoding role-name checks that can
        /// drift out of sync with the server-side source of truth.
        /// </summary>
        [JsonPropertyName("permissions")] public List<string> Permissions { get; set; } = new();
    }

    public class TenantDTO
    {
        [JsonPropertyName("id")] public string Id { get; set; } = string.Empty;
        [JsonPropertyName("name")] public string Name { get; set; } = string.Empty;
        [JsonPropertyName("legalName")] public string? LegalName { get; set; }
        [JsonPropertyName("tinNo")] public string? TinNo { get; set; }
        [JsonPropertyName("licenseNo")] public string? LicenseNo { get; set; }
        [JsonPropertyName("category")] public string? Category { get; set; }
        [JsonPropertyName("industry")] public string? Industry { get; set; }
        [JsonPropertyName("logoUrl")] public string? LogoUrl { get; set; }
        [JsonPropertyName("primaryColor")] public string? PrimaryColor { get; set; }
        [JsonPropertyName("brandName")] public string? BrandName { get; set; }
        [JsonPropertyName("manager")] public string? Manager { get; set; }
        [JsonPropertyName("address")] public string? Address { get; set; }
        [JsonPropertyName("contactEmail")] public string? ContactEmail { get; set; }
        [JsonPropertyName("contactPhone")] public string? ContactPhone { get; set; }
        [JsonPropertyName("isProfileComplete")] public bool IsProfileComplete { get; set; }
        [JsonPropertyName("onboardingStep")] public int OnboardingStep { get; set; }
    }

    public class SubscriptionDTO
    {
        [JsonPropertyName("id")] public string Id { get; set; } = string.Empty;
        [JsonPropertyName("planName")] public string PlanName { get; set; } = string.Empty;
        [JsonPropertyName("status")] public string Status { get; set; } = string.Empty;
    }

    public class AuthResponse
    {
        [JsonPropertyName("token")]
        public string Token { get; set; } = string.Empty;
        
        [JsonPropertyName("user")]
        public UserDTO User { get; set; } = null!;
        
        [JsonPropertyName("tenant")]
        public TenantDTO Tenant { get; set; } = null!;
        
        [JsonPropertyName("plan")]
        public SubscriptionDTO Plan { get; set; } = null!;
        
        [JsonPropertyName("planConfig")]
        public PlanConfig? PlanConfig { get; set; }
    }
}

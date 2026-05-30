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

        [JsonPropertyName("phone")]
        public string Phone { get; set; } = string.Empty;
    }

    public class AuthResponse
    {
        [JsonPropertyName("token")]
        public string Token { get; set; } = string.Empty;
        
        [JsonPropertyName("user")]
        public User User { get; set; } = null!;
        
        [JsonPropertyName("tenant")]
        public Tenant Tenant { get; set; } = null!;
        
        [JsonPropertyName("plan")]
        public Subscription Plan { get; set; } = null!;

        [JsonPropertyName("planConfig")]
        public PlanConfig? PlanConfig { get; set; }

    }
}

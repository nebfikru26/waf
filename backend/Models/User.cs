using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace AffiniSecurity.Waf.Models
{
    [Table("users")]
    public class User
    {
        [Key]
        [JsonPropertyName("id")]
        public string Id { get; set; } = Guid.NewGuid().ToString();
        
        [JsonPropertyName("tenantId")]
        public string TenantId { get; set; }
        
        [Required]
        [JsonPropertyName("email")]
        public string Email { get; set; }
        
        [JsonPropertyName("name")]
        public string Name { get; set; }
        
        [JsonPropertyName("phone")]
        public string Phone { get; set; }
        
        [JsonPropertyName("jobTitle")]
        public string JobTitle { get; set; }
        
        [JsonPropertyName("bio")]
        public string Bio { get; set; }
        
        [JsonIgnore]
        public string Password { get; set; } // Hashed password
        
        [JsonPropertyName("role")]
        public string Role { get; set; } = "tenant_admin";
        
        [JsonPropertyName("isActive")]
        public bool IsActive { get; set; } = true;

        [JsonPropertyName("createdAt")]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}

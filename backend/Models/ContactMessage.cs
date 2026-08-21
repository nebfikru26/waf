using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace AffiniSecurity.Waf.Models
{
    /// <summary>
    /// A submission from the public marketing-site contact form (POST /api/contact). There is
    /// no SMTP/email-sending infrastructure anywhere in this backend, so submissions are
    /// persisted here for a platform admin to review (GET /api/contact) rather than silently
    /// dropped or fabricated as "sent".
    /// </summary>
    [Table("contact_messages")]
    public class ContactMessage
    {
        [Key]
        [JsonPropertyName("id")]
        public string Id { get; set; } = Guid.NewGuid().ToString();

        [Required]
        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        [Required]
        [JsonPropertyName("email")]
        public string Email { get; set; } = string.Empty;

        [JsonPropertyName("subject")]
        public string? Subject { get; set; }

        [Required]
        [JsonPropertyName("message")]
        public string Message { get; set; } = string.Empty;

        [JsonPropertyName("ipAddress")]
        public string? IpAddress { get; set; }

        /// <summary>New | Read | Resolved</summary>
        [JsonPropertyName("status")]
        public string Status { get; set; } = "New";

        [JsonPropertyName("createdAt")]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}

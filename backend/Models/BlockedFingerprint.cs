using System;
using System.ComponentModel.DataAnnotations;

namespace AffiniSecurity.Waf.Models
{
    public class BlockedFingerprint
    {
        [Key]
        public string Id { get; set; } = Guid.NewGuid().ToString();
        
        [Required]
        public string Fingerprint { get; set; } // JA3 MD5 Hash or other fingerprint
        
        [Required]
        public string Type { get; set; } // "JA3", "JA4", "Canvas", etc.
        
        public string? Description { get; set; }
        
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        
        public bool IsGlobal { get; set; } = true;
        
        public string? TenantId { get; set; } // Optional: allows per-tenant blacklisting
    }
}

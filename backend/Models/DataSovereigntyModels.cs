using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace AffiniSecurity.Waf.Models
{
    /// <summary>
    /// A physical/legal hosting zone that tenant data (logs, PII, audit trail) can be pinned to.
    /// Lets the platform prove, per-tenant, exactly where regulated data resides — required for
    /// Data Protection Proclamation 1321/2024 and INSA Critical Infrastructure oversight.
    /// </summary>
    [Table("data_residency_zones")]
    public class DataResidencyZone
    {
        [Key]
        [JsonPropertyName("id")]
        public string Id { get; set; } = Guid.NewGuid().ToString();

        /// <summary>Stable machine code, e.g. "ET-ADDIS-DC1", "EU-FRA-1".</summary>
        [Required]
        [JsonPropertyName("code")]
        public string Code { get; set; } = string.Empty;

        [Required]
        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        [JsonPropertyName("countryCode")]
        public string CountryCode { get; set; } = "ET";

        [JsonPropertyName("facilityProvider")]
        public string? FacilityProvider { get; set; }

        /// <summary>True when the zone is physically inside Ethiopia (or a legally recognized in-country facility).</summary>
        [JsonPropertyName("isInCountry")]
        public bool IsInCountry { get; set; } = true;

        [JsonPropertyName("isDefault")]
        public bool IsDefault { get; set; } = false;

        [JsonPropertyName("isActive")]
        public bool IsActive { get; set; } = true;

        [JsonPropertyName("createdAt")]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }

    /// <summary>
    /// Point-in-time record of a tenant's data residency assignment, kept alongside the
    /// immutable audit chain so every change to "where is this tenant's data stored" is
    /// independently inspectable without digging through generic audit logs.
    /// </summary>
    [Table("data_residency_assignments")]
    public class DataResidencyAssignment
    {
        [Key]
        [JsonPropertyName("id")]
        public string Id { get; set; } = Guid.NewGuid().ToString();

        [Required]
        [JsonPropertyName("tenantId")]
        public string TenantId { get; set; } = string.Empty;

        [Required]
        [JsonPropertyName("zoneCode")]
        public string ZoneCode { get; set; } = string.Empty;

        [JsonPropertyName("previousZoneCode")]
        public string? PreviousZoneCode { get; set; }

        [JsonPropertyName("reason")]
        public string? Reason { get; set; }

        [JsonPropertyName("changedByEmail")]
        public string? ChangedByEmail { get; set; }

        [JsonPropertyName("changedAt")]
        public DateTime ChangedAt { get; set; } = DateTime.UtcNow;
    }
}

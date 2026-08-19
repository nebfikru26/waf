using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace AffiniSecurity.Waf.Models
{
    [Table("tenant_rule_sets")]
    public class TenantRuleSet
    {
        [Key]
        [JsonPropertyName("id")]
        public string Id { get; set; } = Guid.NewGuid().ToString();

        [JsonPropertyName("tenantId")]
        public string TenantId { get; set; } = string.Empty;

        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        [JsonPropertyName("description")]
        public string Description { get; set; } = string.Empty;

        /// <summary>
        /// Comma-separated list of OWASPRule IDs included in this set.
        /// </summary>
        [JsonPropertyName("ruleIds")]
        public string RuleIds { get; set; } = string.Empty;

        /// <summary>
        /// Comma-separated list of OWASPRule IDs that are explicitly disabled for this tenant.
        /// </summary>
        [JsonPropertyName("disabledRuleIds")]
        public string DisabledRuleIds { get; set; } = string.Empty;

        /// <summary>
        /// If set, references the RuleSetTemplate this set was created from.
        /// </summary>
        [JsonPropertyName("sourceTemplateId")]
        public string? SourceTemplateId { get; set; }

        [JsonPropertyName("createdAt")]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        [JsonPropertyName("updatedAt")]
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }
}

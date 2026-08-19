using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace AffiniSecurity.Waf.Models.DTOs
{
    public class TenantRuleSetDto
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = string.Empty;

        [JsonPropertyName("tenantId")]
        public string TenantId { get; set; } = string.Empty;

        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        [JsonPropertyName("description")]
        public string Description { get; set; } = string.Empty;

        [JsonPropertyName("ruleIds")]
        public List<string> RuleIds { get; set; } = new();

        [JsonPropertyName("disabledRuleIds")]
        public List<string> DisabledRuleIds { get; set; } = new();

        [JsonPropertyName("sourceTemplateId")]
        public string? SourceTemplateId { get; set; }

        [JsonPropertyName("createdAt")]
        public DateTime CreatedAt { get; set; }

        [JsonPropertyName("updatedAt")]
        public DateTime UpdatedAt { get; set; }
    }

    public class CreateTenantRuleSetRequest
    {
        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        [JsonPropertyName("description")]
        public string Description { get; set; } = string.Empty;

        [JsonPropertyName("ruleIds")]
        public List<string> RuleIds { get; set; } = new();
    }

    public class UpdateRuleOverridesRequest
    {
        [JsonPropertyName("ruleId")]
        public string RuleId { get; set; } = string.Empty;

        [JsonPropertyName("enabled")]
        public bool Enabled { get; set; } = true;
    }
}

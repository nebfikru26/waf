using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace AffiniSecurity.Waf.Models.DTOs
{
    public class RuleSetTemplateDto
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = string.Empty;

        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        [JsonPropertyName("description")]
        public string Description { get; set; } = string.Empty;

        [JsonPropertyName("category")]
        public string Category { get; set; } = string.Empty;

        [JsonPropertyName("ruleCategories")]
        public List<string> RuleCategories { get; set; } = new();

        [JsonPropertyName("ruleCount")]
        public int RuleCount { get; set; }

        [JsonPropertyName("isBuiltIn")]
        public bool IsBuiltIn { get; set; }

        [JsonPropertyName("createdAt")]
        public DateTime CreatedAt { get; set; }
    }

    public class ApplyTemplateRequest
    {
        [JsonPropertyName("tenantId")]
        public string TenantId { get; set; } = string.Empty;

        [JsonPropertyName("ruleSetName")]
        public string RuleSetName { get; set; } = string.Empty;
    }
    public class CreateTemplateRequest
    {
        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        [JsonPropertyName("description")]
        public string? Description { get; set; }

        [JsonPropertyName("category")]
        public string? Category { get; set; }

        [JsonPropertyName("ruleCategories")]
        public List<string>? RuleCategories { get; set; }
    }
}

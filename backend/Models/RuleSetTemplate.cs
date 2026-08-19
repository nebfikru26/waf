using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace AffiniSecurity.Waf.Models
{
    [Table("rule_set_templates")]
    public class RuleSetTemplate
    {
        [Key]
        [JsonPropertyName("id")]
        public string Id { get; set; } = Guid.NewGuid().ToString();

        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        [JsonPropertyName("description")]
        public string Description { get; set; } = string.Empty;

        [JsonPropertyName("category")]
        public string Category { get; set; } = string.Empty;

        /// <summary>
        /// Comma-separated list of OWASPRule Category values to include.
        /// e.g. "SQL Injection,Cross-Site Scripting,PHP Injection"
        /// </summary>
        [JsonPropertyName("ruleCategories")]
        public string RuleCategories { get; set; } = string.Empty;

        [JsonPropertyName("isBuiltIn")]
        public bool IsBuiltIn { get; set; } = true;

        [JsonPropertyName("createdAt")]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}

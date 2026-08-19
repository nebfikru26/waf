using System;
using System.Text.Json.Serialization;

namespace AffiniSecurity.Waf.Models.DTOs
{
    public class AdminTenantListItemDto
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = string.Empty;

        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        [JsonPropertyName("website")]
        public string Website { get; set; } = string.Empty;

        [JsonPropertyName("contactEmail")]
        public string ContactEmail { get; set; } = string.Empty;

        [JsonPropertyName("isActive")]
        public bool IsActive { get; set; }

        [JsonPropertyName("createdAt")]
        public DateTime CreatedAt { get; set; }

        [JsonPropertyName("plan")]
        public string Plan { get; set; } = "Free";

        [JsonPropertyName("membersCount")]
        public int MembersCount { get; set; }
    }

    public class AdminTenantListResponse
    {
        [JsonPropertyName("total")]
        public int Total { get; set; }

        [JsonPropertyName("tenants")]
        public List<AdminTenantListItemDto> Tenants { get; set; } = new List<AdminTenantListItemDto>();

        [JsonPropertyName("page")]
        public int Page { get; set; }

        [JsonPropertyName("pageSize")]
        public int PageSize { get; set; }
    }
}

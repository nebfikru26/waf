using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using AffiniSecurity.Waf.Data;
using AffiniSecurity.Waf.Models;
using Microsoft.EntityFrameworkCore;

namespace AffiniSecurity.Waf.Services
{
    public class ResidencyTenantStatus
    {
        public string TenantId { get; set; } = string.Empty;
        public string TenantName { get; set; } = string.Empty;
        public string? Industry { get; set; }
        public string ZoneCode { get; set; } = string.Empty;
        public string ZoneName { get; set; } = string.Empty;
        public bool IsInCountry { get; set; }
        public bool RequiresInCountry { get; set; }
        public bool IsCompliant { get; set; }
        public DateTime? LastVerifiedAt { get; set; }
    }

    public class DataSovereigntyOverviewResult
    {
        public List<DataResidencyZone> Zones { get; set; } = new();
        public List<ResidencyTenantStatus> Tenants { get; set; } = new();
        public int TotalTenants { get; set; }
        public int InCountryCount { get; set; }
        public int RegulatedCount { get; set; }
        public int NonCompliantCount { get; set; }
    }

    public interface IDataSovereigntyService
    {
        /// <summary>Sectors treated as critical infrastructure under Proclamation 1426/2026 and
        /// therefore required to keep regulated data (PII, logs, audit trail) in-country.</summary>
        bool RequiresInCountryResidency(string? industry);

        /// <summary>Data classes a regulated tenant must have available in its assigned zone.</summary>
        string[] RegulatedDataClasses { get; }

        Task<DataSovereigntyOverviewResult> GetOverviewAsync();

        /// <summary>Returns tenants that are regulated but assigned to a non-compliant zone.</summary>
        Task<List<ResidencyTenantStatus>> GetNonCompliantTenantsAsync();
    }

    public class DataSovereigntyService : IDataSovereigntyService
    {
        private readonly WafDbContext _context;

        // The 12 critical-infrastructure sectors named in Proclamation 1426/2026 collapse, for our
        // purposes, to the industries the platform's Tenant.Industry field records.
        private static readonly string[] RegulatedIndustries =
        {
            "Banking", "Finance", "Government", "Telecom", "Insurance", "Healthcare",
            "ICT", "Transport", "Energy", "Water", "Education"
        };

        public string[] RegulatedDataClasses { get; } = { "PII", "Logs", "Audit" };

        public DataSovereigntyService(WafDbContext context)
        {
            _context = context;
        }

        public bool RequiresInCountryResidency(string? industry) =>
            RegulatedIndustries.Contains(industry ?? string.Empty, StringComparer.OrdinalIgnoreCase);

        public async Task<DataSovereigntyOverviewResult> GetOverviewAsync()
        {
            var zones = await _context.DataResidencyZones.IgnoreQueryFilters()
                .Where(z => z.IsActive)
                .OrderByDescending(z => z.IsInCountry).ThenBy(z => z.Name)
                .ToListAsync();
            var zonesByCode = zones.ToDictionary(z => z.Code, z => z);

            var tenants = await _context.Tenants.IgnoreQueryFilters()
                .Select(t => new { t.Id, t.Name, t.Industry, t.DataResidencyZoneCode, t.DataResidencyLastVerifiedAt })
                .ToListAsync();

            var tenantRows = tenants.Select(t =>
            {
                var zoneCode = string.IsNullOrEmpty(t.DataResidencyZoneCode) ? "ET-ADDIS-DC1" : t.DataResidencyZoneCode;
                zonesByCode.TryGetValue(zoneCode, out var zone);
                var isInCountry = zone?.IsInCountry ?? false;
                var requiresInCountry = RequiresInCountryResidency(t.Industry);
                var zoneClasses = (zone?.AllowedDataClasses ?? string.Empty)
                    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
                var hasRegulatedClasses = RegulatedDataClasses.All(c => zoneClasses.Contains(c, StringComparer.OrdinalIgnoreCase));

                return new ResidencyTenantStatus
                {
                    TenantId = t.Id,
                    TenantName = t.Name,
                    Industry = t.Industry,
                    ZoneCode = zoneCode,
                    ZoneName = zone?.Name ?? "Unknown Zone",
                    IsInCountry = isInCountry,
                    RequiresInCountry = requiresInCountry,
                    IsCompliant = !requiresInCountry || (isInCountry && hasRegulatedClasses),
                    LastVerifiedAt = t.DataResidencyLastVerifiedAt
                };
            }).ToList();

            return new DataSovereigntyOverviewResult
            {
                Zones = zones,
                Tenants = tenantRows.OrderByDescending(t => !t.IsCompliant).ThenBy(t => t.TenantName).ToList(),
                TotalTenants = tenantRows.Count,
                InCountryCount = tenantRows.Count(t => t.IsInCountry),
                RegulatedCount = tenantRows.Count(t => t.RequiresInCountry),
                NonCompliantCount = tenantRows.Count(t => !t.IsCompliant)
            };
        }

        public async Task<List<ResidencyTenantStatus>> GetNonCompliantTenantsAsync()
        {
            var overview = await GetOverviewAsync();
            return overview.Tenants.Where(t => !t.IsCompliant).ToList();
        }
    }
}

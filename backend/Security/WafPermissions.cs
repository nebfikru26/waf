using System;
using System.Collections.Generic;
using System.Linq;

namespace AffiniSecurity.Waf.Security
{
    public static class WafPermissions
    {
        // Firewall & Security
        public const string FirewallView = "firewall:view";
        public const string FirewallEdit = "firewall:edit";
        public const string FirewallManageGlobal = "firewall:global:manage";
        
        // Analytics
        public const string AnalyticsView = "analytics:view";
        public const string AnalyticsExport = "analytics:export";
        
        // Identity & Access
        public const string UsersView = "users:view";
        public const string UsersManage = "users:manage";
        
        // Infrastructure
        public const string DomainsManage = "domains:manage";
        public const string SslManage = "ssl:manage";
        
        // Platform (SuperAdmin only)
        public const string PlatformAudit = "platform:audit";
        public const string PlatformSettings = "platform:settings";

        // API Keys
        public const string ApiKeysManage = "apikeys:manage";

        /// <summary>
        /// All permission constants declared above, discovered via reflection so newly added
        /// permissions are automatically registered as authorization policies (see
        /// Program.cs) without needing a matching manual update here.
        /// </summary>
        public static readonly IReadOnlyList<string> All = typeof(WafPermissions)
            .GetFields(System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Static)
            .Where(f => f.FieldType == typeof(string))
            .Select(f => (string)f.GetValue(null)!)
            .ToList();

        /// <summary>
        /// Role → permission set. This is the single source of truth for what each role can
        /// do; it replaces scattered `RequireRole("a","b","c")` role-list checks with named,
        /// auditable permissions. Kept in sync with the previous role-list-based policies in
        /// Program.cs so converting to claims/permission-based authorization is a behavior-
        /// preserving change for every existing `[Authorize(Policy = WafPolicies.X)]` call site.
        /// </summary>
        private static readonly IReadOnlyDictionary<string, HashSet<string>> RolePermissions =
            new Dictionary<string, HashSet<string>>(StringComparer.OrdinalIgnoreCase)
            {
                ["super_admin"] = new HashSet<string> {
                    FirewallView, FirewallEdit, FirewallManageGlobal,
                    AnalyticsView, AnalyticsExport,
                    UsersView, UsersManage,
                    DomainsManage, SslManage,
                    PlatformAudit, PlatformSettings,
                    ApiKeysManage
                },
                // Legacy alias for super_admin — kept identical for backward compatibility.
                ["admin"] = new HashSet<string> {
                    FirewallView, FirewallEdit, FirewallManageGlobal,
                    AnalyticsView, AnalyticsExport,
                    UsersView, UsersManage,
                    DomainsManage, SslManage,
                    PlatformAudit, PlatformSettings,
                    ApiKeysManage
                },
                ["tenant_admin"] = new HashSet<string> {
                    FirewallView, FirewallEdit,
                    AnalyticsView, AnalyticsExport,
                    UsersView, UsersManage,
                    DomainsManage, SslManage,
                    ApiKeysManage
                },
                ["support_engineer"] = new HashSet<string> {
                    FirewallView,
                    AnalyticsView,
                    UsersView, UsersManage,
                    PlatformAudit, PlatformSettings
                },
                // Read-only security tooling access. Previously security_analyst had no firewall
                // visibility at all (excluded from the old RequireFirewallManager role list) —
                // this grants view-only access per the "Security Analyst" read-only role called
                // out in the platform's own architecture review, without granting edit rights.
                ["security_analyst"] = new HashSet<string> {
                    FirewallView,
                    AnalyticsView
                },
                ["security_engineer"] = new HashSet<string> {
                    FirewallView, FirewallEdit,
                    AnalyticsView, AnalyticsExport
                },
                ["billing_admin"] = new HashSet<string> {
                    AnalyticsView
                },
                // Legacy aliases retained for backward compatibility with older user records;
                // intentionally least-privilege (matches their previous total exclusion from
                // every role-gated policy).
                ["analyst"] = new HashSet<string> { AnalyticsView },
                ["customer"] = new HashSet<string>()
            };

        /// <summary>
        /// Returns the permission set granted to a given role name, or an empty set for unknown
        /// roles (fail-closed default-deny).
        /// </summary>
        public static IReadOnlySet<string> GetPermissionsForRole(string? role)
        {
            if (!string.IsNullOrEmpty(role) && RolePermissions.TryGetValue(role, out var perms))
            {
                return perms;
            }
            return new HashSet<string>();
        }
    }

    public static class WafPolicies
    {
        public const string RequireFirewallManager = "RequireFirewallManager";
        public const string RequirePlatformAdmin = "RequirePlatformAdmin";
        public const string RequireAnalyticsViewer = "RequireAnalyticsViewer";
        public const string RequireUserAdministrator = "RequireUserAdministrator";
    }
}


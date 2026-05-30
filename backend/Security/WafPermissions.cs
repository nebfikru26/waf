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
    }

    public static class WafPolicies
    {
        public const string RequireFirewallManager = "RequireFirewallManager";
        public const string RequirePlatformAdmin = "RequirePlatformAdmin";
        public const string RequireAnalyticsViewer = "RequireAnalyticsViewer";
    }
}

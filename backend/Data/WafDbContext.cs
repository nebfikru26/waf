using Microsoft.EntityFrameworkCore;
using AffiniSecurity.Waf.Models;
using AffiniSecurity.Waf.Services;
using System.Linq.Expressions;
using System.Reflection;
using System.Text.Json;
using System.Collections.Generic;

namespace AffiniSecurity.Waf.Data
{
    public class WafDbContext : DbContext
    {
        private readonly ITenantService _tenantService;

        public string? CurrentTenantId => _tenantService?.TenantId;

        public WafDbContext(DbContextOptions<WafDbContext> options, ITenantService tenantService = null) : base(options) 
        { 
            _tenantService = tenantService;
        }

        public DbSet<Tenant> Tenants { get; set; }
        public DbSet<User> Users { get; set; }
        public DbSet<Domain> Domains { get; set; }
        public DbSet<TrafficLog> TrafficLogs { get; set; }
        public DbSet<TopIP> TopIPs { get; set; }
        public DbSet<AlertLog> AlertLogs { get; set; }
        public DbSet<IPRule> IPRules { get; set; }
        public DbSet<OWASPRule> OWASPRules { get; set; }
        public DbSet<SystemConfig> SystemConfigs { get; set; }
        public DbSet<PlanConfig> PlanConfigs { get; set; }
        public DbSet<Subscription> Subscriptions { get; set; }
        public DbSet<SSLCertificate> SslCertificates { get; set; }
        public DbSet<TLSConfig> TlsConfigs { get; set; }
        public DbSet<APIEndpoint> ApiEndpoints { get; set; }
        public DbSet<SecuritySettings> SecuritySettings { get; set; }
        public DbSet<ATOConfig> AtoConfigs { get; set; }
        public DbSet<ATOEvent> AtoEvents { get; set; }
        public DbSet<RiskThreshold> RiskThresholds { get; set; }
        public DbSet<RiskEvent> RiskEvents { get; set; }
        public DbSet<CustomRule> CustomRules { get; set; }
        public DbSet<RuleVersion> RuleVersions { get; set; }
        public DbSet<URIExclusion> URIExclusions { get; set; }
        public DbSet<KnownBot> KnownBots { get; set; }
        public DbSet<BlockedFingerprint> BlockedFingerprints { get; set; }

        public DbSet<ServiceSubscription> ServiceSubscriptions { get; set; }
        public DbSet<PaymentInfo> PaymentInfos { get; set; }
        public DbSet<TenantMember> TenantMembers { get; set; }
        public DbSet<AuditLog> AuditLogs { get; set; }
        public DbSet<ApiKey> ApiKeys { get; set; }
        public DbSet<OWASPRuleExclusion> OWASPRuleExclusions { get; set; }
        public DbSet<IocIndicator> IocIndicators { get; set; }
        public DbSet<TenantRuleSet> TenantRuleSets { get; set; }
        public DbSet<RuleSetTemplate> RuleSetTemplates { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);
            
            // Add any additional configuration here
            modelBuilder.Entity<User>().HasIndex(u => u.Email).IsUnique();
            modelBuilder.Entity<User>().HasIndex(u => u.Phone).IsUnique();
            modelBuilder.Entity<Tenant>().HasIndex(t => t.Name).IsUnique();
            modelBuilder.Entity<Domain>().HasIndex(d => d.DomainName).IsUnique();
            modelBuilder.Entity<Domain>().HasIndex(d => d.OriginIp).IsUnique();
            modelBuilder.Entity<TLSConfig>().HasIndex(t => t.TenantId).IsUnique();
            modelBuilder.Entity<SecuritySettings>().HasIndex(s => s.TenantId).IsUnique();
            modelBuilder.Entity<ATOConfig>().HasIndex(a => a.TenantId).IsUnique();
            modelBuilder.Entity<RiskThreshold>().HasIndex(r => r.TenantId).IsUnique();
            modelBuilder.Entity<AuditLog>().HasIndex(a => a.TenantId);
            modelBuilder.Entity<AuditLog>().HasIndex(a => a.Timestamp);
            modelBuilder.Entity<ApiKey>().HasIndex(a => a.TenantId);
            modelBuilder.Entity<ApiKey>().HasIndex(a => a.KeyHash).IsUnique();

            // Automatically Apply Global Query Filter for TenantId
            foreach (var entityType in modelBuilder.Model.GetEntityTypes())
            {
                var property = entityType.FindProperty("TenantId");
                if (property != null && property.ClrType == typeof(string) && property.PropertyInfo != null)
                {
                    var method = SetGlobalQueryForEntityMethodInfo.MakeGenericMethod(entityType.ClrType);
                    method.Invoke(this, new object[] { modelBuilder });
                }
            }
        }

        private static readonly MethodInfo SetGlobalQueryForEntityMethodInfo = typeof(WafDbContext)
            .GetMethods(BindingFlags.NonPublic | BindingFlags.Instance)
            .Single(t => t.IsGenericMethod && t.Name == nameof(SetGlobalQueryForEntity));

        private void SetGlobalQueryForEntity<T>(ModelBuilder modelBuilder) where T : class
        {
            // STRICT ISOLATION: If CurrentTenantId is null, this will evaluate to e.TenantId == null, 
            // returning 0 tenant records, instead of bypassing the filter.
            modelBuilder.Entity<T>().HasQueryFilter(e => EF.Property<string>(e, "TenantId") == CurrentTenantId);
        }

        public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
        {
            var tenantId = CurrentTenantId;
            var userId = _tenantService?.UserId;
            var userEmail = _tenantService?.UserEmail;

            var auditEntries = new List<AuditLog>();

            foreach (var entry in ChangeTracker.Entries())
            {
                if (entry.Entity is AuditLog || entry.State == EntityState.Detached || entry.State == EntityState.Unchanged)
                {
                    continue;
                }

                // Auto-set TenantId for new entities
                if (entry.State == EntityState.Added && !string.IsNullOrEmpty(tenantId))
                {
                    var property = entry.Properties.FirstOrDefault(p => p.Metadata.Name == "TenantId");
                    if (property != null && property.Metadata.ClrType == typeof(string) && string.IsNullOrEmpty((string?)property.CurrentValue))
                    {
                        property.CurrentValue = tenantId;
                    }
                }

                // Generate Audit Log
                var auditLog = new AuditLog
                {
                    TenantId = tenantId,
                    UserId = userId,
                    UserEmail = userEmail,
                    EntityName = entry.Entity.GetType().Name,
                    IpAddress = _tenantService?.IpAddress,
                    RequestPath = _tenantService?.RequestPath,
                    RequestMethod = _tenantService?.RequestMethod,
                    Timestamp = DateTime.UtcNow
                };

                // Get EntityId if possible (usually "Id")
                var idProp = entry.Properties.FirstOrDefault(p => p.Metadata.Name == "Id");
                if (idProp != null && idProp.CurrentValue != null)
                {
                    auditLog.EntityId = idProp.CurrentValue.ToString() ?? "";
                }

                if (entry.State == EntityState.Added)
                {
                    auditLog.Action = "Created";
                    var newVals = new Dictionary<string, object?>();
                    foreach (var prop in entry.Properties) newVals[prop.Metadata.Name] = prop.CurrentValue;
                    auditLog.NewValues = JsonSerializer.Serialize(newVals);
                }
                else if (entry.State == EntityState.Deleted)
                {
                    auditLog.Action = "Deleted";
                    var oldVals = new Dictionary<string, object?>();
                    foreach (var prop in entry.Properties) oldVals[prop.Metadata.Name] = prop.OriginalValue;
                    auditLog.OldValues = JsonSerializer.Serialize(oldVals);
                }
                else if (entry.State == EntityState.Modified)
                {
                    auditLog.Action = "Modified";
                    var oldVals = new Dictionary<string, object?>();
                    var newVals = new Dictionary<string, object?>();
                    
                    foreach (var prop in entry.Properties.Where(x => x.IsModified))
                    {
                        oldVals[prop.Metadata.Name] = prop.OriginalValue;
                        newVals[prop.Metadata.Name] = prop.CurrentValue;
                    }
                    
                    // Only log if something actually changed
                    if (oldVals.Count > 0)
                    {
                        auditLog.OldValues = JsonSerializer.Serialize(oldVals);
                        auditLog.NewValues = JsonSerializer.Serialize(newVals);
                    }
                    else
                    {
                        continue;
                    }
                }

                auditEntries.Add(auditLog);
            }

            if (auditEntries.Count > 0)
            {
                AuditLogs.AddRange(auditEntries);
            }

            return base.SaveChangesAsync(cancellationToken);
        }
    }
}

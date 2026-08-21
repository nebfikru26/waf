using AffiniSecurity.Waf.Models;
using Microsoft.EntityFrameworkCore;
using BCrypt.Net;

namespace AffiniSecurity.Waf.Data
{
    public static class DbInitializer
    {
        public static void Initialize(WafDbContext context)
        {
            context.Database.EnsureCreated();

            // Manual Schema Updates (since EnsureCreated doesn't handle migrations for existing tables)
            try
            {
            try { context.Database.ExecuteSqlRaw("ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ip_address TEXT;"); } catch (Exception ex) { Console.WriteLine($"[DbInitializer] Failed: {ex.Message}"); }
            try { context.Database.ExecuteSqlRaw("ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS request_path TEXT;"); } catch (Exception ex) { Console.WriteLine($"[DbInitializer] Failed: {ex.Message}"); }
            try { context.Database.ExecuteSqlRaw("ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS request_method TEXT;"); } catch (Exception ex) { Console.WriteLine($"[DbInitializer] Failed: {ex.Message}"); }
            try { context.Database.ExecuteSqlRaw("ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS hash_chain TEXT;"); } catch (Exception ex) { Console.WriteLine($"[DbInitializer] Failed: {ex.Message}"); }
            try { context.Database.ExecuteSqlRaw("ALTER TABLE alert_logs ADD COLUMN IF NOT EXISTS raw_data TEXT;"); } catch (Exception ex) { Console.WriteLine($"[DbInitializer] Failed: {ex.Message}"); }
            try { context.Database.ExecuteSqlRaw("ALTER TABLE system_configs ADD COLUMN IF NOT EXISTS crs_rules_repository_url TEXT;"); } catch (Exception ex) { Console.WriteLine($"[DbInitializer] Failed: {ex.Message}"); }
            try { context.Database.ExecuteSqlRaw("ALTER TABLE system_configs ADD COLUMN IF NOT EXISTS eca_certification_number TEXT;"); } catch (Exception ex) { Console.WriteLine($"[DbInitializer] Failed: {ex.Message}"); }
            try { context.Database.ExecuteSqlRaw("ALTER TABLE owasp_rules ADD COLUMN IF NOT EXISTS \"ImportedAt\" timestamp with time zone;"); } catch (Exception ex) { Console.WriteLine($"[DbInitializer] Failed: {ex.Message}"); }
            try { context.Database.ExecuteSqlRaw("ALTER TABLE owasp_rules ADD COLUMN IF NOT EXISTS \"VersionTag\" text;"); } catch (Exception ex) { Console.WriteLine($"[DbInitializer] Failed: {ex.Message}"); }
            try { context.Database.ExecuteSqlRaw("UPDATE owasp_rules SET \"ImportedAt\" = NOW() WHERE \"ImportedAt\" IS NULL;"); } catch (Exception ex) { Console.WriteLine($"[DbInitializer] Failed: {ex.Message}"); }
            try { context.Database.ExecuteSqlRaw("ALTER TABLE owasp_rules ADD COLUMN IF NOT EXISTS \"MitreTechnique\" text;"); } catch (Exception ex) { Console.WriteLine($"[DbInitializer] Failed: {ex.Message}"); }
            try { context.Database.ExecuteSqlRaw("ALTER TABLE owasp_rules ADD COLUMN IF NOT EXISTS \"MitreTactic\" text;"); } catch (Exception ex) { Console.WriteLine($"[DbInitializer] Failed: {ex.Message}"); }
            try { context.Database.ExecuteSqlRaw("ALTER TABLE custom_rules ADD COLUMN IF NOT EXISTS \"MitreTechnique\" text;"); } catch (Exception ex) { Console.WriteLine($"[DbInitializer] Failed: {ex.Message}"); }
            try { context.Database.ExecuteSqlRaw("ALTER TABLE custom_rules ADD COLUMN IF NOT EXISTS \"MitreTactic\" text;"); } catch (Exception ex) { Console.WriteLine($"[DbInitializer] Failed: {ex.Message}"); }
            try { context.Database.ExecuteSqlRaw("ALTER TABLE alert_logs ADD COLUMN IF NOT EXISTS \"MitreTechnique\" text;"); } catch (Exception ex) { Console.WriteLine($"[DbInitializer] Failed: {ex.Message}"); }
            try { context.Database.ExecuteSqlRaw("ALTER TABLE alert_logs ADD COLUMN IF NOT EXISTS \"MitreTactic\" text;"); } catch (Exception ex) { Console.WriteLine($"[DbInitializer] Failed: {ex.Message}"); }
            try { context.Database.ExecuteSqlRaw("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS \"OnboardingStep\" INTEGER DEFAULT 0;"); } catch (Exception ex) { Console.WriteLine($"[DbInitializer] Failed: {ex.Message}"); }
            try { context.Database.ExecuteSqlRaw("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS \"IsActive\" BOOLEAN DEFAULT TRUE;"); } catch (Exception ex) { Console.WriteLine($"[DbInitializer] Failed: {ex.Message}"); }

            try { context.Database.ExecuteSqlRaw(@"
                CREATE TABLE IF NOT EXISTS ioc_indicators (
                    ""Id"" TEXT PRIMARY KEY,
                    ""IndicatorValue"" TEXT NOT NULL,
                    ""IndicatorType"" TEXT NOT NULL,
                    ""PulseName"" TEXT,
                    ""ThreatType"" TEXT,
                    ""Severity"" TEXT NOT NULL DEFAULT 'MEDIUM',
                    ""Source"" TEXT NOT NULL DEFAULT 'AlienVault-OTX',
                    ""Country"" TEXT,
                    ""ExternalId"" TEXT,
                    ""ExternalLink"" TEXT,
                    ""ConfidenceScore"" INTEGER NOT NULL DEFAULT 50,
                    ""FirstSeen"" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                    ""LastSeen"" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                    ""IngestedAt"" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_ioc_indicator_value ON ioc_indicators (""IndicatorValue"");
                CREATE INDEX IF NOT EXISTS idx_ioc_indicator_type ON ioc_indicators (""IndicatorType"");
                CREATE INDEX IF NOT EXISTS idx_ioc_severity ON ioc_indicators (""Severity"");
            "); } catch (Exception ex) { Console.WriteLine($"[DbInitializer] IOC table creation failed: {ex.Message}"); }

            try { context.Database.ExecuteSqlRaw(@"
                CREATE TABLE IF NOT EXISTS tenant_rule_sets (
                    ""Id"" TEXT PRIMARY KEY,
                    ""TenantId"" TEXT NOT NULL,
                    ""Name"" TEXT NOT NULL,
                    ""Description"" TEXT,
                    ""RuleIds"" TEXT,
                    ""DisabledRuleIds"" TEXT,
                    ""SourceTemplateId"" TEXT,
                    ""CreatedAt"" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                    ""UpdatedAt"" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_tenant_rule_sets_tenant_id ON tenant_rule_sets (""TenantId"");

                CREATE TABLE IF NOT EXISTS rule_set_templates (
                    ""Id"" TEXT PRIMARY KEY,
                    ""Name"" TEXT NOT NULL,
                    ""Description"" TEXT,
                    ""Category"" TEXT,
                    ""RuleCategories"" TEXT,
                    ""IsBuiltIn"" BOOLEAN DEFAULT TRUE,
                    ""CreatedAt"" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
                );

                CREATE TABLE IF NOT EXISTS payment_infos (
                    ""Id"" TEXT PRIMARY KEY,
                    ""TenantId"" TEXT NOT NULL,
                    ""Plan"" TEXT NOT NULL,
                    ""Amount"" NUMERIC NOT NULL,
                    ""NextPaymentDate"" TIMESTAMP WITH TIME ZONE NOT NULL,
                    ""Status"" TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_payment_infos_tenant_id ON payment_infos (""TenantId"");

                CREATE TABLE IF NOT EXISTS tenant_members (
                    ""Id"" TEXT PRIMARY KEY,
                    ""TenantId"" TEXT NOT NULL,
                    ""Email"" TEXT NOT NULL,
                    ""Role"" TEXT NOT NULL,
                    ""JoinedAt"" TIMESTAMP WITH TIME ZONE NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_tenant_members_tenant_id ON tenant_members (""TenantId"");

                CREATE TABLE IF NOT EXISTS service_subscriptions (
                    ""Id"" TEXT PRIMARY KEY,
                    ""TenantId"" TEXT NOT NULL,
                    ""ServiceName"" TEXT NOT NULL,
                    ""SubscribedAt"" TIMESTAMP WITH TIME ZONE NOT NULL,
                    ""Expiration"" TIMESTAMP WITH TIME ZONE
                );
                CREATE INDEX IF NOT EXISTS idx_service_subscriptions_tenant_id ON service_subscriptions (""TenantId"");
            "); } catch (Exception ex) { Console.WriteLine($"[DbInitializer] Tenant management tables creation failed: {ex.Message}"); }

            // Data Sovereignty: per-tenant residency zone + inspectable assignment history
            try { context.Database.ExecuteSqlRaw("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS \"DataResidencyZoneCode\" TEXT DEFAULT 'ET-ADDIS-DC1';"); } catch (Exception ex) { Console.WriteLine($"[DbInitializer] Failed: {ex.Message}"); }
            try { context.Database.ExecuteSqlRaw("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS \"RequiresInCountryResidency\" BOOLEAN DEFAULT FALSE;"); } catch (Exception ex) { Console.WriteLine($"[DbInitializer] Failed: {ex.Message}"); }
            try { context.Database.ExecuteSqlRaw("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS \"DataResidencyLastVerifiedAt\" TIMESTAMP WITH TIME ZONE;"); } catch (Exception ex) { Console.WriteLine($"[DbInitializer] Failed: {ex.Message}"); }

            try { context.Database.ExecuteSqlRaw(@"
                CREATE TABLE IF NOT EXISTS data_residency_zones (
                    ""Id"" TEXT PRIMARY KEY,
                    ""Code"" TEXT NOT NULL UNIQUE,
                    ""Name"" TEXT NOT NULL,
                    ""CountryCode"" TEXT NOT NULL DEFAULT 'ET',
                    ""FacilityProvider"" TEXT,
                    ""IsInCountry"" BOOLEAN NOT NULL DEFAULT TRUE,
                    ""IsDefault"" BOOLEAN NOT NULL DEFAULT FALSE,
                    ""IsActive"" BOOLEAN NOT NULL DEFAULT TRUE,
                    ""CreatedAt"" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
                );

                CREATE TABLE IF NOT EXISTS data_residency_assignments (
                    ""Id"" TEXT PRIMARY KEY,
                    ""TenantId"" TEXT NOT NULL,
                    ""ZoneCode"" TEXT NOT NULL,
                    ""PreviousZoneCode"" TEXT,
                    ""Reason"" TEXT,
                    ""ChangedByEmail"" TEXT,
                    ""ChangedAt"" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_data_residency_assignments_tenant_id ON data_residency_assignments (""TenantId"");
            "); } catch (Exception ex) { Console.WriteLine($"[DbInitializer] Data sovereignty tables creation failed: {ex.Message}"); }

            // Data class enforcement: what categories of data each zone may legally hold
            try { context.Database.ExecuteSqlRaw("ALTER TABLE data_residency_zones ADD COLUMN IF NOT EXISTS \"AllowedDataClasses\" TEXT DEFAULT 'PII,Logs,Audit,Static,Cache';"); } catch (Exception ex) { Console.WriteLine($"[DbInitializer] Failed: {ex.Message}"); }

            // Governance tables: processing register (DPIA), incident reporting clocks, key custody
            try { context.Database.ExecuteSqlRaw(@"
                CREATE TABLE IF NOT EXISTS data_processing_records (
                    ""Id"" TEXT PRIMARY KEY,
                    ""TenantId"" TEXT NOT NULL,
                    ""Purpose"" TEXT NOT NULL,
                    ""DataCategories"" TEXT NOT NULL DEFAULT '',
                    ""LegalBasis"" TEXT NOT NULL DEFAULT 'Contract',
                    ""RetentionPeriod"" TEXT NOT NULL DEFAULT '365 Days',
                    ""SubProcessors"" TEXT,
                    ""DpiaRequired"" BOOLEAN NOT NULL DEFAULT FALSE,
                    ""DpiaCompletedAt"" TIMESTAMP WITH TIME ZONE,
                    ""DpiaSummary"" TEXT,
                    ""CreatedAt"" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                    ""UpdatedAt"" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_data_processing_records_tenant_id ON data_processing_records (""TenantId"");

                CREATE TABLE IF NOT EXISTS incident_clocks (
                    ""Id"" TEXT PRIMARY KEY,
                    ""TenantId"" TEXT NOT NULL,
                    ""AlertLogId"" TEXT,
                    ""Title"" TEXT NOT NULL,
                    ""Severity"" TEXT NOT NULL DEFAULT 'HIGH',
                    ""DetectedAt"" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                    ""CertDeadline"" TIMESTAMP WITH TIME ZONE NOT NULL,
                    ""BreachDeadline"" TIMESTAMP WITH TIME ZONE NOT NULL,
                    ""ReportedToCertAt"" TIMESTAMP WITH TIME ZONE,
                    ""ReportedByCertEmail"" TEXT,
                    ""ReportedAsBreachAt"" TIMESTAMP WITH TIME ZONE,
                    ""ReportedByBreachEmail"" TEXT,
                    ""Status"" TEXT NOT NULL DEFAULT 'Open',
                    ""Notes"" TEXT,
                    ""ResolvedAt"" TIMESTAMP WITH TIME ZONE
                );
                CREATE INDEX IF NOT EXISTS idx_incident_clocks_tenant_id ON incident_clocks (""TenantId"");
                CREATE INDEX IF NOT EXISTS idx_incident_clocks_status ON incident_clocks (""Status"");

                CREATE TABLE IF NOT EXISTS key_custody_records (
                    ""Id"" TEXT PRIMARY KEY,
                    ""TenantId"" TEXT,
                    ""Scope"" TEXT NOT NULL,
                    ""KeyManagementSystem"" TEXT NOT NULL,
                    ""IsInCountry"" BOOLEAN NOT NULL DEFAULT TRUE,
                    ""Custodian"" TEXT,
                    ""LastRotatedAt"" TIMESTAMP WITH TIME ZONE,
                    ""VerifiedAt"" TIMESTAMP WITH TIME ZONE,
                    ""CreatedAt"" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
                );
            "); } catch (Exception ex) { Console.WriteLine($"[DbInitializer] Governance tables creation failed: {ex.Message}"); }

            // Seed the known Ethiopian + fallback residency zones once
            if (!context.DataResidencyZones.Any())
            {
                context.DataResidencyZones.AddRange(new List<DataResidencyZone>
                {
                    new DataResidencyZone { Code = "ET-ADDIS-DC1", Name = "Addis Ababa Primary DC (INSA-audited)", CountryCode = "ET", FacilityProvider = "ethio telecom / Local Colocation", IsInCountry = true, IsDefault = true, AllowedDataClasses = "PII,Logs,Audit,Static,Cache" },
                    new DataResidencyZone { Code = "ET-ADDIS-DC2", Name = "Addis Ababa Secondary DC (DR Site)", CountryCode = "ET", FacilityProvider = "Local Colocation", IsInCountry = true, IsDefault = false, AllowedDataClasses = "PII,Logs,Audit,Static,Cache" },
                    new DataResidencyZone { Code = "GLOBAL-EDGE", Name = "Global CDN Edge (Cache/Static Only — No PII)", CountryCode = "GLOBAL", FacilityProvider = "Multi-Region Edge", IsInCountry = false, IsDefault = false, AllowedDataClasses = "Static,Cache" },
                });
                context.SaveChanges();
            }
            else
            {
                // Correct the global edge zone's allowed classes even if it was seeded by an older version
                try { context.Database.ExecuteSqlRaw("UPDATE data_residency_zones SET \"AllowedDataClasses\" = 'Static,Cache' WHERE \"Code\" = 'GLOBAL-EDGE' AND (\"AllowedDataClasses\" IS NULL OR \"AllowedDataClasses\" LIKE '%PII%');"); } catch { }
            }

            // Seed baseline key custody records (platform-wide) so the sovereignty dashboard has data on first boot
            if (!context.KeyCustodyRecords.Any())
            {
                context.KeyCustodyRecords.AddRange(new List<KeyCustodyRecord>
                {
                    new KeyCustodyRecord { Scope = "DatabaseAtRest", KeyManagementSystem = "Local Vault - Addis Ababa DC1", IsInCountry = true, Custodian = "Platform Security Team" },
                    new KeyCustodyRecord { Scope = "AuditChainSecret", KeyManagementSystem = "Local Vault - Addis Ababa DC1", IsInCountry = true, Custodian = "Platform Security Team" },
                    new KeyCustodyRecord { Scope = "TLS", KeyManagementSystem = "Let's Encrypt / cert-manager (local issuance)", IsInCountry = true, Custodian = "Platform Security Team" },
                });
                context.SaveChanges();
            }

            // Seed Templates if empty
            if (!context.RuleSetTemplates.Any())
            {
                context.RuleSetTemplates.AddRange(new List<RuleSetTemplate>
                {
                    new RuleSetTemplate { 
                        Name = "Finance / Banking", 
                        Description = "High Compliance: Strict SQLi/XSS, Mandatory MFA signaling, Rate-limiting.",
                        Category = "Finance",
                        RuleCategories = "SQL Injection,Cross-Site Scripting,Request Limits,Protocol Enforcement",
                        IsBuiltIn = true
                    },
                    new RuleSetTemplate { 
                        Name = "E-Commerce", 
                        Description = "Transaction Security: Bot protection, Scraping prevention, Payment endpoint hardening.",
                        Category = "E-Commerce",
                        RuleCategories = "SQL Injection,Cross-Site Scripting,Scanner Detection,Data Leakage",
                        IsBuiltIn = true
                    },
                    new RuleSetTemplate { 
                        Name = "RESTful API", 
                        Description = "Payload Integrity: JSON/XML schema validation, Bearer token inspection, Method restriction.",
                        Category = "API",
                        RuleCategories = "SQL Injection,Protocol Enforcement,Request Limits,Java Injection",
                        IsBuiltIn = true
                    },
                    new RuleSetTemplate { 
                        Name = "WordPress / CMS", 
                        Description = "Application Specific: Hardened /wp-admin protection, Plugin vulnerability virtual patching.",
                        Category = "CMS",
                        RuleCategories = "PHP Injection,Local File Inclusion,Scanner Detection,Remote File Inclusion",
                        IsBuiltIn = true
                    },
                    new RuleSetTemplate { 
                        Name = "General Purpose", 
                        Description = "Balanced Security: OWASP Top 10 defaults with low false-positive sensitivity.",
                        Category = "General",
                        RuleCategories = "SQL Injection,Cross-Site Scripting,Scanner Detection,Protocol Enforcement,Request Limits",
                        IsBuiltIn = true
                    }
                });
                context.SaveChanges();
            }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DbInitializer] Failed to apply schema update: {ex.Message}");
            }

            ApplyRowLevelSecurity(context);

            // Seed or Update Plans
            UpdateOrCreatePlan(context, new PlanConfig
            {
                Name = "Free",
                PriceEtb = 0,
                MaxDomains = 1,
                HasWafDetection = true,
                HasAnalytics = true,
                HasThreatIntel = true
            });

            UpdateOrCreatePlan(context, new PlanConfig
            {
                Name = "Professional",
                PriceEtb = 99,
                MaxDomains = 10,
                HasWafDetection = true,
                HasWafBlocking = true,
                HasRateLimiting = true,
                HasAnalytics = true,
                HasBotProtection = true,
                HasAttackLogs = true,
                HasSslManagement = true,
                HasThreatIntel = true
            });

            UpdateOrCreatePlan(context, new PlanConfig
            {
                Name = "Enterprise",
                PriceEtb = 999,
                MaxDomains = 100,
                HasWafDetection = true,
                HasWafBlocking = true,
                HasAnalytics = true,
                HasBotProtection = true,
                HasDdosProtection = true,
                HasAccountTakeover = true,
                HasApiProtection = true,
                HasRateLimiting = true,
                HasSslManagement = true,
                HasThreatIntel = true,
                HasAttackLogs = true,
                HasNotifications = true
            });

            // Seed System Tenant & User if missing
            var systemTenant = context.Tenants.IgnoreQueryFilters().FirstOrDefault(t => t.Name == "AffiniSecurity Global");
            if (systemTenant == null)
            {
                systemTenant = new Tenant
                {
                    Name = "AffiniSecurity Global",
                    LegalName = "AffiniSecurity Systems Ltd",
                    Manager = "System Admin",
                    LicenseNo = "SYSTEM-001",
                    TinNo = "000000000",
                    Address = "Global Operations",
                    Industry = "Security",
                    Category = "Provider",
                    ContactPhone = "+1000000000",
                    ContactEmail = "admin@affinisecurity.io",
                    ContactPerson = "Admin",
                    Website = "https://affinisecurity.io",
                    IsProfileComplete = true,
                    LogoUrl = "/uploads/logos/affinisecurity_main.png",
                    PrimaryColor = "#1e40af",
                    BrandName = "AffiniSecurity"
                };
                context.Tenants.Add(systemTenant);
                context.SaveChanges();
            }
            else 
            {
                systemTenant.LogoUrl = "/uploads/logos/affinisecurity_main.png";
                systemTenant.PrimaryColor = "#1e40af";
                systemTenant.BrandName = "AffiniSecurity";
            }

            var adminUser = context.Users.IgnoreQueryFilters().FirstOrDefault(u => u.Email == "admin@affinisecurity.io");
            if (adminUser == null)
            {
                adminUser = new User
                {
                    Email = "admin@affinisecurity.io",
                    Name = "System Administrator",
                    Phone = "+1000000000",
                    JobTitle = "Security Administrator",
                    Bio = "System generated administrator account",
                    // Static pre-computed BCrypt hash for "Password123!" — deterministic across restarts
                    Password = "$2a$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi",
                    Role = "super_admin",
                    TenantId = systemTenant.Id
                };
                context.Users.Add(adminUser);
            }
            context.SaveChanges();

            // Seed Sample Tenants - upsert by name so new orgs can be added without a DB reset
            var sampleTenantDefs = new List<(string Name, string LegalName, string Industry, string Manager, string Email, string Phone, string Address, string Website, bool ProfileComplete, int OnboardingStep, bool IsActive)>
            {
                ("Neb Global Solutions", "Neb Global Solutions PLC", "Software", "Neb Fikru", "nebfikru@gmail.com", "+251911001122", "Addis Ababa, Piazza", "https://nebfikru.com", true, 5, true),
                ("EthioMarket", "EthioMarket E-Commerce PLC", "E-Commerce", "Abebe Bikila", "admin@ethiomarket.com", "+251911223344", "Addis Ababa, Bole", "https://ethiomarket.com", true, 5, true),
                ("ShebaTech", "Sheba Technology Solutions", "Technology", "Selamawit Yilma", "ops@shebatech.io", "+251922334455", "Addis Ababa, Kazanchis", "https://shebatech.io", true, 5, true),
                ("BlueNile Bank", "Blue Nile Microfinance", "Finance", "Kebede Kassaye", "security@bluenile.et", "+251933445566", "Bahir Dar, Nile St", "https://bluenile.et", false, 2, true),
                ("Habesha Logistics", "Habesha Freight & Logistics PLC", "Logistics", "Tewodros Haile", "admin@habeshalogistics.com", "+251944556677", "Addis Ababa, Lebu", "https://habeshalogistics.com", true, 5, true),
                ("Aksum Insurance", "Aksum General Insurance S.C", "Finance", "Hirut Bekele", "cto@aksumins.et", "+251955667788", "Axum, Tigray", "https://aksumins.et", true, 5, true),
                ("AddisHealth", "AddisHealth Medical Systems PLC", "Healthcare", "Dr. Meron Alemu", "it@addishealth.com", "+251966778899", "Addis Ababa, Lideta", "https://addishealth.com", true, 5, true),
                ("GreenEthiopia Agri", "Green Ethiopia Agricultural PLC", "Agriculture", "Dawit Tesfaye", "security@greenethiopia.com", "+251977889900", "Jimma, Oromia", "https://greenethiopia.com", true, 5, true),
                ("TeleConnect ET", "TeleConnect Telecom Solutions PLC", "Telecommunications", "Samuel Girma", "noc@teleconnect.et", "+251988990011", "Addis Ababa, Megenagna", "https://teleconnect.et", true, 5, true),
                ("Awash Media Group", "Awash Digital Media Group PLC", "Media", "Yonas Tadesse", "tech@awashmedia.com", "+251999001122", "Addis Ababa, Arat Kilo", "https://awashmedia.com", false, 1, true),
                ("EduEthio Platform", "EduEthio Learning Technologies PLC", "Education", "Bethlehem Mulugeta", "admin@eduethio.com", "+251900112233", "Addis Ababa, CMC", "https://eduethio.com", true, 5, true),
                ("Rift Valley Hotels", "Rift Valley Hospitality Group S.C", "Hospitality", "Liya Tsegay", "it@riftvalleyhotels.com", "+251901223344", "Hawassa, SNNPR", "https://riftvalleyhotels.com", true, 5, false),
            };

            var enterpriseIndustries = new HashSet<string> { "Finance", "Telecommunications", "Healthcare" };

            foreach (var def in sampleTenantDefs)
            {
                // Fix the first legacy tenant's ID for stability
                var existingByEmail = context.Users.IgnoreQueryFilters().FirstOrDefault(u => u.Email == def.Email);
                if (existingByEmail != null) continue; // Already seeded, skip

                var tenant = context.Tenants.IgnoreQueryFilters().FirstOrDefault(t => t.Name == def.Name);
                if (tenant == null)
                {
                    // Special-case the first tenant to keep its known ID
                    var tenantId = def.Name == "Neb Global Solutions" ? "eb880aa3-c981-419f-b0f4-4d9e511788dc" : Guid.NewGuid().ToString();
                    tenant = new Tenant
                    {
                        Id = tenantId,
                        Name = def.Name,
                        LegalName = def.LegalName,
                        Industry = def.Industry,
                        Manager = def.Manager,
                        ContactEmail = def.Email,
                        ContactPhone = def.Phone,
                        Address = def.Address,
                        Website = def.Website,
                        IsProfileComplete = def.ProfileComplete,
                        OnboardingStep = def.OnboardingStep,
                        IsActive = def.IsActive
                    };
                    context.Tenants.Add(tenant);
                    context.SaveChanges();

                    context.Users.Add(new User
                    {
                        Email = def.Email,
                        Name = def.Manager,
                        Password = "$2a$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi",
                        Role = "tenant_admin",
                        TenantId = tenant.Id
                    });

                    context.Subscriptions.Add(new Subscription
                    {
                        TenantId = tenant.Id,
                        PlanName = enterpriseIndustries.Contains(def.Industry) ? "Enterprise" : "Professional",
                        Status = def.IsActive ? "active" : "suspended",
                        CreatedAt = DateTime.UtcNow.AddDays(-new Random().Next(30, 540))
                    });

                    context.SaveChanges();
                }
            }

            context.SaveChanges();

            try
            {
                if (!context.Domains.IgnoreQueryFilters().Any(d => d.DomainName == "localhost"))
                {
                    var localDomain = new Domain
                    {
                        DomainName = "localhost",
                        OriginIp = "host.docker.internal:5173",
                        TenantId = systemTenant.Id,
                        Status = "active",
                        SslMode = "Off",
                        SslProvisioned = false,
                        DnsVerified = true,
                        ProtectionMode = "prevention",
                        Sensitivity = 1,
                        CreatedAt = DateTime.UtcNow
                    };
                    context.Domains.Add(localDomain);
                    context.SaveChanges();
                    Console.WriteLine("[DbInitializer] Localhost domain seeded.");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DbInitializer] Seed Domains Failed: {ex.Message}");
            }

            // Ensure default security settings for system tenant exist
            var settings = context.SecuritySettings.IgnoreQueryFilters().FirstOrDefault(s => s.TenantId == systemTenant.Id);
            if (settings == null)
            {
                settings = new SecuritySettings
                {
                    TenantId = systemTenant.Id,
                    BotProtectionEnabled = true,
                    SensitivityLevel = "high"
                };
                context.SecuritySettings.Add(settings);
            }
            else
            {
                settings.BotProtectionEnabled = true;
                settings.SensitivityLevel = "high";
            }

            // Seed KnownBots if empty
            if (!context.KnownBots.Any())
            {
                context.KnownBots.AddRange(new List<KnownBot>
                {
                    new KnownBot { Name = "Googlebot", UserAgentPattern = "Googlebot", Action = "allow", Category = "Search Engine", IsVerified = true },
                    new KnownBot { Name = "Bingbot", UserAgentPattern = "Bingbot", Action = "allow", Category = "Search Engine", IsVerified = true },
                    new KnownBot { Name = "UptimeRobot", UserAgentPattern = "UptimeRobot", Action = "allow", Category = "Monitoring", IsVerified = true },
                    new KnownBot { Name = "SEMrushBot", UserAgentPattern = "SEMrushBot", Action = "challenge", Category = "SEO Tool", IsVerified = true },
                    new KnownBot { Name = "AhrefsBot", UserAgentPattern = "AhrefsBot", Action = "challenge", Category = "SEO Tool", IsVerified = true },
                    new KnownBot { Name = "MJ12bot", UserAgentPattern = "MJ12bot", Action = "block", Category = "Scraper", IsVerified = true },
                    new KnownBot { Name = "DotBot", UserAgentPattern = "DotBot", Action = "block", Category = "Scraper", IsVerified = true },
                    new KnownBot { Name = "PetalBot", UserAgentPattern = "PetalBot", Action = "challenge", Category = "Search Engine", IsVerified = true }
                });
            }

            if (!context.BlockedFingerprints.IgnoreQueryFilters().Any())
            {
                context.BlockedFingerprints.AddRange(new List<BlockedFingerprint>
                {
                    new BlockedFingerprint { Fingerprint = "e7f7069815fd447072c2111e2b313c17", Type = "JA3", Description = "Python Requests (Malicious Scraper)", IsGlobal = true },
                    new BlockedFingerprint { Fingerprint = "3b5056495484a0a4a4918641b63cccae", Type = "JA3", Description = "Go-HTTP-Client (Automated Script)", IsGlobal = true },
                    new BlockedFingerprint { Fingerprint = "70b9910d9082f0c7847702f2603f9011", Type = "JA3", Description = "Scrapy Framework", IsGlobal = true }
                });
            }

            // Seed SystemConfig if empty
            if (!context.SystemConfigs.Any())
            {
                context.SystemConfigs.Add(new SystemConfig
                {
                    SalesContactEmail = "sales@affinisecurity.io",
                    SalesContactPhone = "+251 911 000 000",
                    SupportEmail = "support@affinisecurity.io",
                    CrsRulesRepositoryUrl = "https://github.com/coreruleset/coreruleset/archive/refs/heads/main.zip",
                    EcaCertificationNumber = "UNREGISTERED"
                });
            }

            // Seed OWASP CRS Rules if table is empty
            if (!context.OWASPRules.Any())
            {
                context.OWASPRules.AddRange(new List<OWASPRule>
                {
                    // ── Protocol Enforcement (9001xx) ──────────────────────────────────────
                    new OWASPRule { Id = "900110", RuleId = "900110", Name = "Request Without Host Header", Category = "Protocol Enforcement", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects HTTP/1.1 requests missing a Host header, a common sign of malformed or automated requests." },
                    new OWASPRule { Id = "900120", RuleId = "900120", Name = "Invalid Content-Type Header", Category = "Protocol Enforcement", Severity = "WARNING", Action = "BLOCK", Description = "Rejects requests carrying a Content-Type that is not recognized by the application." },
                    new OWASPRule { Id = "900130", RuleId = "900130", Name = "Content-Length Required for POST", Category = "Protocol Enforcement", Severity = "WARNING", Action = "BLOCK", Description = "Ensures POST/PUT requests include a Content-Length or Transfer-Encoding header." },
                    new OWASPRule { Id = "900170", RuleId = "900170", Name = "Transfer-Encoding Header Abuse", Category = "Protocol Enforcement", Severity = "CRITICAL", Action = "BLOCK", Description = "Blocks malformed Transfer-Encoding headers used in HTTP request smuggling attacks." },
                    new OWASPRule { Id = "900200", RuleId = "900200", Name = "HTTP Request Smuggling", Category = "Protocol Enforcement", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects conflicting Content-Length and Transfer-Encoding headers indicative of request smuggling." },

                    // ── Scanner / Recon Detection (913xxx) ────────────────────────────────
                    new OWASPRule { Id = "913100", RuleId = "913100", Name = "Security Scanner User-Agent", Category = "Scanner Detection", Severity = "WARNING", Action = "BLOCK", Description = "Identifies known security scanners (Nessus, Nikto, OpenVAS, etc.) via User-Agent strings." },
                    new OWASPRule { Id = "913101", RuleId = "913101", Name = "Scripting/Generic HTTP Client", Category = "Scanner Detection", Severity = "WARNING", Action = "BLOCK", Description = "Detects scripting clients (curl, python-requests, libwww-perl) often used for automation." },
                    new OWASPRule { Id = "913102", RuleId = "913102", Name = "Web Crawler / Bot User-Agent", Category = "Scanner Detection", Severity = "WARNING", Action = "LOG", Description = "Identifies web crawlers and archiving bots that may harvest sensitive data." },
                    new OWASPRule { Id = "913110", RuleId = "913110", Name = "Known Malicious Request Header", Category = "Scanner Detection", Severity = "ERROR", Action = "BLOCK", Description = "Blocks requests containing headers used exclusively by attack tools." },
                    new OWASPRule { Id = "913120", RuleId = "913120", Name = "Known Attack File/Argument Name", Category = "Scanner Detection", Severity = "ERROR", Action = "BLOCK", Description = "Detects filenames and query parameter names commonly used in proof-of-concept exploits." },

                    // ── Request Limits (920xxx) ────────────────────────────────────────────
                    new OWASPRule { Id = "920100", RuleId = "920100", Name = "Invalid HTTP Request Line", Category = "Request Limits", Severity = "ERROR", Action = "BLOCK", Description = "Rejects HTTP requests with a malformed request line that doesn't follow RFC 7230." },
                    new OWASPRule { Id = "920120", RuleId = "920120", Name = "Multipart Bypass Attempt", Category = "Request Limits", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects multipart/form-data requests crafted to bypass WAF inspection." },
                    new OWASPRule { Id = "920160", RuleId = "920160", Name = "Content-Length Not Numeric", Category = "Request Limits", Severity = "ERROR", Action = "BLOCK", Description = "Ensures the Content-Length header contains only numeric characters." },
                    new OWASPRule { Id = "920170", RuleId = "920170", Name = "GET/HEAD With Body Content", Category = "Request Limits", Severity = "ERROR", Action = "BLOCK", Description = "Blocks GET and HEAD requests that contain a request body." },
                    new OWASPRule { Id = "920180", RuleId = "920180", Name = "POST Without Content-Length", Category = "Request Limits", Severity = "WARNING", Action = "BLOCK", Description = "Requires POST requests to provide a Content-Length or Transfer-Encoding header." },
                    new OWASPRule { Id = "920190", RuleId = "920190", Name = "Range Header with Illegal Value", Category = "Request Limits", Severity = "ERROR", Action = "BLOCK", Description = "Detects malformed Range header values used in bandwidth exhaustion attacks." },
                    new OWASPRule { Id = "920210", RuleId = "920210", Name = "Multiple / Conflicting Connection Headers", Category = "Request Limits", Severity = "ERROR", Action = "BLOCK", Description = "Flags requests with more than one Connection header or illegal keep-alive abuse." },
                    new OWASPRule { Id = "920230", RuleId = "920230", Name = "Multiple URL Encoding Detected", Category = "Request Limits", Severity = "ERROR", Action = "BLOCK", Description = "Flags double or multiple URL-encoding used to bypass signature-based inspection." },
                    new OWASPRule { Id = "920240", RuleId = "920240", Name = "URL Encoding Abuse in Content-Type", Category = "Request Limits", Severity = "ERROR", Action = "BLOCK", Description = "Detects URL encoding in the Content-Type header, a technique used to evade inspection." },
                    new OWASPRule { Id = "920250", RuleId = "920250", Name = "UTF-8 Encoding Abuse", Category = "Request Limits", Severity = "ERROR", Action = "BLOCK", Description = "Blocks illegal UTF-8 encoding sequences that could be used to bypass string-matching rules." },
                    new OWASPRule { Id = "920300", RuleId = "920300", Name = "Missing Accept Header", Category = "Request Limits", Severity = "WARNING", Action = "LOG", Description = "Flags requests that lack an Accept header, often indicating automated or scripted traffic." },
                    new OWASPRule { Id = "920400", RuleId = "920400", Name = "Allowed HTTP Methods", Category = "Request Limits", Severity = "WARNING", Action = "BLOCK", Description = "Blocks HTTP methods outside the configured allow-list (e.g., TRACE, CONNECT)." },
                    new OWASPRule { Id = "920420", RuleId = "920420", Name = "Allowed Request Content Types", Category = "Request Limits", Severity = "WARNING", Action = "BLOCK", Description = "Allows only Content-Type values explicitly configured by the security policy." },
                    new OWASPRule { Id = "920440", RuleId = "920440", Name = "URL File Extension Restriction", Category = "Request Limits", Severity = "WARNING", Action = "BLOCK", Description = "Blocks requests for file extensions that are not in the configured allow-list." },
                    new OWASPRule { Id = "920450", RuleId = "920450", Name = "Restricted HTTP Headers", Category = "Request Limits", Severity = "WARNING", Action = "BLOCK", Description = "Blocks requests containing headers that are prohibited by the security policy." },

                    // ── SQL Injection (942xxx) ─────────────────────────────────────────────
                    new OWASPRule { Id = "942100", RuleId = "942100", Name = "SQL Injection via libinjection", Category = "SQL Injection", Severity = "CRITICAL", Action = "BLOCK", Description = "Uses the libinjection library to heuristically detect SQL injection payloads in request parameters." },
                    new OWASPRule { Id = "942110", RuleId = "942110", Name = "SQL Injection: Common Attack Strings", Category = "SQL Injection", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects classic SQL injection strings such as OR 1=1, UNION SELECT, and comment sequences." },
                    new OWASPRule { Id = "942120", RuleId = "942120", Name = "SQL Operator Detected", Category = "SQL Injection", Severity = "ERROR", Action = "BLOCK", Description = "Identifies SQL comparison operators (=, <, >, !=) in unusual contexts within request data." },
                    new OWASPRule { Id = "942130", RuleId = "942130", Name = "SQL Tautology Attack", Category = "SQL Injection", Severity = "CRITICAL", Action = "BLOCK", Description = "Blocks tautological SQL expressions (e.g., '1'='1') used to always-true authentication bypass." },
                    new OWASPRule { Id = "942140", RuleId = "942140", Name = "SQL Keyword Injection", Category = "SQL Injection", Severity = "CRITICAL", Action = "BLOCK", Description = "Matches reserved SQL keywords (SELECT, INSERT, UPDATE, DELETE, DROP, EXEC) in user input." },
                    new OWASPRule { Id = "942150", RuleId = "942150", Name = "SQL Injection Attack", Category = "SQL Injection", Severity = "CRITICAL", Action = "BLOCK", Description = "Broad signature matching for well-known SQL injection attack patterns across multiple databases." },
                    new OWASPRule { Id = "942160", RuleId = "942160", Name = "Blind SQL Injection (Timing)", Category = "SQL Injection", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects blind SQLi techniques that rely on time delays (SLEEP, WAITFOR) to exfiltrate data." },
                    new OWASPRule { Id = "942170", RuleId = "942170", Name = "SQL Benchmark/Sleep Injection", Category = "SQL Injection", Severity = "CRITICAL", Action = "BLOCK", Description = "Blocks BENCHMARK() and SLEEP() function calls used in time-based blind injection." },
                    new OWASPRule { Id = "942190", RuleId = "942190", Name = "MSSQL Stored Procedure Execution", Category = "SQL Injection", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects attempts to execute MSSQL stored procedures (xp_cmdshell, sp_execute) via injection." },
                    new OWASPRule { Id = "942200", RuleId = "942200", Name = "MySQL Comment/Space Obfuscation", Category = "SQL Injection", Severity = "CRITICAL", Action = "BLOCK", Description = "Identifies MySQL-specific injection obfuscation using inline comments (/*!...*/) and spaces." },
                    new OWASPRule { Id = "942210", RuleId = "942210", Name = "Chained SQL Injection Attempt", Category = "SQL Injection", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects chained SQLi attempts involving semicolons to stack multiple queries." },
                    new OWASPRule { Id = "942230", RuleId = "942230", Name = "Conditional SQL Injection", Category = "SQL Injection", Severity = "CRITICAL", Action = "BLOCK", Description = "Matches conditional expressions (IF, CASE) in SQL injection contexts." },
                    new OWASPRule { Id = "942240", RuleId = "942240", Name = "MySQL Charset / CONCAT Injection", Category = "SQL Injection", Severity = "CRITICAL", Action = "BLOCK", Description = "Blocks MySQL CONCAT(), CHAR(), and charset-based obfuscation techniques." },
                    new OWASPRule { Id = "942250", RuleId = "942250", Name = "MATCH AGAINST / MERGE / EXECUTE Injection", Category = "SQL Injection", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects advanced SQL functions used in MySQL full-text and Oracle-style injections." },
                    new OWASPRule { Id = "942260", RuleId = "942260", Name = "SQL Authentication Bypass", Category = "SQL Injection", Severity = "CRITICAL", Action = "BLOCK", Description = "Identifies basic SQL authentication bypass patterns (' OR '1'='1, admin'--) in login fields." },
                    new OWASPRule { Id = "942270", RuleId = "942270", Name = "Basic SQL Injection Strings", Category = "SQL Injection", Severity = "CRITICAL", Action = "BLOCK", Description = "Matches fundamental injection payloads including quote manipulation and common attack tokens." },
                    new OWASPRule { Id = "942290", RuleId = "942290", Name = "MongoDB Injection Attempt", Category = "SQL Injection", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects NoSQL injection payloads targeting MongoDB query operators ($where, $gt, $ne)." },
                    new OWASPRule { Id = "942300", RuleId = "942300", Name = "MySQL Comments/Function Evasion", Category = "SQL Injection", Severity = "CRITICAL", Action = "BLOCK", Description = "Blocks MySQL conditional comments and function calls used to evade WAF detection." },
                    new OWASPRule { Id = "942310", RuleId = "942310", Name = "Chained SQL Injection (2)", Category = "SQL Injection", Severity = "CRITICAL", Action = "BLOCK", Description = "Additional ruleset for detecting complex chained SQL injection sequences." },
                    new OWASPRule { Id = "942320", RuleId = "942320", Name = "MySQL Stored Procedure Function", Category = "SQL Injection", Severity = "CRITICAL", Action = "BLOCK", Description = "Identifies MySQL-specific stored procedure calls and UDF injection attempts." },
                    new OWASPRule { Id = "942350", RuleId = "942350", Name = "SQL Injection via MySQL UDF", Category = "SQL Injection", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects attempts to load user-defined functions (UDF) through SQL injection vectors." },
                    new OWASPRule { Id = "942360", RuleId = "942360", Name = "Concatenated SQL Injection / Bypass", Category = "SQL Injection", Severity = "CRITICAL", Action = "BLOCK", Description = "Identifies concatenation-based injection bypass techniques targeting sign-in and API endpoints." },

                    // ── Cross-Site Scripting (941xxx) ─────────────────────────────────────
                    new OWASPRule { Id = "941100", RuleId = "941100", Name = "XSS via libinjection", Category = "Cross-Site Scripting", Severity = "CRITICAL", Action = "BLOCK", Description = "Uses the libinjection library to detect XSS payloads using heuristic pattern analysis." },
                    new OWASPRule { Id = "941101", RuleId = "941101", Name = "XSS via libinjection (2)", Category = "Cross-Site Scripting", Severity = "CRITICAL", Action = "BLOCK", Description = "Secondary libinjection XSS detection pass covering additional payload variants." },
                    new OWASPRule { Id = "941110", RuleId = "941110", Name = "XSS Script Tag", Category = "Cross-Site Scripting", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects the <script> tag in user-supplied input, a primary XSS injection vector." },
                    new OWASPRule { Id = "941120", RuleId = "941120", Name = "XSS Event Handler Attribute", Category = "Cross-Site Scripting", Severity = "CRITICAL", Action = "BLOCK", Description = "Blocks inline event handlers (onerror, onclick, onmouseover) injected into HTML attributes." },
                    new OWASPRule { Id = "941130", RuleId = "941130", Name = "XSS Attribute Injection", Category = "Cross-Site Scripting", Severity = "ERROR", Action = "BLOCK", Description = "Identifies attempts to inject JavaScript into HTML tag attributes using encoding tricks." },
                    new OWASPRule { Id = "941140", RuleId = "941140", Name = "XSS JavaScript URL", Category = "Cross-Site Scripting", Severity = "CRITICAL", Action = "BLOCK", Description = "Blocks javascript: URI scheme usage in href, src, and action attributes." },
                    new OWASPRule { Id = "941150", RuleId = "941150", Name = "XSS by IE (Charset Exploit)", Category = "Cross-Site Scripting", Severity = "ERROR", Action = "BLOCK", Description = "Detects Internet Explorer-specific XSS bypass techniques using charset manipulation." },
                    new OWASPRule { Id = "941160", RuleId = "941160", Name = "NoScript XSS InjectionChecker", Category = "Cross-Site Scripting", Severity = "ERROR", Action = "BLOCK", Description = "Matches XSS payloads that attempt to bypass script-blocking browser extensions." },
                    new OWASPRule { Id = "941170", RuleId = "941170", Name = "NoScript XSS (Attributes)", Category = "Cross-Site Scripting", Severity = "ERROR", Action = "BLOCK", Description = "Detects attribute-based XSS payloads targeting browsers with NoScript policies." },
                    new OWASPRule { Id = "941180", RuleId = "941180", Name = "Node-Validator Blocklist Keywords", Category = "Cross-Site Scripting", Severity = "ERROR", Action = "BLOCK", Description = "Blocks HTML/JavaScript keywords that appear in the node-validator denylist." },
                    new OWASPRule { Id = "941190", RuleId = "941190", Name = "XSS via IE Filters Evasion", Category = "Cross-Site Scripting", Severity = "ERROR", Action = "BLOCK", Description = "Detects CSS expression() and other IE-specific XSS filter evasion techniques." },
                    new OWASPRule { Id = "941200", RuleId = "941200", Name = "XSS via VML Frames", Category = "Cross-Site Scripting", Severity = "ERROR", Action = "BLOCK", Description = "Blocks VML (Vector Markup Language) injection attacks targeting legacy IE browsers." },
                    new OWASPRule { Id = "941210", RuleId = "941210", Name = "XSS via Flash Injection", Category = "Cross-Site Scripting", Severity = "ERROR", Action = "BLOCK", Description = "Detects Flash content (SWF) injection attempts using object and embed tags." },
                    new OWASPRule { Id = "941220", RuleId = "941220", Name = "XSS via Obfuscated VBScript", Category = "Cross-Site Scripting", Severity = "ERROR", Action = "BLOCK", Description = "Identifies obfuscated VBScript injection in IE-targeting XSS payloads." },
                    new OWASPRule { Id = "941230", RuleId = "941230", Name = "XSS via Embed Tag", Category = "Cross-Site Scripting", Severity = "ERROR", Action = "BLOCK", Description = "Blocks <embed> tag injection used to load malicious external content." },
                    new OWASPRule { Id = "941240", RuleId = "941240", Name = "XSS via Import / Implementation", Category = "Cross-Site Scripting", Severity = "ERROR", Action = "BLOCK", Description = "Detects SVG-based XSS using @import and namespace manipulation for code execution." },
                    new OWASPRule { Id = "941250", RuleId = "941250", Name = "XSS via Meta Refresh Tag", Category = "Cross-Site Scripting", Severity = "ERROR", Action = "BLOCK", Description = "Blocks <meta> refresh and http-equiv injection used for phishing redirects." },
                    new OWASPRule { Id = "941260", RuleId = "941260", Name = "XSS via Base Tag", Category = "Cross-Site Scripting", Severity = "ERROR", Action = "BLOCK", Description = "Detects <base href> injection used to change the base URL and hijack relative links." },
                    new OWASPRule { Id = "941270", RuleId = "941270", Name = "XSS via Applet Tag", Category = "Cross-Site Scripting", Severity = "ERROR", Action = "BLOCK", Description = "Blocks <applet> tag injection used to load malicious Java applets." },
                    new OWASPRule { Id = "941280", RuleId = "941280", Name = "XSS via Form Tag", Category = "Cross-Site Scripting", Severity = "ERROR", Action = "BLOCK", Description = "Identifies <form action> injection used to redirect form submissions to attacker-controlled endpoints." },
                    new OWASPRule { Id = "941290", RuleId = "941290", Name = "XSS via Object Tag", Category = "Cross-Site Scripting", Severity = "ERROR", Action = "BLOCK", Description = "Blocks <object data> injection used to embed external malicious content." },
                    new OWASPRule { Id = "941300", RuleId = "941300", Name = "XSS via Table/TD Background", Category = "Cross-Site Scripting", Severity = "ERROR", Action = "BLOCK", Description = "Detects background attribute injection within table and TD tags for XSS." },
                    new OWASPRule { Id = "941310", RuleId = "941310", Name = "US-ASCII Malformed Encoding XSS Filter Bypass", Category = "Cross-Site Scripting", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects XSS attempts using malformed US-ASCII encoding to bypass browser decode filters." },
                    new OWASPRule { Id = "941320", RuleId = "941320", Name = "XSS Possible Obfuscated JavaScript", Category = "Cross-Site Scripting", Severity = "ERROR", Action = "BLOCK", Description = "Matches obfuscated JavaScript patterns (eval, unescape, fromCharCode) in user input." },
                    new OWASPRule { Id = "941330", RuleId = "941330", Name = "XSS Filter Evasion (IE)", Category = "Cross-Site Scripting", Severity = "ERROR", Action = "BLOCK", Description = "Blocks known IE-specific filter evasion payloads that corrupt HTML parsing." },
                    new OWASPRule { Id = "941340", RuleId = "941340", Name = "XSS Filter Evasion (Browsers)", Category = "Cross-Site Scripting", Severity = "ERROR", Action = "BLOCK", Description = "Detects cross-browser XSS filter evasion techniques including null-byte injection." },
                    new OWASPRule { Id = "941350", RuleId = "941350", Name = "UTF-7 Encoded XSS", Category = "Cross-Site Scripting", Severity = "ERROR", Action = "BLOCK", Description = "Blocks XSS payloads encoded in UTF-7 to bypass standard content-type filters." },

                    // ── Local File Inclusion (930xxx) ─────────────────────────────────────
                    new OWASPRule { Id = "930100", RuleId = "930100", Name = "Path Traversal (/../)", Category = "Local File Inclusion", Severity = "CRITICAL", Action = "BLOCK", Description = "Blocks directory traversal sequences (../, ..\\) that attempt to access files outside the web root." },
                    new OWASPRule { Id = "930110", RuleId = "930110", Name = "Path Traversal (2)", Category = "Local File Inclusion", Severity = "CRITICAL", Action = "BLOCK", Description = "Secondary path traversal detection covering encoded variants (%2e%2e%2f, %252e%252e)." },
                    new OWASPRule { Id = "930120", RuleId = "930120", Name = "OS File Access Attempt", Category = "Local File Inclusion", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects access attempts to sensitive OS files such as /etc/passwd, /proc/self/environ." },
                    new OWASPRule { Id = "930130", RuleId = "930130", Name = "Restricted File Access Attempt", Category = "Local File Inclusion", Severity = "CRITICAL", Action = "BLOCK", Description = "Blocks attempts to access restricted application files including .htaccess and web.config." },

                    // ── Remote File Inclusion (931xxx) ────────────────────────────────────
                    new OWASPRule { Id = "931100", RuleId = "931100", Name = "RFI: URL Parameter", Category = "Remote File Inclusion", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects remote file inclusion attempts where an external URL (http://, ftp://) is injected into a file parameter." },
                    new OWASPRule { Id = "931110", RuleId = "931110", Name = "RFI: Common Vulnerable Parameter", Category = "Remote File Inclusion", Severity = "CRITICAL", Action = "BLOCK", Description = "Identifies RFI exploitation of commonly vulnerable PHP parameter names (page, file, lang, template)." },
                    new OWASPRule { Id = "931120", RuleId = "931120", Name = "RFI: Trailing Question Mark", Category = "Remote File Inclusion", Severity = "CRITICAL", Action = "BLOCK", Description = "Blocks RFI payloads that append a trailing ? to suppress the included file's remainder." },
                    new OWASPRule { Id = "931130", RuleId = "931130", Name = "RFI: Off-Domain Reference", Category = "Remote File Inclusion", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects RFI where an off-domain file reference is injected to load malicious remote scripts." },

                    // ── RCE / Command Injection (932xxx) ──────────────────────────────────
                    new OWASPRule { Id = "932100", RuleId = "932100", Name = "Remote Command Execution: Unix Shell", Category = "Remote Code Execution", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects Unix shell command injection using pipe, semicolon, backtick, and common shell commands." },
                    new OWASPRule { Id = "932105", RuleId = "932105", Name = "Remote Command Execution: Unix Shell (2)", Category = "Remote Code Execution", Severity = "CRITICAL", Action = "BLOCK", Description = "Supplementary Unix shell injection detection covering sub-shell and process substitution techniques." },
                    new OWASPRule { Id = "932110", RuleId = "932110", Name = "Remote Command Execution: Windows Shell", Category = "Remote Code Execution", Severity = "CRITICAL", Action = "BLOCK", Description = "Identifies Windows command injection patterns using cmd.exe, PowerShell, and WScript." },
                    new OWASPRule { Id = "932115", RuleId = "932115", Name = "Remote Command Execution: Windows PowerShell", Category = "Remote Code Execution", Severity = "CRITICAL", Action = "BLOCK", Description = "Blocks PowerShell-specific injection payloads including Invoke-Expression and encoded command flags." },
                    new OWASPRule { Id = "932120", RuleId = "932120", Name = "Remote Command Execution: PowerShell", Category = "Remote Code Execution", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects PowerShell invocation patterns in request parameters used for post-exploitation." },
                    new OWASPRule { Id = "932130", RuleId = "932130", Name = "Remote Command Execution: Unix Shell Expression", Category = "Remote Code Execution", Severity = "CRITICAL", Action = "BLOCK", Description = "Identifies shell expression injection including variable expansion and arithmetic evaluation." },
                    new OWASPRule { Id = "932140", RuleId = "932140", Name = "Remote Command Execution: Windows FOR/IF", Category = "Remote Code Execution", Severity = "CRITICAL", Action = "BLOCK", Description = "Blocks DOS batch command injection using FOR loops and IF conditionals." },
                    new OWASPRule { Id = "932150", RuleId = "932150", Name = "Remote Command Execution: Direct Unix Command", Category = "Remote Code Execution", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects direct invocation of Unix commands (cat, ls, wget, curl, nc) in user input." },
                    new OWASPRule { Id = "932160", RuleId = "932160", Name = "Remote Command Execution: Unix Shell Code", Category = "Remote Code Execution", Severity = "CRITICAL", Action = "BLOCK", Description = "Matches Unix shell code patterns (#!/bin/sh, /bin/bash) indicative of shell script injection." },
                    new OWASPRule { Id = "932170", RuleId = "932170", Name = "Remote Command Execution: Shellshock", Category = "Remote Code Execution", Severity = "CRITICAL", Action = "BLOCK", Description = "Blocks Shellshock (CVE-2014-6271) exploitation via malformed function definitions in env variables." },
                    new OWASPRule { Id = "932180", RuleId = "932180", Name = "Restricted File Upload Attempt", Category = "Remote Code Execution", Severity = "CRITICAL", Action = "BLOCK", Description = "Blocks upload of executable file types (php, phtml, asp, aspx, jsp) via multipart forms." },

                    // ── PHP Injection (933xxx) ─────────────────────────────────────────────
                    new OWASPRule { Id = "933100", RuleId = "933100", Name = "PHP Injection: Opening Tag", Category = "PHP Injection", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects PHP code injection via opening tags (<?php, <?, <?=) in request parameters." },
                    new OWASPRule { Id = "933110", RuleId = "933110", Name = "PHP Injection: File Upload", Category = "PHP Injection", Severity = "CRITICAL", Action = "BLOCK", Description = "Blocks PHP script uploads disguised with image or document file extensions." },
                    new OWASPRule { Id = "933120", RuleId = "933120", Name = "PHP Injection: Configuration Directive", Category = "PHP Injection", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects PHP ini directives (allow_url_fopen, disable_functions) injected into request data." },
                    new OWASPRule { Id = "933130", RuleId = "933130", Name = "PHP Injection: Variables", Category = "PHP Injection", Severity = "CRITICAL", Action = "BLOCK", Description = "Identifies PHP superglobals ($_GET, $_POST, $_SERVER) injected into application parameters." },
                    new OWASPRule { Id = "933140", RuleId = "933140", Name = "PHP Injection: I/O Stream", Category = "PHP Injection", Severity = "CRITICAL", Action = "BLOCK", Description = "Blocks PHP stream wrapper injection (php://filter, php://input) enabling arbitrary code execution." },
                    new OWASPRule { Id = "933150", RuleId = "933150", Name = "PHP Injection: High-Risk Function", Category = "PHP Injection", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects high-risk PHP functions (eval, exec, passthru, shell_exec, assert) in user input." },
                    new OWASPRule { Id = "933160", RuleId = "933160", Name = "PHP Injection: High-Risk Function Call", Category = "PHP Injection", Severity = "CRITICAL", Action = "BLOCK", Description = "Matches invocations of dangerous PHP functions with user-controlled arguments." },
                    new OWASPRule { Id = "933170", RuleId = "933170", Name = "PHP Injection: Serialized Object", Category = "PHP Injection", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects PHP serialized object injection patterns (O:, a:, s:) indicating deserialization attacks." },
                    new OWASPRule { Id = "933180", RuleId = "933180", Name = "PHP Injection: Variable Function", Category = "PHP Injection", Severity = "CRITICAL", Action = "BLOCK", Description = "Identifies PHP variable functions ($$var, call_user_func) used for indirect code execution." },

                    // ── Java Injection (944xxx) ────────────────────────────────────────────
                    new OWASPRule { Id = "944100", RuleId = "944100", Name = "Java Injection: Remote Command Execution", Category = "Java Injection", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects Java-based RCE payloads targeting Runtime.exec() and ProcessBuilder invocations." },
                    new OWASPRule { Id = "944110", RuleId = "944110", Name = "Java Injection: Suspicious Class", Category = "Java Injection", Severity = "CRITICAL", Action = "BLOCK", Description = "Blocks injection of dangerous Java classes (ClassLoader, Runtime, ProcessBuilder) in request data." },
                    new OWASPRule { Id = "944120", RuleId = "944120", Name = "Java Serialization Attack", Category = "Java Injection", Severity = "CRITICAL", Action = "BLOCK", Description = "Identifies Java serialized object magic bytes (\\xac\\xed) in request payloads indicating deserialization attacks." },
                    new OWASPRule { Id = "944130", RuleId = "944130", Name = "Suspicious Java Class Detected", Category = "Java Injection", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects injection of known vulnerable Java classes used in Apache Commons Collections exploits." },
                    new OWASPRule { Id = "944200", RuleId = "944200", Name = "Spring Framework RCE (CVE-2022-22965)", Category = "Java Injection", Severity = "CRITICAL", Action = "BLOCK", Description = "Blocks Spring4Shell exploitation via class.module.classLoader bind patterns in request parameters." },
                    new OWASPRule { Id = "944210", RuleId = "944210", Name = "Log4j / Log4Shell (CVE-2021-44228)", Category = "Java Injection", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects Log4Shell JNDI lookup injection (${jndi:ldap://}) patterns in all request fields including headers." },

                    // ── Generic Attacks / Data Leakage (950xxx / 951xxx) ──────────────────
                    new OWASPRule { Id = "950100", RuleId = "950100", Name = "Remote Code Execution Attempt", Category = "Generic Attack", Severity = "CRITICAL", Action = "BLOCK", Description = "Broad RCE detection rule covering multiple code execution attack vectors." },
                    new OWASPRule { Id = "950110", RuleId = "950110", Name = "Backdoor/Trojan Access Attempt", Category = "Generic Attack", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects requests targeting known backdoor shells and web trojans (c99, r57, b374k)." },
                    new OWASPRule { Id = "951100", RuleId = "951100", Name = "SQL Error Leakage", Category = "Data Leakage", Severity = "ERROR", Action = "LOG", Description = "Detects SQL error strings in response bodies indicating poor error handling and potential info disclosure." },
                    new OWASPRule { Id = "951110", RuleId = "951110", Name = "MySQL Error Leakage", Category = "Data Leakage", Severity = "ERROR", Action = "LOG", Description = "Identifies MySQL-specific error messages in responses that reveal database schema or version info." },
                    new OWASPRule { Id = "951120", RuleId = "951120", Name = "PostgreSQL Error Leakage", Category = "Data Leakage", Severity = "ERROR", Action = "LOG", Description = "Detects PostgreSQL error strings in HTTP responses exposing sensitive server-side information." },
                    new OWASPRule { Id = "951130", RuleId = "951130", Name = "MSSQL Error Leakage", Category = "Data Leakage", Severity = "ERROR", Action = "LOG", Description = "Identifies Microsoft SQL Server error messages leaked in HTTP responses." },
                    new OWASPRule { Id = "951140", RuleId = "951140", Name = "Oracle Error Leakage", Category = "Data Leakage", Severity = "ERROR", Action = "LOG", Description = "Detects Oracle database error messages disclosed in application responses." },
                });
            }

            context.SaveChanges();

            // Populate real MITRE ATT&CK mappings for all seeded OWASP rules by category
            // Source: https://attack.mitre.org/
            try
            {
                var mitreMappings = new[]
                {
                    new { Category = "SQL Injection",          Technique = "T1190", Tactic = "Initial Access" },
                    new { Category = "Cross-Site Scripting",   Technique = "T1059.007", Tactic = "Execution" },
                    new { Category = "Remote Code Execution",  Technique = "T1059", Tactic = "Execution" },
                    new { Category = "PHP Injection",          Technique = "T1059.004", Tactic = "Execution" },
                    new { Category = "Java Injection",         Technique = "T1059.007", Tactic = "Execution" },
                    new { Category = "Local File Inclusion",   Technique = "T1083", Tactic = "Discovery" },
                    new { Category = "Remote File Inclusion",  Technique = "T1190", Tactic = "Initial Access" },
                    new { Category = "Scanner Detection",      Technique = "T1595", Tactic = "Reconnaissance" },
                    new { Category = "Protocol Enforcement",   Technique = "T1071.001", Tactic = "Command and Control" },
                    new { Category = "Request Limits",         Technique = "T1190", Tactic = "Initial Access" },
                    new { Category = "Generic Attack",         Technique = "T1210", Tactic = "Lateral Movement" },
                    new { Category = "Data Leakage",           Technique = "T1552", Tactic = "Credential Access" },
                };

                foreach (var m in mitreMappings)
                {
                    context.Database.ExecuteSqlRaw(
                        $"UPDATE owasp_rules SET \"MitreTechnique\" = '{m.Technique}', \"MitreTactic\" = '{m.Tactic}' WHERE \"Category\" = '{m.Category}' AND (\"MitreTechnique\" IS NULL OR \"MitreTechnique\" = '');"
                    );
                }
                Console.WriteLine("[DbInitializer] MITRE ATT&CK mappings applied to OWASP rules.");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DbInitializer] MITRE seeding failed: {ex.Message}");
            }
        }

        /// <summary>
        /// Applies Postgres Row-Level Security as a second, database-enforced isolation layer
        /// beneath the existing EF Core global query filter (see WafDbContext.OnModelCreating).
        /// Even if an app-layer query forgets/bypasses the EF filter (raw SQL, a missing filter
        /// on a new entity, IgnoreQueryFilters misuse, etc.), Postgres itself will still refuse
        /// to return or write rows belonging to another tenant.
        ///
        /// This mirrors the app-layer semantics exactly:
        ///  - Every base table with a "TenantId" column gets RLS enabled AND forced (FORCE ROW
        ///    LEVEL SECURITY), so even the table owner/connection role is subject to it — the
        ///    app currently connects using that same role, so without FORCE the policy would be
        ///    silently bypassed.
        ///  - The policy compares "TenantId" against the `app.current_tenant_id` session
        ///    variable that TenantDbInterceptor sets on every connection, using
        ///    IS NOT DISTINCT FROM so that NULL TenantId rows (global/system rows) only match
        ///    when there is no current tenant — the same null-aware behavior EF Core produces
        ///    for `EF.Property&lt;string&gt;(e, "TenantId") == CurrentTenantId`.
        ///  - "SYSTEM_ADMIN" and "AUTH_SERVICE" are the two sentinel values the interceptor uses
        ///    for platform-admin/background work and the login/signup path (which must be able
        ///    to look up a user across all tenants); both bypass the tenant match entirely.
        ///
        /// Idempotent: safe to run on every startup. New tables that add a TenantId column are
        /// picked up automatically without needing another manual migration step.
        /// </summary>
        private static void ApplyRowLevelSecurity(WafDbContext context)
        {
            try
            {
                // RLS policies are enforced for every role except superusers and roles with the
                // BYPASSRLS attribute — Postgres always lets those bypass row security, even with
                // FORCE ROW LEVEL SECURITY. If the app is still connecting as the `postgres`
                // superuser (see ConnectionStrings:DefaultConnection), the policies below are
                // created successfully but never actually enforced. Run `init_app_role.sql` once
                // to provision a least-privilege `waf_app_user` role and point DefaultConnection
                // at it (mirrors the existing `waf_audit_user` pattern in init_audit_role.sql).
                var isSuperuser = context.Database
                    .SqlQueryRaw<string>("SELECT current_setting('is_superuser')")
                    .AsEnumerable()
                    .FirstOrDefault();
                if (string.Equals(isSuperuser, "on", StringComparison.OrdinalIgnoreCase))
                {
                    Console.WriteLine("[DbInitializer] WARNING: Database connection is using a Postgres superuser. " +
                        "Row-Level Security policies will be created but NOT enforced until the app connects as a " +
                        "non-superuser role (run init_app_role.sql and update ConnectionStrings:DefaultConnection).");
                }

                context.Database.ExecuteSqlRaw(@"
                    DO $$
                    DECLARE
                        tbl RECORD;
                    BEGIN
                        FOR tbl IN
                            SELECT DISTINCT c.table_name
                            FROM information_schema.columns c
                            JOIN information_schema.tables t
                              ON t.table_name = c.table_name AND t.table_schema = c.table_schema
                            WHERE c.table_schema = 'public'
                              AND c.column_name = 'TenantId'
                              AND t.table_type = 'BASE TABLE'
                        LOOP
                            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl.table_name);
                            EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tbl.table_name);

                            IF NOT EXISTS (
                                SELECT 1 FROM pg_policies
                                WHERE schemaname = 'public'
                                  AND tablename = tbl.table_name
                                  AND policyname = 'tenant_isolation_policy'
                            ) THEN
                                EXECUTE format(
                                    'CREATE POLICY tenant_isolation_policy ON public.%I
                                     USING (
                                         current_setting(''app.current_tenant_id'', true) IN (''SYSTEM_ADMIN'', ''AUTH_SERVICE'')
                                         OR ""TenantId"" IS NOT DISTINCT FROM current_setting(''app.current_tenant_id'', true)
                                     )
                                     WITH CHECK (
                                         current_setting(''app.current_tenant_id'', true) IN (''SYSTEM_ADMIN'', ''AUTH_SERVICE'')
                                         OR ""TenantId"" IS NOT DISTINCT FROM current_setting(''app.current_tenant_id'', true)
                                     )',
                                    tbl.table_name
                                );
                            END IF;
                        END LOOP;
                    END $$;
                ");
                Console.WriteLine("[DbInitializer] Row-Level Security policies applied to all tenant-scoped tables.");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DbInitializer] Failed to apply Row-Level Security: {ex.Message}");
            }
        }

        private static void UpdateOrCreatePlan(WafDbContext context, PlanConfig plan)
        {
            var existing = context.PlanConfigs.FirstOrDefault(p => p.Name == plan.Name);
            if (existing == null)
            {
                context.PlanConfigs.Add(plan);
            }
            else
            {
                existing.MaxDomains = plan.MaxDomains;
                existing.HasWafDetection = plan.HasWafDetection;
                existing.HasWafBlocking = plan.HasWafBlocking;
                existing.HasApiProtection = plan.HasApiProtection;
                existing.HasBotProtection = plan.HasBotProtection;
                existing.HasDdosProtection = plan.HasDdosProtection;
                existing.HasAccountTakeover = plan.HasAccountTakeover;
                existing.HasRateLimiting = plan.HasRateLimiting;
                existing.HasSslManagement = plan.HasSslManagement;
                existing.HasThreatIntel = plan.HasThreatIntel;
                existing.HasAttackLogs = plan.HasAttackLogs;
                existing.HasNotifications = plan.HasNotifications;
                existing.HasAnalytics = plan.HasAnalytics;
                existing.PriceEtb = plan.PriceEtb;
            }
        }
    }
}

using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using AffiniSecurity.Waf.Data;
using AffiniSecurity.Waf.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.Extensions.Configuration;
using AffiniSecurity.Waf.Security;
using AffiniSecurity.Waf.Models.DTOs;
using System;
using System.Linq;
using System.Collections.Generic;

namespace AffiniSecurity.Waf.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/admin")]
    public class AdminController : ControllerBase
    {
        private readonly WafDbContext _context;
        private readonly IConfiguration _configuration;
        private readonly IWebHostEnvironment _env;

        public AdminController(WafDbContext context, IConfiguration configuration, IWebHostEnvironment env)
        {
            _context = context;
            _configuration = configuration;
            _env = env;
        }

        [HttpGet("ping")]
        public IActionResult Ping() => Ok(new { status = "AdminController Active", time = DateTime.UtcNow });

        [HttpGet("debug-tenants")]
        public async Task<IActionResult> DebugTenants()
        {
            var allTenants = await _context.Tenants.IgnoreQueryFilters().ToListAsync();
            return Ok(allTenants);
        }

        [Authorize(Policy = WafPolicies.RequirePlatformAdmin)]
        [HttpGet("tenants")]
        public async Task<IActionResult> GetAllTenants(
            [FromQuery] string? search = null,
            [FromQuery] string? plan = null,
            [FromQuery] string? status = null,
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 10)
        {
            var query = _context.Tenants.IgnoreQueryFilters().AsQueryable();

            // Filtering
            if (!string.IsNullOrWhiteSpace(search))
            {
                var lowerSearch = search.ToLower();
                query = query.Where(t => 
                    t.Name.ToLower().Contains(lowerSearch) || 
                    t.ContactEmail.ToLower().Contains(lowerSearch) || 
                    t.Website.ToLower().Contains(lowerSearch));
            }

            if (!string.IsNullOrWhiteSpace(plan))
            {
                // Joins with Subscriptions/PlanConfigs if necessary, but for now we look at the last active subscription
                query = query.Where(t => _context.Subscriptions.IgnoreQueryFilters()
                    .Where(s => s.TenantId == t.Id && s.Status == "active")
                    .Any(s => s.PlanName.ToLower() == plan.ToLower()));
            }

            if (!string.IsNullOrWhiteSpace(status))
            {
                if (status.Equals("active", StringComparison.OrdinalIgnoreCase))
                    query = query.Where(t => t.IsActive);
                else if (status.Equals("suspended", StringComparison.OrdinalIgnoreCase))
                    query = query.Where(t => !t.IsActive);
            }

            // Pagination
            var totalCount = await query.CountAsync();
            // Level 1: Fetch paginated tenants
            var tenantsRaw = await query
                .OrderByDescending(t => t.CreatedAt)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync();

            // Level 2: Enrich with extra data (stable bypass)
            var enrichedTenants = new List<AdminTenantListItemDto>();
            foreach (var t in tenantsRaw)
            {
                var planName = await _context.Subscriptions.IgnoreQueryFilters()
                    .Where(s => s.TenantId == t.Id && s.Status == "active")
                    .OrderByDescending(s => s.CreatedAt)
                    .Select(s => s.PlanName)
                    .FirstOrDefaultAsync() ?? "Free";

                var count = await _context.TenantMembers.IgnoreQueryFilters()
                    .CountAsync(m => m.TenantId == t.Id);

                enrichedTenants.Add(new AdminTenantListItemDto
                {
                    Id = t.Id,
                    Name = t.Name,
                    Website = t.Website,
                    ContactEmail = t.ContactEmail,
                    IsActive = t.IsActive,
                    CreatedAt = t.CreatedAt,
                    Plan = planName,
                    MembersCount = count
                });
            }

            return Ok(new AdminTenantListResponse
            {
                Total = totalCount,
                Tenants = enrichedTenants,
                Page = page,
                PageSize = pageSize
            });
        }

        [Authorize(Policy = WafPolicies.RequirePlatformAdmin)]
        [HttpGet("system-stats")]
        public async Task<IActionResult> GetSystemStats()
        {
            var stats = new
            {
                TotalTenants = await _context.Tenants.IgnoreQueryFilters().CountAsync(),
                TotalUsers = await _context.Users.IgnoreQueryFilters().CountAsync(),
                TotalDomains = await _context.Domains.IgnoreQueryFilters().CountAsync()
            };
            return Ok(stats);
        }
        [Authorize(Policy = WafPolicies.RequirePlatformAdmin)]
        [HttpPost("impersonate/{tenantId}")]
        public async Task<IActionResult> Impersonate(string tenantId)
        {
            var tenant = await _context.Tenants.FindAsync(tenantId);
            if (tenant == null) return NotFound(new { error = "The requested organization could not be found." });

            var user = await _context.Users.IgnoreQueryFilters().FirstOrDefaultAsync(u => u.TenantId == tenantId && u.Role == "tenant_admin");
            if (user == null) return NotFound(new { error = "We couldn't find an administrator account for this organization." });

            var subscription = await _context.Subscriptions.IgnoreQueryFilters()
                .Where(s => s.TenantId == tenantId && s.Status == "active")
                .OrderByDescending(s => s.CreatedAt)
                .FirstOrDefaultAsync();

            PlanConfig? plan = null;
            if (subscription != null)
                plan = await _context.PlanConfigs.FirstOrDefaultAsync(p => p.Name.ToLower() == subscription.PlanName.ToLower());

            if (plan == null)
                plan = await _context.PlanConfigs.FirstOrDefaultAsync(p => p.Name == "Free");

            var token = GenerateJwtToken(user);

            // Stash the acting admin's current session in an HttpOnly cookie (never exposed to
            // JS) so Unimpersonate can restore it server-side, then swap the active session
            // cookie to the impersonated tenant admin's token.
            if (Request.Cookies.TryGetValue(AffiniSecurity.Waf.Security.CookieAuth.SessionCookieName, out var currentSessionToken)
                && !string.IsNullOrEmpty(currentSessionToken)
                && !Request.Cookies.ContainsKey(AffiniSecurity.Waf.Security.CookieAuth.AdminBackupCookieName))
            {
                AffiniSecurity.Waf.Security.CookieAuth.SetAdminBackupCookie(Response, currentSessionToken, _env.IsDevelopment());
            }
            AffiniSecurity.Waf.Security.CookieAuth.SetSessionCookie(Response, token, _env.IsDevelopment());

            // Return explicit camelCase DTO to match frontend expectations
            return Ok(new {
                token = token,
                user = new {
                    id = user.Id,
                    email = user.Email,
                    name = user.Name,
                    phone = user.Phone,
                    jobTitle = user.JobTitle,
                    bio = user.Bio,
                    role = user.Role,
                    tenantId = user.TenantId,
                    permissions = AffiniSecurity.Waf.Security.WafPermissions.GetPermissionsForRole(user.Role).ToList()
                },
                tenant = new {
                    id = tenant.Id,
                    name = tenant.Name,
                    address = tenant.Address,
                    industry = tenant.Industry,
                    contactPhone = tenant.ContactPhone,
                    contactEmail = tenant.ContactEmail,
                    isProfileComplete = tenant.IsProfileComplete,
                    logoUrl = tenant.LogoUrl,
                    primaryColor = tenant.PrimaryColor,
                    brandName = tenant.BrandName
                },
                planConfig = plan == null ? null : new {
                    id = plan.Id,
                    name = plan.Name,
                    maxDomains = plan.MaxDomains,
                    hasWafDetection = plan.HasWafDetection,
                    hasWafBlocking = plan.HasWafBlocking,
                    hasApiProtection = plan.HasApiProtection,
                    hasBotProtection = plan.HasBotProtection,
                    hasDdosProtection = plan.HasDdosProtection,
                    hasAccountTakeover = plan.HasAccountTakeover,
                    hasRateLimiting = plan.HasRateLimiting,
                    hasSslManagement = plan.HasSslManagement,
                    hasThreatIntel = plan.HasThreatIntel,
                    hasAttackLogs = plan.HasAttackLogs,
                    hasNotifications = plan.HasNotifications,
                    hasAnalytics = plan.HasAnalytics
                }
            });
        }

        [Authorize] 
        [HttpGet("/api/templates")]
        [ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
        public async Task<IActionResult> GetTemplates()
        {
            try
            {
                // SEED IF MISSING: Only seed the 5 specialized presets if they don't exist yet
                var existingBuiltIn = await _context.RuleSetTemplates.IgnoreQueryFilters()
                    .Where(t => t.IsBuiltIn)
                    .Select(t => t.Name)
                    .ToListAsync();
                
                var templatesToSeed = new List<RuleSetTemplate>();
                var suiteFound = existingBuiltIn.Contains("Finance / Banking") && 
                               existingBuiltIn.Contains("E-Commerce") && 
                               existingBuiltIn.Contains("RESTful API");

                if (!suiteFound)
                {
                    Console.WriteLine("[AdminController] Special Presets missing or incomplete. Seeding library...");
                    templatesToSeed.AddRange(new List<RuleSetTemplate>
                    {
                        new RuleSetTemplate { Name = "Finance / Banking", Category = "Finance", Description = "High Compliance: Strict SQLi/XSS, Mandatory MFA signaling, Rate-limiting.", RuleCategories = "SQL Injection,Cross-Site Scripting,Request Limits,Protocol Enforcement", IsBuiltIn = true, CreatedAt = DateTime.UtcNow },
                        new RuleSetTemplate { Name = "E-Commerce", Category = "E-Commerce", Description = "Transaction Security: Bot protection, Scraping prevention, Payment endpoint hardening.", RuleCategories = "SQL Injection,Cross-Site Scripting,Scanner Detection,Data Leakage", IsBuiltIn = true, CreatedAt = DateTime.UtcNow },
                        new RuleSetTemplate { Name = "RESTful API", Category = "API", Description = "Payload Integrity: JSON/XML schema validation, Bearer token inspection, Method restriction.", RuleCategories = "SQL Injection,Protocol Enforcement,Request Limits,Java Injection", IsBuiltIn = true, CreatedAt = DateTime.UtcNow },
                        new RuleSetTemplate { Name = "WordPress / CMS", Category = "CMS", Description = "Application Specific: Hardened /wp-admin protection, Plugin vulnerability virtual patching.", RuleCategories = "PHP Injection,Local File Inclusion,Scanner Detection,Remote File Inclusion", IsBuiltIn = true, CreatedAt = DateTime.UtcNow },
                        new RuleSetTemplate { Name = "General Purpose", Category = "General", Description = "Balanced Security: OWASP Top 10 defaults with low false-positive sensitivity.", RuleCategories = "SQL Injection,Cross-Site Scripting,Scanner Detection,Protocol Enforcement,Request Limits", IsBuiltIn = true, CreatedAt = DateTime.UtcNow }
                    });

                    _context.RuleSetTemplates.AddRange(templatesToSeed);
                    await _context.SaveChangesAsync();
                }

                var templates = await _context.RuleSetTemplates.IgnoreQueryFilters().OrderBy(t => t.Name).ToListAsync();
                
                var results = templates.Select(t => new RuleSetTemplateDto
                {
                    Id = t.Id,
                    Name = t.Name,
                    Description = t.Description,
                    Category = t.Category,
                    RuleCategories = (t.RuleCategories ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries).ToList(),
                    RuleCount = 0,
                    IsBuiltIn = t.IsBuiltIn,
                    CreatedAt = t.CreatedAt
                }).ToList();

                return Ok(results);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[AdminController] GetTemplates CRITICAL Error: {ex}");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [Authorize(Policy = WafPolicies.RequirePlatformAdmin)] // Only platform admins can apply to ANY tenant
        [HttpPost("/api/templates/{id}/apply/{tenantId}")]
        public async Task<IActionResult> ApplyTemplate(string id, string tenantId, [FromBody] ApplyTemplateRequest request)
        {
            var template = await _context.RuleSetTemplates.IgnoreQueryFilters().FirstOrDefaultAsync(t => t.Id == id);
            if (template == null) return NotFound("Template not found");

            var tenant = await _context.Tenants.FindAsync(tenantId);
            if (tenant == null) return NotFound("Tenant not found");

            // Find all rules matching the categories in the template
            var categories = template.RuleCategories.Split(',', StringSplitOptions.RemoveEmptyEntries);
            var ruleIds = await _context.OWASPRules.IgnoreQueryFilters()
                .Where(r => categories.Contains(r.Category))
                .Select(r => r.RuleId)
                .ToListAsync();

            var ruleSet = new TenantRuleSet
            {
                TenantId = tenantId,
                Name = request.RuleSetName ?? $"{template.Name} Preset",
                Description = $"Created from {template.Name} template on {DateTime.UtcNow:d}",
                RuleIds = string.Join(",", ruleIds),
                SourceTemplateId = template.Id,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            _context.TenantRuleSets.Add(ruleSet);
            await _context.SaveChangesAsync();

            return Ok(new { ruleSetId = ruleSet.Id, ruleCount = ruleIds.Count });
        }

        [Authorize(Policy = WafPolicies.RequirePlatformAdmin)]
        [HttpPost("/api/templates")]
        public async Task<IActionResult> CreateTemplate([FromBody] CreateTemplateRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Name))
                return BadRequest(new { error = "Template name is required." });

            var template = new RuleSetTemplate
            {
                Name = request.Name.Trim(),
                Description = request.Description?.Trim() ?? string.Empty,
                Category = request.Category?.Trim() ?? "General",
                RuleCategories = string.Join(",", request.RuleCategories ?? new List<string>()),
                IsBuiltIn = false,
                CreatedAt = DateTime.UtcNow
            };

            _context.RuleSetTemplates.Add(template);
            await _context.SaveChangesAsync();

            return Ok(new RuleSetTemplateDto
            {
                Id = template.Id,
                Name = template.Name,
                Description = template.Description,
                Category = template.Category,
                RuleCategories = (template.RuleCategories ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries).ToList(),
                RuleCount = 0,
                IsBuiltIn = false,
                CreatedAt = template.CreatedAt
            });
        }

        [Authorize]
        [HttpPost("/api/templates/{id}/clone")]
        public async Task<IActionResult> CloneTemplate(string id)
        {
            var template = await _context.RuleSetTemplates.IgnoreQueryFilters().FirstOrDefaultAsync(t => t.Id == id);
            if (template == null) return NotFound("Template not found");

            var newTemplate = new RuleSetTemplate
            {
                Name = $"{template.Name} (Clone)",
                Description = template.Description,
                Category = template.Category,
                RuleCategories = template.RuleCategories,
                IsBuiltIn = false, // Clones are never built-in
                CreatedAt = DateTime.UtcNow
            };

            _context.RuleSetTemplates.Add(newTemplate);
            await _context.SaveChangesAsync();

            return Ok(newTemplate);
        }

        private string GenerateJwtToken(User user)
        {
            var jwtSecret = _configuration["Waf:JwtSecret"] ?? "default-secret-key-123-replace-in-production";
            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret));
            var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

            var claims = new[]
            {
                new Claim(ClaimTypes.Email, user.Email),
                new Claim("TenantId", user.TenantId),
                new Claim(ClaimTypes.Role, user.Role)
            };

            var token = new JwtSecurityToken(
                claims: claims,
                expires: DateTime.Now.AddDays(30),
                signingCredentials: creds
            );

            return new JwtSecurityTokenHandler().WriteToken(token);
        }

        [HttpPost("unimpersonate")]
        public IActionResult Unimpersonate()
        {
            // Restore the platform admin's own session from the HttpOnly backup cookie stashed
            // during Impersonate. Nothing here ever touches client-readable storage — the token
            // is only ever moved between HttpOnly cookies on the server's own response.
            if (!Request.Cookies.TryGetValue(AffiniSecurity.Waf.Security.CookieAuth.AdminBackupCookieName, out var adminToken)
                || string.IsNullOrEmpty(adminToken))
            {
                return BadRequest(new { error = "No active impersonation session to exit." });
            }

            AffiniSecurity.Waf.Security.CookieAuth.SetSessionCookie(Response, adminToken, _env.IsDevelopment());
            AffiniSecurity.Waf.Security.CookieAuth.ClearAdminBackupCookie(Response, _env.IsDevelopment());
            return Ok();
        }
    }
}

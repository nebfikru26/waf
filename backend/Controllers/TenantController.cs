using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using AffiniSecurity.Waf.Data;
using AffiniSecurity.Waf.Models;
using AffiniSecurity.Waf.Models.DTOs;
using AffiniSecurity.Waf.Services;

namespace AffiniSecurity.Waf.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class TenantController : ControllerBase
    {
        private readonly WafDbContext _context;

        public TenantController(WafDbContext context)
        {
            _context = context;
        }

        // GET: api/tenant
        [HttpGet]
        public async Task<ActionResult<IEnumerable<TenantDto>>> GetTenants()
        {
            var tenants = await _context.Tenants.IgnoreQueryFilters()
                .Select(t => new TenantDto
                {
                    Id = t.Id,
                    Name = t.Name,
                    Domain = t.Website,
                    CreatedAt = t.CreatedAt
                })
                .ToListAsync();
            return Ok(tenants);
        }

        // GET: api/tenant/{id}
        [HttpGet("{id}")]
        public async Task<ActionResult<TenantDetailDto>> GetTenant(string id)
        {
            var tenant = await _context.Tenants.IgnoreQueryFilters()
                .Include(t => t.Subscriptions)
                .Include(t => t.Members)
                .Include(t => t.Payment)
                .FirstOrDefaultAsync(t => t.Id == id);

            if (tenant == null)
                return NotFound();

            var settings = await _context.SecuritySettings.IgnoreQueryFilters()
                .FirstOrDefaultAsync(s => s.TenantId == id);
            
            if (settings == null)
            {
                settings = new SecuritySettings { TenantId = id };
                _context.SecuritySettings.Add(settings);
                await _context.SaveChangesAsync();
            }

            var dto = new TenantDetailDto
            {
                Id = tenant.Id,
                Name = tenant.Name,
                LegalName = tenant.LegalName ?? string.Empty,
                Domain = tenant.Website ?? string.Empty,
                ContactPhone = tenant.ContactPhone ?? string.Empty,
                ContactEmail = tenant.ContactEmail ?? string.Empty,
                Address = tenant.Address ?? string.Empty,
                Industry = tenant.Industry ?? string.Empty,
                Manager = tenant.Manager ?? string.Empty,
                IsActive = tenant.IsActive,
                IsProfileComplete = tenant.IsProfileComplete,
                OnboardingStep = tenant.OnboardingStep,
                CreatedAt = tenant.CreatedAt,
                Subscriptions = tenant.Subscriptions?.Select(s => new ServiceSubscriptionDto
                {
                    Id = s.Id,
                    TenantId = s.TenantId,
                    ServiceName = s.ServiceName,
                    SubscribedAt = s.SubscribedAt,
                    Expiration = s.Expiration
                }).ToList() ?? new List<ServiceSubscriptionDto>(),
                PaymentInfo = tenant.Payment != null ? new PaymentInfoDto
                {
                    Id = tenant.Payment.Id,
                    TenantId = tenant.Payment.TenantId,
                    Plan = tenant.Payment.Plan,
                    Amount = tenant.Payment.Amount,
                    NextPaymentDate = tenant.Payment.NextPaymentDate,
                    Status = tenant.Payment.Status
                } : null,
                Members = tenant.Members?.Select(m => new TenantMemberDto
                {
                    Id = m.Id,
                    TenantId = m.TenantId,
                    Email = m.Email,
                    Role = m.Role,
                    JoinedAt = m.JoinedAt
                }).ToList() ?? new List<TenantMemberDto>(),
                MlDetectionEnabled = settings.MlDetectionEnabled,
                WafMode = settings.WafMode
            };

            return Ok(dto);
        }

        [HttpPost]
        [Microsoft.AspNetCore.Authorization.Authorize(Policy = AffiniSecurity.Waf.Security.WafPolicies.RequirePlatformAdmin)]
        public async Task<ActionResult<TenantDto>> CreateTenant([FromBody] TenantDto tenantDto)
        {
            // Check if user already exists if admin details are provided
            if (!string.IsNullOrEmpty(tenantDto.AdminEmail))
            {
                if (await _context.Users.IgnoreQueryFilters().AnyAsync(u => u.Email == tenantDto.AdminEmail))
                {
                    return BadRequest(new { error = "A user with this email address already exists." });
                }
            }

            var tenant = new Tenant
            {
                Id = System.Guid.NewGuid().ToString(),
                Name = tenantDto.Name,
                LegalName = string.IsNullOrWhiteSpace(tenantDto.LegalName) ? tenantDto.Name : tenantDto.LegalName,
                TinNo = tenantDto.TinNo,
                LicenseNo = tenantDto.LicenseNo,
                Category = tenantDto.Category,
                Industry = tenantDto.Industry,
                Address = tenantDto.Address,
                Website = tenantDto.Domain,
                CreatedAt = System.DateTime.UtcNow,
                IsActive = true,
                OnboardingStep = 1 // Start at step 1 just like registration
            };

            _context.Tenants.Add(tenant);

            // Create Admin User if details provided
            if (!string.IsNullOrEmpty(tenantDto.AdminEmail) && !string.IsNullOrEmpty(tenantDto.AdminPassword))
            {
                var user = new User
                {
                    Email = tenantDto.AdminEmail,
                    Name = tenantDto.AdminName ?? "Administrator",
                    Password = BCrypt.Net.BCrypt.HashPassword(tenantDto.AdminPassword),
                    Role = "tenant_admin",
                    TenantId = tenant.Id,
                    Phone = tenantDto.AdminPhone ?? string.Empty,
                    JobTitle = "Administrator",
                    Bio = string.Empty
                };
                _context.Users.Add(user);
            }

            await _context.SaveChangesAsync();

            var created = new TenantDto
            {
                Id = tenant.Id,
                Name = tenant.Name,
                LegalName = tenant.LegalName,
                TinNo = tenant.TinNo ?? string.Empty,
                LicenseNo = tenant.LicenseNo ?? string.Empty,
                Category = tenant.Category ?? string.Empty,
                Industry = tenant.Industry ?? string.Empty,
                Address = tenant.Address ?? string.Empty,
                Domain = tenant.Website ?? string.Empty,
                CreatedAt = tenant.CreatedAt
            };
            return CreatedAtAction(nameof(GetTenant), new { id = tenant.Id }, created);
        }

        // PUT: api/tenant/{id}
        [HttpPut("{id}")]
        [Microsoft.AspNetCore.Authorization.Authorize(Policy = AffiniSecurity.Waf.Security.WafPolicies.RequirePlatformAdmin)]
        public async Task<IActionResult> UpdateTenant(
            string id, 
            [FromBody] UpdateTenantRequest request,
            [FromServices] IRedisService redisService,
            [FromServices] WafConfigGenerator configGenerator)
        {
            var tenant = await _context.Tenants.FindAsync(id);
            if (tenant == null)
                return NotFound();

            if (request.Name != null) tenant.Name = request.Name;
            if (request.LegalName != null) tenant.LegalName = request.LegalName;
            if (request.Domain != null) tenant.Website = request.Domain;
            if (request.ContactEmail != null) tenant.ContactEmail = request.ContactEmail;
            if (request.ContactPhone != null) tenant.ContactPhone = request.ContactPhone;
            if (request.Address != null) tenant.Address = request.Address;
            if (request.Industry != null) tenant.Industry = request.Industry;
            if (request.Manager != null) tenant.Manager = request.Manager;
            if (request.IsActive.HasValue) tenant.IsActive = request.IsActive.Value;
            if (request.OnboardingStep.HasValue) tenant.OnboardingStep = request.OnboardingStep.Value;

            _context.Tenants.Update(tenant);
            await _context.SaveChangesAsync();

            if (request.MlDetectionEnabled.HasValue || request.WafMode != null)
            {
                var settings = await _context.SecuritySettings.IgnoreQueryFilters()
                    .FirstOrDefaultAsync(s => s.TenantId == id);
                if (settings == null)
                {
                    settings = new SecuritySettings { TenantId = id };
                    _context.SecuritySettings.Add(settings);
                }

                if (request.MlDetectionEnabled.HasValue)
                    settings.MlDetectionEnabled = request.MlDetectionEnabled.Value;
                if (request.WafMode != null)
                    settings.WafMode = request.WafMode;

                _context.SecuritySettings.Update(settings);
                await _context.SaveChangesAsync();

                // Sync to Redis
                var isEnabledStr = settings.MlDetectionEnabled.ToString().ToLower();
                await redisService.SetValueAsync($"tenant:ai:{settings.TenantId}:enabled", isEnabledStr);

                var domains = await _context.Domains
                    .IgnoreQueryFilters()
                    .Where(d => d.TenantId == settings.TenantId)
                    .ToListAsync();

                foreach (var domain in domains)
                {
                    if (!string.IsNullOrEmpty(domain.DomainName))
                    {
                        await redisService.SetValueAsync($"tenant:ai:{domain.DomainName}:enabled", isEnabledStr);
                    }
                }

                // Trigger config generation
                await configGenerator.GenerateAndReloadAsync();
            }

            return NoContent();
        }

        // DELETE: api/tenant/{id}
        [HttpDelete("{id}")]
        [Microsoft.AspNetCore.Authorization.Authorize(Policy = AffiniSecurity.Waf.Security.WafPolicies.RequirePlatformAdmin)]
        public async Task<IActionResult> DeleteTenant(string id)
        {
            var tenant = await _context.Tenants.FindAsync(id);
            if (tenant == null)
                return NotFound();

            _context.Tenants.Remove(tenant);
            await _context.SaveChangesAsync();
            return NoContent();
        }
    }
}

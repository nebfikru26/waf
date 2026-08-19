using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using AffiniSecurity.Waf.Data;
using AffiniSecurity.Waf.Models;
using Microsoft.EntityFrameworkCore;
using BCrypt.Net;
using AffiniSecurity.Waf.Security;

namespace AffiniSecurity.Waf.Controllers
{
    [Authorize(Policy = WafPolicies.RequirePlatformAdmin)]
    [ApiController]
    [Route("api/clients")]
    public class ClientsController : ControllerBase
    {
        private readonly WafDbContext _context;

        public ClientsController(WafDbContext context)
        {
            _context = context;
        }

        [HttpGet]
        public async Task<IActionResult> GetAllClients()
        {
            // Return ALL tenants (joined with primary user info for display)
            var systemTenantName = "AffiniSecurity Global";

            var tenants = await _context.Tenants.IgnoreQueryFilters()
                .Where(t => t.Name != systemTenantName)
                .OrderBy(t => t.Name)
                .ToListAsync();

            var allUsers = await _context.Users.IgnoreQueryFilters().ToListAsync();

            var subs = await _context.Subscriptions.IgnoreQueryFilters().ToListAsync();

            var result = tenants.Select(t =>
            {
                var primaryUser = allUsers
                    .Where(u => u.TenantId == t.Id)
                    .OrderBy(u => u.Role == "tenant_admin" ? 0 : 1)
                    .FirstOrDefault();

                var sub = subs.FirstOrDefault(s => s.TenantId == t.Id);

                return new
                {
                    id = primaryUser?.Id ?? t.Id,
                    tenantId = t.Id,
                    name = !string.IsNullOrWhiteSpace(t.Name) ? t.Name : t.LegalName,
                    legalName = t.LegalName ?? string.Empty,
                    email = primaryUser?.Email ?? t.ContactEmail ?? string.Empty,
                    phone = primaryUser?.Phone ?? t.ContactPhone ?? string.Empty,
                    jobTitle = primaryUser?.JobTitle ?? "Tenant Admin",
                    role = primaryUser?.Role ?? "tenant_admin",
                    industry = t.Industry ?? string.Empty,
                    address = t.Address ?? string.Empty,
                    website = t.Website ?? string.Empty,
                    plan = sub?.PlanName ?? "Free",
                    isActive = t.IsActive,
                    createdAt = t.CreatedAt.ToString("o")
                };
            }).ToList();

            return Ok(result);
        }

        [HttpPost]
        public async Task<IActionResult> RegisterClient([FromBody] ClientRegistrationModel model)
        {
            // 1. Create Tenant
            var tenant = new Tenant
            {
                Name = model.Name ?? model.LegalName,
                LegalName = model.LegalName,
                Manager = model.Manager,
                LicenseNo = model.LicenseNo,
                TinNo = model.TinNo,
                Address = model.Address,
                Category = model.Category,
                Industry = model.Industry,
                ContactPhone = model.ContactPhone,
                ContactEmail = model.ContactEmail,
                ContactPerson = model.ContactPerson,
                Website = model.Website,
                IsProfileComplete = true
            };

            _context.Tenants.Add(tenant);

            // 2. Create User
            var user = new User
            {
                Email = model.UserEmail,
                Name = model.UserName,
                Phone = model.UserPhone,
                JobTitle = model.UserTitle,
                Bio = string.Empty,
                Role = "tenant_admin",
                Password = BCrypt.Net.BCrypt.HashPassword(model.Password),
                TenantId = tenant.Id
            };

            _context.Users.Add(user);

            // 3. Create Default Subscription (Free)
            var sub = new Subscription
            {
                TenantId = tenant.Id,
                PlanName = "Free",
                Status = "active",
                Gateway = "System"
            };
            _context.Subscriptions.Add(sub);

            await _context.SaveChangesAsync();

            return Ok(new { tenant, user });
        }
    }

    public class ClientRegistrationModel
    {
        public string LegalName { get; set; }
        public string Name { get; set; }
        public string Manager { get; set; }
        public string LicenseNo { get; set; }
        public string TinNo { get; set; }
        public string Address { get; set; }
        public string Category { get; set; }
        public string Industry { get; set; }
        public string ContactPhone { get; set; }
        public string ContactEmail { get; set; }
        public string ContactPerson { get; set; }
        public string Website { get; set; }

        public string UserEmail { get; set; }
        public string UserName { get; set; }
        public string Password { get; set; }
        public string UserPhone { get; set; }
        public string UserTitle { get; set; }
    }
}

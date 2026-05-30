using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using AffiniSecurity.Waf.Data;
using AffiniSecurity.Waf.Models;
using Microsoft.EntityFrameworkCore;
using BCrypt.Net;

namespace AffiniSecurity.Waf.Controllers
{
    [Authorize(Roles = "super_admin,support_engineer,admin")]
    [ApiController]
    [Route("api/clients")]
    public class ClientsController : ControllerBase
    {
        private readonly WafDbContext _context;

        public ClientsController(WafDbContext context)
        {
            _context = context;
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

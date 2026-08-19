using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using AffiniSecurity.Waf.Data;
using AffiniSecurity.Waf.Models;
using Microsoft.EntityFrameworkCore;

namespace AffiniSecurity.Waf.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/company")]
    public class CompanyController : ControllerBase
    {
        private readonly WafDbContext _context;
        private readonly Services.ITenantService _tenantService;
        private readonly IConfiguration _configuration;

        public CompanyController(WafDbContext context, Services.ITenantService tenantService, IConfiguration configuration)
        {
            _context = context;
            _tenantService = tenantService;
            _configuration = configuration;
        }

        [HttpGet]
        public async Task<IActionResult> GetCompany()
        {
            var tenantId = _tenantService.TenantId;
            if (string.IsNullOrEmpty(tenantId)) return BadRequest(new { error = "Organizational context missing." });

            var tenant = await _context.Tenants.FindAsync(tenantId);
            if (tenant == null) return NotFound();

            return Ok(tenant);
        }

        [HttpPut]
        public async Task<IActionResult> UpdateCompany([FromBody] Tenant profile)
        {
            var tenantId = _tenantService.TenantId;
            if (string.IsNullOrEmpty(tenantId)) return BadRequest(new { error = "Unable to identify your organization context. Please refresh the page or log in again." });

            var tenant = await _context.Tenants.FindAsync(tenantId);
            if (tenant == null) return NotFound();

            if (profile.Name != null) tenant.Name = profile.Name;
            if (profile.LegalName != null) tenant.LegalName = profile.LegalName;
            if (profile.Manager != null) tenant.Manager = profile.Manager;
            if (profile.LicenseNo != null) tenant.LicenseNo = profile.LicenseNo;
            if (profile.TinNo != null) tenant.TinNo = profile.TinNo;
            if (profile.Category != null) tenant.Category = profile.Category;
            if (profile.Industry != null) tenant.Industry = profile.Industry;
            if (profile.Address != null) tenant.Address = profile.Address;
            if (profile.ContactEmail != null) tenant.ContactEmail = profile.ContactEmail;
            if (profile.ContactPhone != null) tenant.ContactPhone = profile.ContactPhone;
            if (profile.Website != null) tenant.Website = profile.Website;
            if (profile.OnboardingStep != 0) tenant.OnboardingStep = profile.OnboardingStep;
            
            tenant.IsProfileComplete = true;

            try 
            {
                await _context.SaveChangesAsync();
                return Ok(tenant);
            }
            catch (Exception ex)
            {
                var message = ex.InnerException?.Message ?? ex.Message;
                return StatusCode(500, new { error = "Database update failed", details = message });
            }
        }

        [HttpPost("upload-logo")]
        public async Task<IActionResult> UploadLogo(IFormFile file)
        {
            if (file == null || file.Length == 0)
                return BadRequest(new { error = "No file uploaded." });

            var allowedExtensions = new[] { ".svg", ".png", ".jpg", ".jpeg" };
            var extension = Path.GetExtension(file.FileName).ToLower();

            if (!allowedExtensions.Contains(extension))
                return BadRequest(new { error = "Invalid file type. Only SVG, PNG, and JPG are allowed." });

            var tenantId = _tenantService.TenantId;
            if (string.IsNullOrEmpty(tenantId)) return Unauthorized();

            var fileName = $"{tenantId}_{DateTime.UtcNow.Ticks}{extension}";
            var folderPath = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", "uploads", "logos");
            
            if (!Directory.Exists(folderPath))
                Directory.CreateDirectory(folderPath);

            var filePath = Path.Combine(folderPath, fileName);

            using (var stream = new FileStream(filePath, FileMode.Create))
            {
                await file.CopyToAsync(stream);
            }

            // Return the relative public URL to avoid SSRF triggers in WAF
            var logoUrl = $"/uploads/logos/{fileName}";

            return Ok(new { logoUrl });
        }
    }
}

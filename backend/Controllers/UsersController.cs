using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using AffiniSecurity.Waf.Data;
using AffiniSecurity.Waf.Models;
using Microsoft.EntityFrameworkCore;
using BCrypt.Net;
using System.Text.Json.Serialization;
using AffiniSecurity.Waf.Security;

namespace AffiniSecurity.Waf.Controllers
{
    [Authorize(Policy = WafPolicies.RequireFirewallManager)]
    [ApiController]
    [Route("api/users")]
    public class UsersController : ControllerBase
    {
        private readonly WafDbContext _context;

        public UsersController(WafDbContext context)
        {
            _context = context;
        }

        [HttpGet]
        public async Task<IActionResult> GetUsers()
        {
            // Only admins can see all users, or tenant admins see their own users
            var role = User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value;
            var tenantId = HttpContext.Items["TenantId"]?.ToString();

            if (role == "super_admin" || role == "support_engineer" || role == "admin")
            {
                return Ok(await _context.Users.IgnoreQueryFilters().ToListAsync());
            }
            
            if (string.IsNullOrEmpty(tenantId)) return BadRequest(new { error = "Organizational context is missing. Please ensure you are logged in correctly." });
            
            return Ok(await _context.Users.Where(u => u.TenantId == tenantId).ToListAsync());
        }

        [HttpPost]
        public async Task<IActionResult> CreateUser([FromBody] UserCreateModel model)
        {
            var role = User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value;
            var tenantId = HttpContext.Items["TenantId"]?.ToString();

            // Permission check
            if (role != "super_admin" && role != "support_engineer" && role != "tenant_admin" && role != "admin")
            {
                return Forbid();
            }

            var user = new User
            {
                Email = model.Email,
                Name = model.Name,
                Phone = model.Phone,
                JobTitle = model.JobTitle,
                Bio = string.Empty,
                Role = model.Role,
                Password = BCrypt.Net.BCrypt.HashPassword(model.Password),
                TenantId = (role == "super_admin" || role == "support_engineer") ? model.TenantId ?? tenantId! : tenantId!
            };

            _context.Users.Add(user);
            await _context.SaveChangesAsync();
            return Ok(user);
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteUser(string id)
        {
            var role = User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value;
            var tenantId = HttpContext.Items["TenantId"]?.ToString();
            
            var user = await _context.Users.IgnoreQueryFilters().FirstOrDefaultAsync(u => u.Id == id);
            if (user == null) return NotFound(new { error = "The specified user account could not be found." });
            
            if (role != "super_admin" && role != "support_engineer" && user.TenantId != tenantId)
                return Forbid();

            _context.Users.Remove(user);
            await _context.SaveChangesAsync();
            return Ok();
        }

        [HttpPatch("{id}")]
        public async Task<IActionResult> UpdateUser(string id, [FromBody] UserUpdateModel model)
        {
            var role = User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value;
            var tenantId = HttpContext.Items["TenantId"]?.ToString();
            
            var user = await _context.Users.IgnoreQueryFilters().FirstOrDefaultAsync(u => u.Id == id);
            if (user == null) return NotFound(new { error = "The specified user account could not be found." });

            if (role != "super_admin" && role != "support_engineer" && user.TenantId != tenantId)
                return Forbid();

            if (model.Name != null) user.Name = model.Name;
            if (model.Phone != null) user.Phone = model.Phone;
            if (model.JobTitle != null) user.JobTitle = model.JobTitle;
            if (model.Role != null) user.Role = model.Role;
            if (model.IsActive.HasValue) user.IsActive = model.IsActive.Value;

            await _context.SaveChangesAsync();
            return Ok(user);
        }

        [HttpPost("{id}/reset-password")]
        public async Task<IActionResult> ResetPassword(string id)
        {
            var role = User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value;
            var tenantId = HttpContext.Items["TenantId"]?.ToString();
            
            var user = await _context.Users.IgnoreQueryFilters().FirstOrDefaultAsync(u => u.Id == id);
            if (user == null) return NotFound(new { error = "The specified user account could not be found." });

            if (role != "super_admin" && role != "support_engineer" && user.TenantId != tenantId)
                return Forbid();

            // Simulate sending email
            return Ok(new { message = $"Password reset instructions sent to {user.Email}" });
        }
    }

    public class UserCreateModel
    {
        [JsonPropertyName("email")]
        public string Email { get; set; }
        [JsonPropertyName("name")]
        public string Name { get; set; }
        [JsonPropertyName("password")]
        public string Password { get; set; }
        [JsonPropertyName("phone")]
        public string Phone { get; set; }
        [JsonPropertyName("jobTitle")]
        public string JobTitle { get; set; }
        [JsonPropertyName("role")]
        public string Role { get; set; }
        [JsonPropertyName("tenantId")]
        public string TenantId { get; set; }
    }

    public class UserUpdateModel
    {
        [JsonPropertyName("name")]
        public string? Name { get; set; }
        [JsonPropertyName("phone")]
        public string? Phone { get; set; }
        [JsonPropertyName("jobTitle")]
        public string? JobTitle { get; set; }
        [JsonPropertyName("role")]
        public string? Role { get; set; }
        [JsonPropertyName("isActive")]
        public bool? IsActive { get; set; }
    }
}

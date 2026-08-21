using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using AffiniSecurity.Waf.Data;
using AffiniSecurity.Waf.Models;
using Microsoft.EntityFrameworkCore;
using System;
using System.Linq;
using System.Threading.Tasks;

namespace AffiniSecurity.Waf.Controllers
{
    /// <summary>
    /// Public marketing-site contact form. There is no SMTP/email-sending service anywhere in
    /// this backend, so submissions are persisted for a platform admin to review rather than
    /// silently dropped.
    /// </summary>
    [ApiController]
    [Route("api/contact")]
    public class ContactController : ControllerBase
    {
        private readonly WafDbContext _context;

        public ContactController(WafDbContext context)
        {
            _context = context;
        }

        public class ContactRequest
        {
            public string Name { get; set; } = string.Empty;
            public string Email { get; set; } = string.Empty;
            public string? Subject { get; set; }
            public string Message { get; set; } = string.Empty;
        }

        [HttpPost]
        [AllowAnonymous]
        public async Task<IActionResult> Submit([FromBody] ContactRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Name) || string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Message))
                return BadRequest(new { error = "Name, email, and message are required." });

            var entry = new ContactMessage
            {
                Name = request.Name.Trim(),
                Email = request.Email.Trim(),
                Subject = request.Subject?.Trim(),
                Message = request.Message.Trim(),
                IpAddress = HttpContext.Connection.RemoteIpAddress?.ToString(),
            };

            _context.ContactMessages.Add(entry);
            await _context.SaveChangesAsync();

            return Ok(new { success = true, id = entry.Id });
        }

        // Platform-admin-only inbox for reviewing submissions, since there is no email delivery.
        [HttpGet]
        [Authorize]
        public async Task<IActionResult> List([FromQuery] int limit = 100)
        {
            if (!User.IsInRole("admin") && !User.IsInRole("super_admin") && !User.IsInRole("support_engineer"))
                return Forbid();

            var messages = await _context.ContactMessages
                .OrderByDescending(m => m.CreatedAt)
                .Take(Math.Clamp(limit, 1, 500))
                .ToListAsync();

            return Ok(messages);
        }

        [HttpPut("{id}/status")]
        [Authorize]
        public async Task<IActionResult> UpdateStatus(string id, [FromBody] UpdateStatusRequest request)
        {
            if (!User.IsInRole("admin") && !User.IsInRole("super_admin") && !User.IsInRole("support_engineer"))
                return Forbid();

            var message = await _context.ContactMessages.FirstOrDefaultAsync(m => m.Id == id);
            if (message == null) return NotFound();

            message.Status = request.Status;
            await _context.SaveChangesAsync();
            return Ok(message);
        }

        public class UpdateStatusRequest
        {
            public string Status { get; set; } = "New";
        }
    }
}

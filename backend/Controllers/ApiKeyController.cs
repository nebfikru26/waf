using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using AffiniSecurity.Waf.Data;
using AffiniSecurity.Waf.Models;
using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography;
using System.Text;

namespace AffiniSecurity.Waf.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize(Roles = "tenant_admin,super_admin,admin")]
    public class ApiKeyController : ControllerBase
    {
        private readonly WafDbContext _context;

        public ApiKeyController(WafDbContext context)
        {
            _context = context;
        }

        [HttpGet]
        public async Task<IActionResult> GetApiKeys()
        {
            var keys = await _context.ApiKeys
                .OrderByDescending(k => k.CreatedAt)
                .Select(k => new {
                    k.Id,
                    k.Name,
                    k.Prefix,
                    k.CreatedAt,
                    k.ExpiresAt,
                    k.LastUsedAt,
                    k.IsRevoked
                })
                .ToListAsync();

            return Ok(keys);
        }

        public class CreateApiKeyRequest
        {
            public string Name { get; set; } = string.Empty;
            public int? ExpirationDays { get; set; }
        }

        [HttpPost]
        public async Task<IActionResult> CreateApiKey([FromBody] CreateApiKeyRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.Name))
                return BadRequest(new { error = "Name is required" });

            // Generate a secure 32-byte random string
            var rawBytes = new byte[32];
            using (var rng = RandomNumberGenerator.Create())
            {
                rng.GetBytes(rawBytes);
            }
            
            // Format: affini_base64url...
            var keySecret = "affini_" + Convert.ToBase64String(rawBytes)
                .Replace('+', '-')
                .Replace('/', '_')
                .TrimEnd('=');

            // Hash it for DB storage
            using var sha256 = SHA256.Create();
            var hashBytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(keySecret));
            var hashString = Convert.ToBase64String(hashBytes);

            var apiKey = new ApiKey
            {
                Name = req.Name,
                KeyHash = hashString,
                Prefix = keySecret.Substring(0, 11) + "...", // affini_xxxx...
                ExpiresAt = req.ExpirationDays.HasValue ? DateTime.UtcNow.AddDays(req.ExpirationDays.Value) : null
            };

            _context.ApiKeys.Add(apiKey);
            await _context.SaveChangesAsync();

            // ONLY time the full secret is returned!
            return Ok(new
            {
                apiKey.Id,
                apiKey.Name,
                apiKey.Prefix,
                apiKey.CreatedAt,
                apiKey.ExpiresAt,
                secret = keySecret // ONLY RETURNED ONCE
            });
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> RevokeApiKey(string id)
        {
            var apiKey = await _context.ApiKeys.FirstOrDefaultAsync(k => k.Id == id);
            if (apiKey == null) return NotFound();

            apiKey.IsRevoked = true;
            await _context.SaveChangesAsync();

            return Ok(new { success = true });
        }
    }
}

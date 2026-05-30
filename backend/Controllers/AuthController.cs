using Microsoft.AspNetCore.Mvc;
using AffiniSecurity.Waf.Data;
using AffiniSecurity.Waf.Models;
using AffiniSecurity.Waf.DTOs;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using BCrypt.Net;

namespace AffiniSecurity.Waf.Controllers
{
    [ApiController]
    [Route("api/auth")]
    public class AuthController : ControllerBase
    {
        private readonly WafDbContext _context;
        private readonly IConfiguration _configuration;

        public AuthController(WafDbContext context, IConfiguration configuration)
        {
            _context = context;
            _configuration = configuration;
        }

        [HttpGet("ping")]
        public IActionResult Ping()
        {
            return Ok(new { message = "pong", timestamp = DateTime.UtcNow });
        }

        [HttpGet("debug-users")]
        public async Task<IActionResult> DebugUsers()
        {
            var users = await _context.Users.IgnoreQueryFilters()
                .Select(u => new { u.Email, u.Role, u.TenantId, u.IsActive })
                .ToListAsync();
            return Ok(users);
        }

        [HttpPost("signup")]
        public async Task<IActionResult> Signup([FromBody] SignupRequest request)
        {
            Console.WriteLine($"[Signup] Attempt for: {request.Email} ({request.CompanyName})");
            if (await _context.Users.IgnoreQueryFilters().AnyAsync(u => u.Email == request.Email))
            {
                Console.WriteLine($"[Signup] Email already exists: {request.Email}");
                return BadRequest(new { error = "A user with this email address already exists. Please try logging in or use a different email." });
            }

            if (!string.IsNullOrEmpty(request.Phone) && await _context.Users.IgnoreQueryFilters().AnyAsync(u => u.Phone == request.Phone))
            {
                Console.WriteLine($"[Signup] Phone already exists: {request.Phone}");
                return BadRequest(new { error = "This phone number is already registered to another account." });
            }

            var companyName = string.IsNullOrEmpty(request.CompanyName) ? $"{request.Name}'s Org" : request.CompanyName;
            if (await _context.Tenants.IgnoreQueryFilters().AnyAsync(t => t.Name == companyName))
            {
                Console.WriteLine($"[Signup] Company already exists: {companyName}");
                return BadRequest(new { error = "An organization with this name already exists. Please choose a unique name." });
            }

            var tenant = new Tenant 
            { 
                Name = string.IsNullOrEmpty(request.CompanyName) ? $"{request.Name}'s Org" : request.CompanyName,
                LegalName = string.IsNullOrEmpty(request.CompanyName) ? $"{request.Name}'s Org" : request.CompanyName,
                Manager = request.Name,
                LicenseNo = "PENDING",
                TinNo = "PENDING",
                Address = "PENDING",
                Industry = "Other",
                Category = "Private",
                ContactPhone = "PENDING",
                ContactEmail = request.Email,
                ContactPerson = request.Name,
                Website = "https://",
                IsProfileComplete = false
            };

            var user = new User
            {
                Email = request.Email,
                Name = request.Name,
                Password = BCrypt.Net.BCrypt.HashPassword(request.Password),
                Role = "tenant_admin",
                TenantId = tenant.Id,
                Phone = request.Phone,
                JobTitle = "Administrator",
                Bio = string.Empty
            };

            _context.Tenants.Add(tenant);
            _context.Users.Add(user);
            await _context.SaveChangesAsync();

            var subscription = await _context.Subscriptions.IgnoreQueryFilters()
                .Where(s => s.TenantId == tenant.Id && s.Status == "active")
                .OrderByDescending(s => s.CreatedAt)
                .FirstOrDefaultAsync();
            PlanConfig? planConfig = null;
            if (subscription != null)
                planConfig = await _context.PlanConfigs.FirstOrDefaultAsync(p => p.Name.ToLower() == subscription.PlanName.ToLower());

            if (planConfig == null)
                planConfig = await _context.PlanConfigs.FirstOrDefaultAsync(p => p.Name == "Free");

            var token = GenerateJwtToken(user);
            return Ok(new AuthResponse { 
                Token = token, 
                User = user, 
                Tenant = new Tenant {
                    Id = tenant.Id,
                    Name = tenant.Name,
                    PrimaryColor = "#3b82f6",
                    IsActive = true
                }, 
                Plan = subscription ?? new Subscription { TenantId = tenant.Id, PlanName = "Free" },
                PlanConfig = planConfig
            });
        }

        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginRequest request)
        {
            Console.WriteLine($"[Login] Attempt for: {request.Email}");
            var user = await _context.Users.IgnoreQueryFilters().FirstOrDefaultAsync(u => u.Email == request.Email);
            
            if (user == null)
            {
                Console.WriteLine($"[Login] User NOT found: {request.Email}");
                return Unauthorized(new { error = "Invalid email or password. Please verify your credentials and try again." });
            }

            if (!BCrypt.Net.BCrypt.Verify(request.Password, user.Password))
            {
                Console.WriteLine($"[Login] Password mismatch for: {request.Email}");
                return Unauthorized(new { error = "Invalid email or password. Please verify your credentials and try again." });
            }

            if (!user.IsActive)
            {
                Console.WriteLine($"[Login] Account suspended: {request.Email}");
                return StatusCode(403, new { error = "Your account has been suspended. Please contact system support for assistance." });
            }

            var tenant = await _context.Tenants.IgnoreQueryFilters().FirstOrDefaultAsync(t => t.Id == user.TenantId);
            if (tenant == null)
            {
                Console.WriteLine($"[Login] Tenant NOT found or blocked by RLS: {user.TenantId}");
                return StatusCode(403, new { error = "Your organization could not be verified. Please contact system support." });
            }

            var subscription = await _context.Subscriptions.IgnoreQueryFilters()
                .Where(s => s.TenantId == user.TenantId && s.Status == "active")
                .OrderByDescending(s => s.CreatedAt)
                .FirstOrDefaultAsync();
            PlanConfig? planConfig = null;
            if (subscription != null)
                planConfig = await _context.PlanConfigs.IgnoreQueryFilters().FirstOrDefaultAsync(p => p.Name.ToLower() == subscription.PlanName.ToLower());

            if (planConfig == null)
                planConfig = await _context.PlanConfigs.IgnoreQueryFilters().FirstOrDefaultAsync(p => p.Name == "Free");

            var token = GenerateJwtToken(user);
            return Ok(new AuthResponse { 
                Token = token, 
                User = user, 
                Tenant = new Tenant {
                    Id = tenant.Id,
                    Name = tenant.Name,
                    Address = tenant.Address,
                    Industry = tenant.Industry,
                    ContactPhone = tenant.ContactPhone,
                    ContactEmail = tenant.ContactEmail,
                    IsProfileComplete = tenant.IsProfileComplete,
                    LogoUrl = tenant.LogoUrl,
                    PrimaryColor = tenant.PrimaryColor,
                    BrandName = tenant.BrandName
                }, 
                Plan = subscription ?? new Subscription { TenantId = user.TenantId, PlanName = "Free" },
                PlanConfig = planConfig
            });
        }

        private string GenerateJwtToken(User user)
        {
            var jwtSecret = _configuration["Waf:JwtSecret"] ?? "default-secret-key-123-replace-in-production";
            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret));
            var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

            var claims = new[]
            {
                new Claim(ClaimTypes.Email, user.Email),
                new Claim("tenant_id", user.TenantId),
                new Claim(ClaimTypes.Role, user.Role)
            };

            var token = new JwtSecurityToken(
                claims: claims,
                expires: DateTime.Now.AddDays(30),
                signingCredentials: creds
            );

            return new JwtSecurityTokenHandler().WriteToken(token);
        }
    }
}

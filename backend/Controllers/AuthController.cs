using Microsoft.AspNetCore.Mvc;
using AffiniSecurity.Waf.Data;
using AffiniSecurity.Waf.Models;
using AffiniSecurity.Waf.DTOs;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Linq;
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
        private readonly IWebHostEnvironment _env;

        public AuthController(WafDbContext context, IConfiguration configuration, IWebHostEnvironment env)
        {
            _context = context;
            _configuration = configuration;
            _env = env;
        }

        [HttpGet("ping")]
        public IActionResult Ping()
        {
            return Ok(new { message = "pong", timestamp = DateTime.UtcNow });
        }

        [HttpPost("logout")]
        public IActionResult Logout()
        {
            // Clear both the active session cookie and any stashed admin-impersonation
            // backup cookie so no residual HttpOnly credential is left behind.
            AffiniSecurity.Waf.Security.CookieAuth.ClearSessionCookie(Response, _env.IsDevelopment());
            AffiniSecurity.Waf.Security.CookieAuth.ClearAdminBackupCookie(Response, _env.IsDevelopment());
            return Ok(new { message = "Logged out." });
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
                Name = companyName,
                LegalName = string.IsNullOrWhiteSpace(request.LegalName) ? companyName : request.LegalName,
                Manager = request.Name,
                LicenseNo = string.IsNullOrWhiteSpace(request.LicenseNo) ? "PENDING" : request.LicenseNo,
                TinNo = string.IsNullOrWhiteSpace(request.TinNo) ? "PENDING" : request.TinNo,
                Address = string.IsNullOrWhiteSpace(request.Address) ? "PENDING" : request.Address,
                Industry = string.IsNullOrWhiteSpace(request.Industry) ? "Other" : request.Industry,
                Category = string.IsNullOrWhiteSpace(request.Category) ? "Private" : request.Category,
                ContactPhone = request.Phone,
                ContactEmail = request.Email,
                ContactPerson = request.Name,
                Website = "https://",
                IsProfileComplete = false,
                OnboardingStep = 1
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
            AffiniSecurity.Waf.Security.CookieAuth.SetSessionCookie(Response, token, _env.IsDevelopment());
            return Ok(new AuthResponse { 
                Token = token, 
                User = new UserDTO {
                    Id = user.Id,
                    Email = user.Email,
                    Name = user.Name,
                    Role = user.Role,
                    TenantId = user.TenantId,
                    Permissions = AffiniSecurity.Waf.Security.WafPermissions.GetPermissionsForRole(user.Role).ToList()
                }, 
                Tenant = new TenantDTO {
                    Id = tenant.Id,
                    Name = tenant.Name,
                    LegalName = tenant.LegalName,
                    TinNo = tenant.TinNo,
                    LicenseNo = tenant.LicenseNo,
                    Category = tenant.Category,
                    Industry = tenant.Industry,
                    Manager = tenant.Manager,
                    Address = tenant.Address,
                    ContactEmail = tenant.ContactEmail,
                    ContactPhone = tenant.ContactPhone,
                    PrimaryColor = "#3b82f6",
                    IsProfileComplete = tenant.IsProfileComplete,
                    OnboardingStep = tenant.OnboardingStep
                }, 
                Plan = new SubscriptionDTO {
                    Id = subscription?.Id ?? Guid.NewGuid().ToString(),
                    PlanName = subscription?.PlanName ?? "Free",
                    Status = subscription?.Status ?? "Active"
                },
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
                Console.WriteLine($"[Login] Requested Password Length: {request.Password?.Length}");
                Console.WriteLine($"[Login] Stored Hash Length: {user.Password?.Length}");
                Console.WriteLine($"[Login] Stored Hash Start: {user.Password?.Substring(0, 10)}");
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
            AffiniSecurity.Waf.Security.CookieAuth.SetSessionCookie(Response, token, _env.IsDevelopment());
            return Ok(new AuthResponse { 
                Token = token, 
                User = new UserDTO {
                    Id = user.Id,
                    Email = user.Email,
                    Name = user.Name,
                    Role = user.Role,
                    TenantId = user.TenantId,
                    Permissions = AffiniSecurity.Waf.Security.WafPermissions.GetPermissionsForRole(user.Role).ToList()
                }, 
                Tenant = new TenantDTO {
                    Id = tenant.Id,
                    Name = tenant.Name,
                    LegalName = tenant.LegalName,
                    TinNo = tenant.TinNo,
                    LicenseNo = tenant.LicenseNo,
                    Category = tenant.Category,
                    Industry = tenant.Industry,
                    Manager = tenant.Manager,
                    Address = tenant.Address,
                    ContactEmail = tenant.ContactEmail,
                    ContactPhone = tenant.ContactPhone,
                    LogoUrl = tenant.LogoUrl,
                    PrimaryColor = tenant.PrimaryColor,
                    BrandName = tenant.BrandName,
                    IsProfileComplete = tenant.IsProfileComplete,
                    OnboardingStep = tenant.OnboardingStep
                }, 
                Plan = new SubscriptionDTO {
                    Id = subscription?.Id ?? Guid.NewGuid().ToString(),
                    PlanName = subscription?.PlanName ?? "Free",
                    Status = subscription?.Status ?? "Active"
                },
                PlanConfig = planConfig
            });
        }

        [HttpPost("reset-password")]
        public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordRequest request)
        {
            var user = await _context.Users.IgnoreQueryFilters().FirstOrDefaultAsync(u => u.Email == request.Email);
            
            if (user == null)
            {
                return BadRequest(new { error = "User not found. Please check the email address." });
            }

            user.Password = BCrypt.Net.BCrypt.HashPassword(request.Password);
            await _context.SaveChangesAsync();

            return Ok(new { message = "Password updated successfully." });
        }

        private string GenerateJwtToken(User user)
        {
            var jwtSecret = _configuration["Waf:JwtSecret"] ?? "default-secret-key-123-replace-in-production";
            var jwtIssuer = _configuration["Waf:JwtIssuer"];
            var jwtAudience = _configuration["Waf:JwtAudience"];
            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret));
            var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

            var claims = new[]
            {
                new Claim(ClaimTypes.Email, user.Email),
                new Claim("tenant_id", user.TenantId),
                new Claim(ClaimTypes.Role, user.Role)
            };

            var token = new JwtSecurityToken(
                issuer: string.IsNullOrEmpty(jwtIssuer) ? null : jwtIssuer,
                audience: string.IsNullOrEmpty(jwtAudience) ? null : jwtAudience,
                claims: claims,
                expires: DateTime.Now.AddDays(30),
                signingCredentials: creds
            );

            return new JwtSecurityTokenHandler().WriteToken(token);
        }
    }
}

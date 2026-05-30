using Microsoft.AspNetCore.Http;

namespace AffiniSecurity.Waf.Services
{
    public class TenantService : ITenantService
    {
        private readonly IHttpContextAccessor _httpContextAccessor;

        public TenantService(IHttpContextAccessor httpContextAccessor)
        {
            _httpContextAccessor = httpContextAccessor;
        }

        public string? TenantId
        {
            get
            {
                var tenantId = _httpContextAccessor.HttpContext?.User?.FindFirst("tenant_id")?.Value;
                if (string.IsNullOrEmpty(tenantId))
                {
                    tenantId = _httpContextAccessor.HttpContext?.User?.FindFirst("TenantId")?.Value;
                }
                if (string.IsNullOrEmpty(tenantId))
                {
                    tenantId = _httpContextAccessor.HttpContext?.Items["tenant_id"]?.ToString();
                }
                if (string.IsNullOrEmpty(tenantId))
                {
                    tenantId = _httpContextAccessor.HttpContext?.Items["TenantId"]?.ToString();
                }
                return tenantId;
            }
        }

        public string? UserId
        {
            get { return _httpContextAccessor.HttpContext?.User?.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value; }
        }

        public string? UserEmail
        {
            get { return _httpContextAccessor.HttpContext?.User?.FindFirst(System.Security.Claims.ClaimTypes.Email)?.Value; }
        }

        public bool IsPlatformAdmin
        {
            get
            {
                var role = _httpContextAccessor.HttpContext?.User?.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value;
                return role == "super_admin" || role == "support_engineer" || role == "admin";
            }
        }

        public string? IpAddress
        {
            get { return _httpContextAccessor.HttpContext?.Connection?.RemoteIpAddress?.ToString(); }
        }

        public string? RequestPath
        {
            get { return _httpContextAccessor.HttpContext?.Request?.Path.Value; }
        }

        public string? RequestMethod
        {
            get { return _httpContextAccessor.HttpContext?.Request?.Method; }
        }
    }
}

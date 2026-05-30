using System;

namespace AffiniSecurity.Waf.Services
{
    public interface ITenantService
    {
        string? TenantId { get; }
        string? UserId { get; }
        string? UserEmail { get; }
        bool IsPlatformAdmin { get; }
        string? IpAddress { get; }
        string? RequestPath { get; }
        string? RequestMethod { get; }
    }
}

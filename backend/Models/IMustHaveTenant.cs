namespace AffiniSecurity.Waf.Models
{
    public interface IMustHaveTenant
    {
        string? TenantId { get; set; }
    }
}

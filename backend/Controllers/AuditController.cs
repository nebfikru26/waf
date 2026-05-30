using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using AffiniSecurity.Waf.Security;
using AffiniSecurity.Waf.Data;
using Microsoft.EntityFrameworkCore;
using System.Linq;

namespace AffiniSecurity.Waf.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class AuditController : ControllerBase
    {
        private readonly WafDbContext _context;

        public AuditController(WafDbContext context)
        {
            _context = context;
        }

        [HttpGet]
        public async Task<IActionResult> GetAuditLogs([FromQuery] int limit = 50, [FromQuery] int offset = 0)
        {
            // For tenants, EF Core Global Query Filter automatically limits to their own TenantId
            // For platform admins impersonating a tenant, it also respects CurrentTenantId
            // If they are a super_admin without impersonation, they can see all logs (though CurrentTenantId might be null, but TenantDbInterceptor handles it)
            
            var query = _context.AuditLogs.AsQueryable();

            var logs = await query
                .OrderByDescending(a => a.Timestamp)
                .Skip(offset)
                .Take(limit)
                .Select(a => new
                {
                    a.Id,
                    a.TenantId,
                    a.UserEmail,
                    a.Action,
                    a.EntityName,
                    a.EntityId,
                    a.OldValues,
                    a.NewValues,
                    a.IpAddress,
                    a.RequestPath,
                    a.RequestMethod,
                    a.Timestamp
                })
                .ToListAsync();

            return Ok(logs);
        }
    }
}

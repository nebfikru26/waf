using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using AffiniSecurity.Waf.Data;
using Microsoft.EntityFrameworkCore;

namespace AffiniSecurity.Waf.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/alerts")]
    public class AlertsController : ControllerBase
    {
        private readonly WafDbContext _context;

        public AlertsController(WafDbContext context)
        {
            _context = context;
        }

        [HttpGet]
        public async Task<IActionResult> GetAlerts()
        {
            var query = _context.AlertLogs.AsQueryable();
            
            // Admins should see all alerts (from all tenants and global)
            // Regular tenants only see their own (enforced by Global Query Filter in WafDbContext)
            if (User.IsInRole("admin") || User.IsInRole("super_admin") || User.IsInRole("support_engineer"))
            {
                query = query.IgnoreQueryFilters();
            }

            var alerts = await query
                .OrderByDescending(a => a.Timestamp)
                .Take(100)
                .ToListAsync();
                
            return Ok(alerts);
        }
    }
}

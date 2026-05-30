using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using AffiniSecurity.Waf.Data;
using AffiniSecurity.Waf.Models;
using Microsoft.EntityFrameworkCore;

namespace AffiniSecurity.Waf.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/billing")]
    public class BillingController : ControllerBase
    {
        private readonly WafDbContext _context;

        public BillingController(WafDbContext context)
        {
            _context = context;
        }

        [HttpGet]
        public async Task<IActionResult> GetSubscriptions()
        {
            var subs = await _context.Subscriptions.ToListAsync();
            return Ok(subs);
        }

        [HttpPost("checkout")]
        public async Task<IActionResult> Checkout([FromBody] CheckoutRequest request)
        {
            var sub = new Subscription
            {
                PlanName = request.PlanName,
                Gateway = request.Gateway,
                Status = "active"
            };

            _context.Subscriptions.Add(sub);
            await _context.SaveChangesAsync();

            return Ok(new { message = $"Successfully upgraded to {request.PlanName} via {request.Gateway}" });
        }
    }

    public class CheckoutRequest
    {
        public string PlanName { get; set; }
        public string Gateway { get; set; }
    }
}

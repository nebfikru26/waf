using Microsoft.AspNetCore.Mvc;
using AffiniSecurity.Waf.Data;
using AffiniSecurity.Waf.Models;
using Microsoft.EntityFrameworkCore;

namespace AffiniSecurity.Waf.Controllers
{
    [ApiController]
    [Route("api/plans")]
    public class PlansController : ControllerBase
    {
        private readonly WafDbContext _context;

        public PlansController(WafDbContext context)
        {
            _context = context;
        }

        [HttpGet]
        public async Task<IActionResult> GetPlans()
        {
            var plans = await _context.PlanConfigs.ToListAsync();
            return Ok(plans);
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetPlan(string id)
        {
            var plan = await _context.PlanConfigs.FindAsync(id);
            if (plan == null) return NotFound(new { error = "The specified plan or tier could not be found." });
            return Ok(plan);
        }

        [HttpPost]
        public async Task<IActionResult> CreatePlan([FromBody] PlanConfig plan)
        {
            _context.PlanConfigs.Add(plan);
            await _context.SaveChangesAsync();
            return Ok(plan);
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> UpdatePlan(string id, [FromBody] PlanConfig plan)
        {
            if (id != plan.Id) return BadRequest(new { error = "Request mismatch: The plan ID in the URL does not match the data provided." });
            _context.Entry(plan).State = EntityState.Modified;
            await _context.SaveChangesAsync();
            return Ok(plan);
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> DeletePlan(string id)
        {
            var plan = await _context.PlanConfigs.FindAsync(id);
            if (plan == null) return NotFound(new { error = "The specified plan or tier could not be found." });
            _context.PlanConfigs.Remove(plan);
            await _context.SaveChangesAsync();
            return Ok();
        }
    }
}

using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using AffiniSecurity.Waf.Data;
using AffiniSecurity.Waf.Models;
using Microsoft.EntityFrameworkCore;

namespace AffiniSecurity.Waf.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/modules/api-endpoints")]
    public class ApiProtectionController : ControllerBase
    {
        private readonly WafDbContext _context;

        public ApiProtectionController(WafDbContext context)
        {
            _context = context;
        }

        [HttpGet]
        public async Task<IActionResult> GetEndpoints()
        {
            var endpoints = await _context.ApiEndpoints.ToListAsync();
            return Ok(endpoints);
        }

        [HttpPost]
        public async Task<IActionResult> CreateEndpoint([FromBody] APIEndpoint endpoint)
        {
            _context.ApiEndpoints.Add(endpoint);
            await _context.SaveChangesAsync();
            return Ok(endpoint);
        }

        [HttpPatch("{id}")]
        public async Task<IActionResult> UpdateEndpoint(string id, [FromBody] dynamic updates)
        {
            var existing = await _context.ApiEndpoints.FirstOrDefaultAsync(e => e.Id == id);
            if (existing == null) return NotFound();

            var json = updates.ToString();
            var updatedData = System.Text.Json.JsonSerializer.Deserialize<APIEndpoint>(json, new System.Text.Json.JsonSerializerOptions 
            { 
                PropertyNameCaseInsensitive = true 
            });

            if (updatedData != null)
            {
                if (updatedData.Path != null) existing.Path = updatedData.Path;
                if (updatedData.Method != null) existing.Method = updatedData.Method;
                if (updatedData.AllowedMethods != null) existing.AllowedMethods = updatedData.AllowedMethods;
                if (updatedData.RateLimit != 0) existing.RateLimit = updatedData.RateLimit;
                existing.AuthRequired = updatedData.AuthRequired;
                existing.SchemaValidation = updatedData.SchemaValidation;
                if (updatedData.SchemaMode != null) existing.SchemaMode = updatedData.SchemaMode;
                if (updatedData.RequiredParams != null) existing.RequiredParams = updatedData.RequiredParams;
                if (updatedData.MaxBodyKb != 0) existing.MaxBodyKb = updatedData.MaxBodyKb;
                if (updatedData.Description != null) existing.Description = updatedData.Description;
                if (updatedData.Status != null) existing.Status = updatedData.Status;

                await _context.SaveChangesAsync();
            }

            return Ok(existing);
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteEndpoint(string id)
        {
            var endpoint = await _context.ApiEndpoints.FirstOrDefaultAsync(e => e.Id == id);
            if (endpoint == null) return NotFound();

            _context.ApiEndpoints.Remove(endpoint);
            await _context.SaveChangesAsync();
            return Ok();
        }
    }
}

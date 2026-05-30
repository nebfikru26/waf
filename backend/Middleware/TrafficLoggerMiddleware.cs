using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.EntityFrameworkCore;
using System;
using System.Linq;
using System.Threading.Tasks;
using AffiniSecurity.Waf.Data;
using AffiniSecurity.Waf.Services;
using AffiniSecurity.Waf.Models;

namespace AffiniSecurity.Waf.Middleware
{
    public class TrafficLoggerMiddleware
    {
        private readonly RequestDelegate _next;
        private readonly IServiceScopeFactory _scopeFactory;

        public TrafficLoggerMiddleware(RequestDelegate next, IServiceScopeFactory scopeFactory)
        {
            _next = next;
            _scopeFactory = scopeFactory;
        }

        public async Task InvokeAsync(HttpContext context)
        {
            // Skip logging for static files or common noise
            if (context.Request.Path.StartsWithSegments("/api/traffic") || 
                context.Request.Path.StartsWithSegments("/api/alerts"))
            {
                await _next(context);
                return;
            }

            await _next(context);
            
            // Fire-and-forget background logging to ensure it NEVER blocks the main request
            _ = Task.Run(async () => {
                try 
                {
                    using var scope = _scopeFactory.CreateScope();
                    var db = scope.ServiceProvider.GetRequiredService<WafDbContext>();
                    var clickhouse = scope.ServiceProvider.GetRequiredService<IClickHouseService>();
                    
                    // Get TenantId (similar to WAFInspector)
                    string host = context.Request.Host.Host;
                    var domain = await db.Domains.IgnoreQueryFilters().FirstOrDefaultAsync(d => d.DomainName == host);
                    string? tenantId = domain?.TenantId;

                    // Fallback for testing
                    if (string.IsNullOrEmpty(tenantId)) {
                        tenantId = "eb880aa3-c981-419f-b0f4-4d9e511788dc"; // nebfikru@gmail.com
                    }

                    // Log entry to ClickHouse
                    var timeKey = DateTime.UtcNow.ToString("yyyy-MM-dd HH:00:00");
                    await clickhouse.InsertTrafficLogAsync(tenantId, timeKey, 1, 0);

                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[TrafficLog] Async Background Error: {ex.Message}");
                }
            });
        }
    }
}

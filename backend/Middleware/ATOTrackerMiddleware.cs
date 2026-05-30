using Microsoft.AspNetCore.Http;
using System;
using System.Threading.Tasks;
using AffiniSecurity.Waf.Services;

namespace AffiniSecurity.Waf.Middleware
{
    public class ATOTrackerMiddleware
    {
        private readonly RequestDelegate _next;
        private readonly IRedisService _redis;

        public ATOTrackerMiddleware(RequestDelegate next, IRedisService redis)
        {
            _next = next;
            _redis = redis;
        }

        public async Task InvokeAsync(HttpContext context)
        {
            try 
            {
                var path = context.Request.Path.Value ?? string.Empty;
                var isAuth = path.Contains("/api/auth/login") || path.Contains("/api/auth/signup");
                var ip = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
                var key = $"ato_failures:{ip}";

                if (isAuth)
                {
                    var failureCount = await _redis.GetValueAsync(key);
                    if (failureCount != null && int.Parse(failureCount) >= 5)
                    {
                        context.Response.StatusCode = 429;
                        context.Response.ContentType = "application/json";
                        await context.Response.WriteAsync("{\"error\": \"Too many login attempts. Please try again in 15 minutes.\"}");
                        return;
                    }
                }

                await _next(context);

                if (isAuth && context.Response.StatusCode == 401)
                {
                    var current = await _redis.GetValueAsync(key);
                    int nextCount = (current == null ? 0 : int.Parse(current)) + 1;
                    await _redis.SetValueAsync(key, nextCount.ToString(), TimeSpan.FromMinutes(15));
                }
                else if (isAuth && context.Response.StatusCode == 200)
                {
                    await _redis.RemoveValueAsync(key); // Reset on success
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ATO] Error: {ex.Message}");
                // Fail-open: allow the request to proceed if the tracker fails
                if (!context.Response.HasStarted)
                {
                    await _next(context);
                }
            }
        }
    }
}

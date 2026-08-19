using System.Net;
using System.Threading.Tasks;
using AffiniSecurity.Waf.Middleware;
using AffiniSecurity.Waf.Services;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using StackExchange.Redis;
using Xunit;

namespace AffiniSecurity.Waf.Tests.Middleware
{
    /// <summary>
    /// A stub IRedisService that always reports Redis as unavailable (GetDatabase() returns
    /// null), simulating a Redis outage so the middleware's in-process fallback path is
    /// exercised deterministically without needing a real Redis instance.
    /// </summary>
    public class RedisDownStub : IRedisService
    {
        public IDatabase GetDatabase() => null!;
        public Task<bool> SetValueAsync(string key, string value, TimeSpan? expiry = null) => Task.FromResult(false);
        public Task<string?> GetValueAsync(string key) => Task.FromResult<string?>(null);
        public Task<bool> RemoveValueAsync(string key) => Task.FromResult(false);
    }

    /// <summary>
    /// Verifies that when Redis is unavailable, DistributedRateLimiterMiddleware still enforces
    /// its rate limit via the in-process fallback limiter instead of failing fully open (the
    /// P1 fix: a Redis outage must degrade to per-instance enforcement, not zero enforcement).
    /// </summary>
    public class DistributedRateLimiterFallbackTests
    {
        private static async Task<TestServer> CreateServerAsync(string tenantId)
        {
            var host = await new HostBuilder()
                .ConfigureWebHost(webHost =>
                {
                    webHost.UseTestServer();
                    webHost.ConfigureServices(services =>
                    {
                        services.AddSingleton<IRedisService, RedisDownStub>();
                    });
                    webHost.Configure(app =>
                    {
                        // Give each test its own partition key: the middleware keys by
                        // context.Items["TenantId"] + remote IP, both of which TestServer would
                        // otherwise keep constant across every test, causing cross-test
                        // contamination of the shared static fallback limiter.
                        app.Use(async (ctx, next) =>
                        {
                            ctx.Items["TenantId"] = tenantId;
                            await next();
                        });
                        app.UseMiddleware<DistributedRateLimiterMiddleware>();
                        app.Run(ctx => ctx.Response.WriteAsync("ok"));
                    });
                })
                .StartAsync();

            return host.GetTestServer();
        }

        [Fact]
        public async Task WhenRedisUnavailable_RequestsWithinLimitStillSucceed()
        {
            using var server = await CreateServerAsync(nameof(WhenRedisUnavailable_RequestsWithinLimitStillSucceed));
            var client = server.CreateClient();

            using var response = await client.GetAsync("/");

            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        }

        [Fact]
        public async Task WhenRedisUnavailable_ExceedingLimitStillBlocksViaFallback()
        {
            using var server = await CreateServerAsync(nameof(WhenRedisUnavailable_ExceedingLimitStillBlocksViaFallback));
            var client = server.CreateClient();

            HttpStatusCode? lastStatus = null;
            // MaxRequestsPerMinute is 120; issue more than that against the same instance to
            // guarantee at least one 429 even accounting for the sliding window's segments.
            for (var i = 0; i < 130; i++)
            {
                using var response = await client.GetAsync("/");
                lastStatus = response.StatusCode;
                if (lastStatus == HttpStatusCode.TooManyRequests)
                {
                    break;
                }
            }

            Assert.Equal(HttpStatusCode.TooManyRequests, lastStatus);
        }
    }
}

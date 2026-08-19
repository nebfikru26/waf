using System.Linq;
using System.Net.Http;
using System.Threading.Tasks;
using AffiniSecurity.Waf.Middleware;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Hosting;
using Xunit;

namespace AffiniSecurity.Waf.Tests.Middleware
{
    /// <summary>
    /// Boots a minimal, standalone pipeline (no database/DI dependencies from the real app) to
    /// verify SecurityHeadersMiddleware attaches the expected headers to every response.
    /// </summary>
    public class SecurityHeadersMiddlewareTests
    {
        private static async Task<HttpResponseMessage> SendRequestAsync()
        {
            using var host = await new HostBuilder()
                .ConfigureWebHost(webHost =>
                {
                    webHost.UseTestServer();
                    webHost.Configure(app =>
                    {
                        app.UseMiddleware<SecurityHeadersMiddleware>();
                        app.Run(ctx => ctx.Response.WriteAsync("ok"));
                    });
                })
                .StartAsync();

            var client = host.GetTestClient();
            return await client.GetAsync("/");
        }

        [Fact]
        public async Task Response_IncludesHstsHeader()
        {
            using var response = await SendRequestAsync();

            Assert.True(response.Headers.Contains("Strict-Transport-Security"));
        }

        [Fact]
        public async Task Response_IncludesContentSecurityPolicy()
        {
            using var response = await SendRequestAsync();

            Assert.True(response.Headers.Contains("Content-Security-Policy"));
        }

        [Fact]
        public async Task Response_DeniesFraming()
        {
            using var response = await SendRequestAsync();

            Assert.Equal("DENY", response.Headers.GetValues("X-Frame-Options").First());
        }

        [Fact]
        public async Task Response_PreventsMimeSniffing()
        {
            using var response = await SendRequestAsync();

            Assert.Equal("nosniff", response.Headers.GetValues("X-Content-Type-Options").First());
        }
    }
}

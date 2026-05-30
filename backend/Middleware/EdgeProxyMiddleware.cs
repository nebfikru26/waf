using Microsoft.AspNetCore.Http;
using System.Net.Http;
using System.Threading.Tasks;
using System.Linq;
using AffiniSecurity.Waf.Data;
using Microsoft.EntityFrameworkCore;
using System;

namespace AffiniSecurity.Waf.Middleware
{
    public class EdgeProxyMiddleware
    {
        private readonly RequestDelegate _next;
        private static readonly HttpClient _httpClient = new HttpClient();

        public EdgeProxyMiddleware(RequestDelegate next)
        {
            _next = next;
        }

        public async Task InvokeAsync(HttpContext context, WafDbContext dbContext)
        {
            var host = context.Request.Host.Host;
            
            // Bypass API requests so the dashboard still functions
            if (context.Request.Path.StartsWithSegments("/api"))
            {
                await _next(context);
                return;
            }

            try
            {
                var domain = await dbContext.Domains.IgnoreQueryFilters().FirstOrDefaultAsync(d => d.DomainName == host);
                if (domain != null && !string.IsNullOrEmpty(domain.OriginIp))
                {
                    var targetUrl = $"http://{domain.OriginIp}{context.Request.Path}{context.Request.QueryString}";
                    var requestMessage = new HttpRequestMessage();
                    var requestMethod = context.Request.Method;
                    
                    if (!HttpMethods.IsGet(requestMethod) && !HttpMethods.IsHead(requestMethod) && !HttpMethods.IsDelete(requestMethod) && !HttpMethods.IsTrace(requestMethod))
                    {
                        requestMessage.Content = new StreamContent(context.Request.Body);
                    }
                    
                    requestMessage.RequestUri = new Uri(targetUrl);
                    requestMessage.Method = new HttpMethod(context.Request.Method);

                    var responseMessage = await _httpClient.SendAsync(requestMessage, HttpCompletionOption.ResponseHeadersRead, context.RequestAborted);
                    context.Response.StatusCode = (int)responseMessage.StatusCode;
                    
                    foreach (var header in responseMessage.Headers)
                    {
                        context.Response.Headers[header.Key] = header.Value.ToArray();
                    }
                    foreach (var header in responseMessage.Content.Headers)
                    {
                        context.Response.Headers[header.Key] = header.Value.ToArray();
                    }

                    context.Response.Headers.Remove("transfer-encoding");
                    await responseMessage.Content.CopyToAsync(context.Response.Body);
                    return;
                }

                await _next(context);
            }
            catch (Exception)
            {
                // Fail-open bypass
                await _next(context);
            }
        }
    }
}

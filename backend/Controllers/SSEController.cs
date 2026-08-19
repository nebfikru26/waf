using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using AffiniSecurity.Waf.Services;
using AffiniSecurity.Waf.Security;
using System.Threading.Channels;
using System.Threading.Tasks;
using System.Text;

namespace AffiniSecurity.Waf.Controllers
{
    [ApiController]
    [Authorize(Policy = WafPolicies.RequireAnalyticsViewer)]
    public class SSEController : ControllerBase
    {
        [HttpGet("api/stream/ai-events")]
        public async Task StreamAiEvents([FromServices] INatsService nats)
        {
            // Allow this endpoint to be consumed via SSE
            Response.Headers.Add("Content-Type", "text/event-stream");
            Response.Headers.Add("Cache-Control", "no-cache");
            Response.Headers.Add("Connection", "keep-alive");
            Response.Headers.Add("X-Accel-Buffering", "no");

            var channel = Channel.CreateUnbounded<string>();
            var conn = nats.GetConnection();

            var sub = conn.SubscribeAsync("waf.events.ai", (sender, args) =>
            {
                var msg = Encoding.UTF8.GetString(args.Message.Data);
                channel.Writer.TryWrite(msg);
            });

            HttpContext.RequestAborted.Register(() =>
            {
                sub.Unsubscribe();
                channel.Writer.TryComplete();
            });

            try
            {
                await foreach (var msg in channel.Reader.ReadAllAsync(HttpContext.RequestAborted))
                {
                    await Response.WriteAsync($"data: {msg}\n\n");
                    await Response.Body.FlushAsync();
                }
            }
            catch (System.OperationCanceledException)
            {
                // Client disconnected
            }
        }

        [HttpGet("api/stream/crs-events")]
        public async Task StreamCrsEvents([FromServices] INatsService nats)
        {
            Response.Headers.Add("Content-Type", "text/event-stream");
            Response.Headers.Add("Cache-Control", "no-cache");
            Response.Headers.Add("Connection", "keep-alive");
            Response.Headers.Add("X-Accel-Buffering", "no");

            var channel = Channel.CreateUnbounded<string>();
            var conn = nats.GetConnection();

            var sub = conn.SubscribeAsync("waf.events.crs", (sender, args) =>
            {
                var msg = Encoding.UTF8.GetString(args.Message.Data);
                channel.Writer.TryWrite(msg);
            });

            HttpContext.RequestAborted.Register(() =>
            {
                sub.Unsubscribe();
                channel.Writer.TryComplete();
            });

            try
            {
                await foreach (var msg in channel.Reader.ReadAllAsync(HttpContext.RequestAborted))
                {
                    await Response.WriteAsync($"data: {msg}\n\n");
                    await Response.Body.FlushAsync();
                }
            }
            catch (System.OperationCanceledException)
            {
                // Client disconnected
            }
        }
    }
}

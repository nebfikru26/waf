using NATS.Client;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace AffiniSecurity.Waf.Services
{
    public interface INatsService
    {
        IConnection GetConnection();
        void Publish(string subject, string message);
    }

    public class NatsService : INatsService, IDisposable
    {
        private IConnection? _connection;
        private readonly ILogger<NatsService> _logger;

        public NatsService(IConfiguration configuration, ILogger<NatsService> logger)
        {
            _logger = logger;
            var natsUrl = configuration["Waf:NatsUrl"] ?? "nats://localhost:4222";
            try
            {
                var cf = new ConnectionFactory();
                _connection = cf.CreateConnection(natsUrl);
                _logger.LogInformation("Connected to NATS at {Url}", natsUrl);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to connect to NATS at {Url}", natsUrl);
            }
        }

        public IConnection GetConnection()
        {
            if (_connection == null) throw new InvalidOperationException("NATS connection is not initialized.");
            return _connection;
        }

        public void Publish(string subject, string message)
        {
            _connection?.Publish(subject, System.Text.Encoding.UTF8.GetBytes(message));
        }

        public void Dispose()
        {
            _connection?.Close();
            _connection?.Dispose();
        }
    }
}

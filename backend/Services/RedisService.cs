using StackExchange.Redis;
using Microsoft.Extensions.Configuration;

namespace AffiniSecurity.Waf.Services
{
    public interface IRedisService
    {
        IDatabase GetDatabase();
        Task<bool> SetValueAsync(string key, string value, TimeSpan? expiry = null);
        Task<string?> GetValueAsync(string key);
        Task<bool> RemoveValueAsync(string key);
    }

    public class RedisService : IRedisService
    {
        private readonly IConnectionMultiplexer? _redis;

        public RedisService(IConfiguration configuration)
        {
            var redisUrl = configuration["Waf:RedisUrl"] ?? "localhost:6379";
            try
            {
                _redis = ConnectionMultiplexer.Connect(redisUrl);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Redis] Failed to connect to {redisUrl}: {ex.Message}");
            }
        }

        public IDatabase? GetDatabase()
        {
            return _redis?.GetDatabase();
        }

        public async Task<bool> SetValueAsync(string key, string value, TimeSpan? expiry = null)
        {
            var db = GetDatabase();
            if (db == null) return false;
            return await db.StringSetAsync(key, value, expiry);
        }

        public async Task<string?> GetValueAsync(string key)
        {
            var db = GetDatabase();
            if (db == null) return null;
            return await db.StringGetAsync(key);
        }

        public async Task<bool> RemoveValueAsync(string key)
        {
            var db = GetDatabase();
            if (db == null) return false;
            return await db.KeyDeleteAsync(key);
        }
    }
}

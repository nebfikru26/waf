using StackExchange.Redis;
using Microsoft.Extensions.Configuration;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace AffiniSecurity.Waf.Services
{
    public interface IRedisService
    {
        IDatabase GetDatabase();
        Task<bool> SetValueAsync(string key, string value, TimeSpan? expiry = null);
        Task<string?> GetValueAsync(string key);
        Task<bool> RemoveValueAsync(string key);
        Task<List<(string Key, TimeSpan? Ttl)>> ScanKeysWithTtlAsync(string pattern);
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

        // Enumerates keys matching a pattern along with their remaining TTL — used by
        // /api/ato/locks to list currently-active account-takeover lockouts.
        public async Task<List<(string Key, TimeSpan? Ttl)>> ScanKeysWithTtlAsync(string pattern)
        {
            var results = new List<(string, TimeSpan?)>();
            if (_redis == null) return results;

            try
            {
                var db = _redis.GetDatabase();
                foreach (var endpoint in _redis.GetEndPoints())
                {
                    var server = _redis.GetServer(endpoint);
                    if (server.IsReplica) continue;

                    await foreach (var key in server.KeysAsync(pattern: pattern))
                    {
                        var ttl = await db.KeyTimeToLiveAsync(key);
                        results.Add((key.ToString(), ttl));
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Redis] Failed to scan keys for pattern {pattern}: {ex.Message}");
            }

            return results;
        }
    }
}

using AffiniSecurity.Waf.Services;
using StackExchange.Redis;
using System.Net;

namespace AffiniSecurity.Waf.Services
{
    public interface IThreatIntelligenceService
    {
        Task<bool> IsMaliciousAsync(string indicator, string indicatorType);
        Task UpdateIocCacheAsync(string indicator, string indicatorType, string source, string severity);
    }

    public class ThreatIntelligenceService : IThreatIntelligenceService
    {
        private readonly IRedisService _redis;
        private readonly ILogger<ThreatIntelligenceService> _logger;

        public ThreatIntelligenceService(IRedisService redis, ILogger<ThreatIntelligenceService> logger)
        {
            _redis = redis;
            _logger = logger;
        }

        public async Task<bool> IsMaliciousAsync(string indicator, string indicatorType)
        {
            var db = _redis.GetDatabase();
            if (db == null) return false;

            // Key format: threatintel:{type}:{value}
            var key = $"threatintel:{indicatorType.ToLower()}:{indicator}";
            
            try
            {
                var value = await db.StringGetAsync(key);
                return value.HasValue;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error checking threat intelligence for {indicator}");
                return false;
            }
        }

        public async Task UpdateIocCacheAsync(string indicator, string indicatorType, string source, string severity)
        {
            var db = _redis.GetDatabase();
            if (db == null) return;

            var key = $"threatintel:{indicatorType.ToLower()}:{indicator}";
            var value = $"{source}|{severity}";

            try
            {
                // Cache for 24 hours or until next sync
                await db.StringSetAsync(key, value, TimeSpan.FromHours(24));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error updating threat intelligence cache for {indicator}");
            }
        }
    }
}

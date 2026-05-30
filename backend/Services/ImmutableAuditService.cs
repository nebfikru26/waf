using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using AffiniSecurity.Waf.Data;
using AffiniSecurity.Waf.Models;
using Microsoft.EntityFrameworkCore;

namespace AffiniSecurity.Waf.Services
{
    public interface IAuditService
    {
        Task LogActionAsync(string? userId, string? userEmail, string action, string entityName, string entityId, object? oldValues = null, object? newValues = null);
        Task<bool> VerifyIntegrityAsync();
    }

    public class ImmutableAuditService : IAuditService
    {
        private readonly WafDbContext _context;
        private const string AuditSecret = "ETHIOPIA_COMPLIANCE_KEY_2026"; // In prod, use Secret Manager

        public ImmutableAuditService(WafDbContext context)
        {
            _context = context;
        }

        public async Task LogActionAsync(string? userId, string? userEmail, string action, string entityName, string entityId, object? oldValues = null, object? newValues = null)
        {
            var log = new AuditLog
            {
                TenantId = _context.CurrentTenantId,
                UserId = userId,
                UserEmail = userEmail,
                Action = action,
                EntityName = entityName,
                EntityId = entityId,
                OldValues = oldValues != null ? JsonSerializer.Serialize(oldValues) : null,
                NewValues = newValues != null ? JsonSerializer.Serialize(newValues) : null,
                Timestamp = DateTime.UtcNow
            };

            // Get previous hash for chaining
            var lastLog = await _context.AuditLogs
                .IgnoreQueryFilters()
                .OrderByDescending(l => l.Timestamp)
                .FirstOrDefaultAsync();

            var previousHash = lastLog?.HashChain ?? "GENESIS_BLOCK";
            
            // Calculate cryptographic chain
            var dataToHash = $"{log.Action}|{log.EntityName}|{log.EntityId}|{log.Timestamp:O}|{previousHash}";
            log.HashChain = ComputeHash(dataToHash);

            _context.AuditLogs.Add(log);
            await _context.SaveChangesAsync();
        }

        public async Task<bool> VerifyIntegrityAsync()
        {
            var logs = await _context.AuditLogs
                .IgnoreQueryFilters()
                .OrderBy(l => l.Timestamp)
                .ToListAsync();

            string previousHash = "GENESIS_BLOCK";
            bool hasStartedChaining = false;

            foreach (var log in logs)
            {
                if (string.IsNullOrEmpty(log.HashChain))
                {
                    // Allow legacy unhashed logs only BEFORE the chain feature was activated
                    if (hasStartedChaining) return false;
                    continue;
                }

                hasStartedChaining = true;

                var dataToHash = $"{log.Action}|{log.EntityName}|{log.EntityId}|{log.Timestamp:O}|{previousHash}";
                var recalculatedHash = ComputeHash(dataToHash);

                if (log.HashChain != recalculatedHash)
                {
                    return false; // Chain broken!
                }

                previousHash = log.HashChain;
            }

            return true;
        }

        private string ComputeHash(string data)
        {
            using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(AuditSecret));
            var hashBytes = hmac.ComputeHash(Encoding.UTF8.GetBytes(data));
            return Convert.ToBase64String(hashBytes);
        }
    }
}

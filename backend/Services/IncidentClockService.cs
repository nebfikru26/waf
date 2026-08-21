using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AffiniSecurity.Waf.Data;
using AffiniSecurity.Waf.Models;
using Microsoft.EntityFrameworkCore;

namespace AffiniSecurity.Waf.Services
{
    public interface IIncidentClockService
    {
        /// <summary>Opens a new 48h (INSA CERT) / 72h (data breach) reporting-deadline clock.</summary>
        Task<IncidentClock> OpenAsync(string tenantId, string title, string severity, string? alertLogId = null, CancellationToken ct = default);

        Task<IncidentClock?> MarkCertReportedAsync(string id, string? byEmail, CancellationToken ct = default);
        Task<IncidentClock?> MarkBreachReportedAsync(string id, string? byEmail, CancellationToken ct = default);
        Task<IncidentClock?> ResolveAsync(string id, string? notes, CancellationToken ct = default);

        /// <summary>Flags any Open clock past either deadline as Overdue. Returns newly-overdue clocks.</summary>
        Task<System.Collections.Generic.List<IncidentClock>> SweepOverdueAsync(CancellationToken ct = default);
    }

    public class IncidentClockService : IIncidentClockService
    {
        private readonly WafDbContext _context;
        public static readonly TimeSpan CertReportingWindow = TimeSpan.FromHours(48);
        public static readonly TimeSpan BreachReportingWindow = TimeSpan.FromHours(72);

        public IncidentClockService(WafDbContext context)
        {
            _context = context;
        }

        public async Task<IncidentClock> OpenAsync(string tenantId, string title, string severity, string? alertLogId = null, CancellationToken ct = default)
        {
            var now = DateTime.UtcNow;
            var clock = new IncidentClock
            {
                TenantId = tenantId,
                Title = title,
                Severity = severity,
                AlertLogId = alertLogId,
                DetectedAt = now,
                CertDeadline = now.Add(CertReportingWindow),
                BreachDeadline = now.Add(BreachReportingWindow),
                Status = "Open"
            };
            _context.IncidentClocks.Add(clock);
            await _context.SaveChangesAsync(ct);
            return clock;
        }

        public async Task<IncidentClock?> MarkCertReportedAsync(string id, string? byEmail, CancellationToken ct = default)
        {
            var clock = await _context.IncidentClocks.IgnoreQueryFilters().FirstOrDefaultAsync(c => c.Id == id, ct);
            if (clock == null) return null;
            clock.ReportedToCertAt = DateTime.UtcNow;
            clock.ReportedByCertEmail = byEmail;
            if (clock.Status == "Open") clock.Status = "CertReported";
            await _context.SaveChangesAsync(ct);
            return clock;
        }

        public async Task<IncidentClock?> MarkBreachReportedAsync(string id, string? byEmail, CancellationToken ct = default)
        {
            var clock = await _context.IncidentClocks.IgnoreQueryFilters().FirstOrDefaultAsync(c => c.Id == id, ct);
            if (clock == null) return null;
            clock.ReportedAsBreachAt = DateTime.UtcNow;
            clock.ReportedByBreachEmail = byEmail;
            clock.Status = "BreachReported";
            await _context.SaveChangesAsync(ct);
            return clock;
        }

        public async Task<IncidentClock?> ResolveAsync(string id, string? notes, CancellationToken ct = default)
        {
            var clock = await _context.IncidentClocks.IgnoreQueryFilters().FirstOrDefaultAsync(c => c.Id == id, ct);
            if (clock == null) return null;
            clock.Status = "Resolved";
            clock.ResolvedAt = DateTime.UtcNow;
            if (!string.IsNullOrWhiteSpace(notes)) clock.Notes = notes;
            await _context.SaveChangesAsync(ct);
            return clock;
        }

        public async Task<System.Collections.Generic.List<IncidentClock>> SweepOverdueAsync(CancellationToken ct = default)
        {
            var now = DateTime.UtcNow;
            var openClocks = await _context.IncidentClocks.IgnoreQueryFilters()
                .Where(c => c.Status == "Open" || c.Status == "CertReported")
                .ToListAsync(ct);

            var newlyOverdue = new System.Collections.Generic.List<IncidentClock>();
            foreach (var clock in openClocks)
            {
                var certOverdue = clock.ReportedToCertAt == null && now > clock.CertDeadline;
                var breachOverdue = clock.ReportedAsBreachAt == null && now > clock.BreachDeadline;
                if ((certOverdue || breachOverdue) && clock.Status != "Overdue")
                {
                    clock.Status = "Overdue";
                    newlyOverdue.Add(clock);
                }
            }

            if (newlyOverdue.Count > 0) await _context.SaveChangesAsync(ct);
            return newlyOverdue;
        }
    }
}

using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace AffiniSecurity.Waf.Models
{
    /// <summary>
    /// Global, platform-wide configuration for <see cref="Middleware.ATOTrackerMiddleware"/>,
    /// which protects the AffiniSecurity control-plane's own login/signup endpoints
    /// (/api/auth/login, /api/auth/signup) against credential-stuffing and brute-force attacks.
    ///
    /// This is intentionally NOT tenant-scoped: login happens before a tenant is known (the
    /// tenant is only resolved server-side after the submitted email is looked up), and
    /// <see cref="Middleware.EdgeProxyMiddleware"/> terminates genuine per-tenant WAF-proxied
    /// traffic earlier in the pipeline, so this middleware never observes it. A single row
    /// (Id = "global") holds the active configuration, managed via GET/PUT /api/ato/config.
    ///
    /// Note: this project also has an older, unused <see cref="ATOConfig"/>/<see cref="ATOEvent"/>
    /// pair (tenant-scoped, ato_configs/ato_events tables) that was scaffolded for a
    /// per-tenant-website ATO feature that was never wired up to any middleware or controller.
    /// Those are left untouched here to avoid disturbing unrelated schema.
    /// </summary>
    [Table("ato_tracker_settings")]
    public class AtoSettings
    {
        [Key]
        [JsonPropertyName("id")]
        public string Id { get; set; } = "global";

        [JsonPropertyName("enabled")]
        public bool Enabled { get; set; } = true;

        [JsonPropertyName("maxFailedAttempts")]
        public int MaxFailedAttempts { get; set; } = 5;

        [JsonPropertyName("windowSeconds")]
        public int WindowSeconds { get; set; } = 900;

        [JsonPropertyName("lockoutSeconds")]
        public int LockoutSeconds { get; set; } = 900;

        /// <summary>challenge | block | log</summary>
        [JsonPropertyName("action")]
        public string Action { get; set; } = "challenge";

        [JsonPropertyName("trackByFingerprint")]
        public bool TrackByFingerprint { get; set; } = false;

        /// <summary>Comma-separated path fragments that count as authentication endpoints.</summary>
        [JsonPropertyName("authEndpoints")]
        public string AuthEndpoints { get; set; } = "/api/auth/login,/api/auth/signup";

        [JsonPropertyName("updatedAt")]
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }

    /// <summary>
    /// A single tracked login-failure/lockout event, recorded by
    /// <see cref="Middleware.ATOTrackerMiddleware"/> for every failed login/signup attempt so
    /// the Account Takeover dashboard (/api/ato/events, /api/ato/stats) reflects real activity.
    /// </summary>
    [Table("ato_tracker_events")]
    public class AtoEvent
    {
        [Key]
        [JsonPropertyName("id")]
        public string Id { get; set; } = Guid.NewGuid().ToString();

        [JsonPropertyName("ip")]
        public string Ip { get; set; } = string.Empty;

        [JsonPropertyName("fingerprint")]
        public string? Fingerprint { get; set; }

        [JsonPropertyName("targetPath")]
        public string TargetPath { get; set; } = string.Empty;

        [JsonPropertyName("failures")]
        public int Failures { get; set; }

        /// <summary>logged | challenged | blocked</summary>
        [JsonPropertyName("action")]
        public string Action { get; set; } = "logged";

        [JsonPropertyName("timestamp")]
        public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    }
}

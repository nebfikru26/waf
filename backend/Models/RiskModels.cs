using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace AffiniSecurity.Waf.Models
{
    [Table("security_settings")]
    public class SecuritySettings
    {
        [Key]
        [JsonPropertyName("id")]
        public string Id { get; set; } = Guid.NewGuid().ToString();
        
        [JsonPropertyName("tenant_id")]
        public string TenantId { get; set; }
        
        [JsonPropertyName("bot_protection_enabled")]
        public bool BotProtectionEnabled { get; set; } = true;
        
        [JsonPropertyName("js_challenge_enabled")]
        public bool JsChallengeEnabled { get; set; } = true;
        
        [JsonPropertyName("captcha_enabled")]
        public bool CaptchaEnabled { get; set; } = false;

        [JsonPropertyName("fingerprinting_enabled")]
        public bool FingerprintingEnabled { get; set; } = true;
        
        [JsonPropertyName("ml_detection_enabled")]
        public bool MlDetectionEnabled { get; set; } = true;
        
        [JsonPropertyName("ddos_protection_enabled")]
        public bool DdosProtectionEnabled { get; set; } = true;
        
        [JsonPropertyName("l7_protection_enabled")]
        public bool L7ProtectionEnabled { get; set; } = true;
        
        [JsonPropertyName("ddos_threshold_rps")]
        public int DdosThresholdRps { get; set; } = 100;
        
        [JsonPropertyName("sensitivity_level")]
        public string SensitivityLevel { get; set; } = "medium";

        [JsonPropertyName("geo_enabled")]
        public bool GeoEnabled { get; set; } = false;

        [JsonPropertyName("geo_mode")]
        public string GeoMode { get; set; } = "allowlist";

        [JsonPropertyName("geo_allowlist")]
        public string GeoAllowlist { get; set; } = "ET,ER,DJ,SO,KE,SS,SD";

        [JsonPropertyName("geo_blocklist")]
        public string GeoBlocklist { get; set; } = "RU,CN,KP,IR";

        [JsonPropertyName("rate_limit_rps")]
        public int RateLimitRps { get; set; } = 100;

        [JsonPropertyName("waf_mode")]
        [Column("waf_mode")]
        public string WafMode { get; set; } = "detection"; // "detection" (simulate) or "prevention" (block)
    }

    [Table("ato_configs")]
    public class ATOConfig
    {
        [Key]
        [JsonPropertyName("id")]
        public string Id { get; set; } = Guid.NewGuid().ToString();
        
        [JsonPropertyName("tenant_id")]
        public string TenantId { get; set; }
        
        [JsonPropertyName("enabled")]
        public bool Enabled { get; set; } = true;
        
        [JsonPropertyName("max_failed_attempts")]
        public int MaxFailedAttempts { get; set; } = 5;
        
        [JsonPropertyName("window_seconds")]
        public int WindowSeconds { get; set; } = 900;
        
        [JsonPropertyName("lockout_seconds")]
        public int LockoutSeconds { get; set; } = 1800;
        
        [JsonPropertyName("action")]
        public string Action { get; set; } = "challenge";
        
        [JsonPropertyName("track_by_fingerprint")]
        public bool TrackByFingerprint { get; set; } = true;
        
        [JsonPropertyName("auth_endpoints")]
        public string AuthEndpoints { get; set; } = "/login,/auth,/signin,/token,/password";
    }

    [Table("ato_events")]
    public class ATOEvent
    {
        [Key]
        [JsonPropertyName("id")]
        public string Id { get; set; } = Guid.NewGuid().ToString();
        
        [JsonPropertyName("tenant_id")]
        public string TenantId { get; set; }
        
        [JsonPropertyName("ip")]
        public string Ip { get; set; }
        
        [JsonPropertyName("fingerprint")]
        public string Fingerprint { get; set; }
        
        [JsonPropertyName("target_path")]
        public string TargetPath { get; set; }
        
        [JsonPropertyName("failures")]
        public int Failures { get; set; }
        
        [JsonPropertyName("action")]
        public string Action { get; set; }
        
        [JsonPropertyName("timestamp")]
        public string Timestamp { get; set; }
    }

    [Table("risk_thresholds")]
    public class RiskThreshold
    {
        [Key]
        [JsonPropertyName("id")]
        public string Id { get; set; } = Guid.NewGuid().ToString();
        
        [JsonPropertyName("tenant_id")]
        public string TenantId { get; set; }
        
        [JsonPropertyName("log_threshold")]
        public int LogThreshold { get; set; } = 40;
        
        [JsonPropertyName("challenge_threshold")]
        public int ChallengeThreshold { get; set; } = 60;
        
        [JsonPropertyName("block_threshold")]
        public int BlockThreshold { get; set; } = 80;
        
        [JsonPropertyName("weight_sqli")]
        public int WeightSqli { get; set; } = 60;
        
        [JsonPropertyName("weight_xss")]
        public int WeightXss { get; set; } = 55;
        
        [JsonPropertyName("weight_path_traversal")]
        public int WeightPathTraversal { get; set; } = 50;
        
        [JsonPropertyName("weight_cmdi")]
        public int WeightCmdi { get; set; } = 65;
        
        [JsonPropertyName("weight_ssrf")]
        public int WeightSsrf { get; set; } = 45;
        
        [JsonPropertyName("weight_custom_rule")]
        public int WeightCustomRule { get; set; } = 40;
        
        [JsonPropertyName("weight_schema_viol")]
        public int WeightSchemaViol { get; set; } = 25;
        
        [JsonPropertyName("weight_ato")]
        public int WeightAto { get; set; } = 50;
        
        [JsonPropertyName("weight_bot_ua")]
        public int WeightBotUa { get; set; } = 30;
        
        [JsonPropertyName("weight_missing_ua")]
        public int WeightMissingUa { get; set; } = 20;
    }

    [Table("risk_events")]
    public class RiskEvent
    {
        [Key]
        [JsonPropertyName("id")]
        public string Id { get; set; } = Guid.NewGuid().ToString();
        
        [JsonPropertyName("tenant_id")]
        public string TenantId { get; set; }
        
        [JsonPropertyName("client_ip")]
        public string ClientIp { get; set; }
        
        [JsonPropertyName("method")]
        public string Method { get; set; }
        
        [JsonPropertyName("path")]
        public string Path { get; set; }
        
        [JsonPropertyName("risk_score")]
        public int RiskScore { get; set; }
        
        [JsonPropertyName("threat_type")]
        public string ThreatType { get; set; }
        
        [JsonPropertyName("action")]
        public string Action { get; set; }
        
        [JsonPropertyName("matched_pattern")]
        public string MatchedPattern { get; set; }
        
        [JsonPropertyName("timestamp")]
        public string Timestamp { get; set; }
    }
}

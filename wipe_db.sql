TRUNCATE TABLE alert_logs, audit_logs, blocked_fingerprints, custom_rules, domains, known_bots, rate_limits, security_settings, risk_thresholds, traffic_logs, owasp_exclusions, owasp_rule_overrides RESTART IDENTITY CASCADE;
DELETE FROM users WHERE email != 'admin@affinisecurity.io';
DELETE FROM tenants WHERE name != 'AffiniSecurity Global';

ALTER TABLE waf_events_audit ADD COLUMN IF NOT EXISTS schema_deviation UInt8 DEFAULT 0;

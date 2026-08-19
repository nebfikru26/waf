-- ═══════════════════════════════════════════════════════════════════════
-- AffiniSecurity 2.0 — ClickHouse Immutable Audit Schema Migration
-- Phase 4: SHA256 Hash Chain + Row-Level Protection
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- 1. Immutable WAF Events Audit Table (with hash chain)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS waf_events_audit
(
    -- Event identity
    event_id         UUID    DEFAULT generateUUIDv4() COMMENT 'Unique event ID',
    tenant_id        String  COMMENT 'Owning tenant',
    timestamp        DateTime64(3, 'UTC') DEFAULT now64(3),

    -- Request fields
    url              String,
    method           LowCardinality(String),
    body             String,
    ja4_fingerprint  String  COMMENT 'JA4 TLS client fingerprint',

    -- Detection output
    anomaly_score    Float32 COMMENT 'Composite AI score [0.0 - 1.0]',
    ml_score         Float32 COMMENT 'ONNX ML model probability',
    ast_score        Float32 COMMENT 'Semantic AST detection score',
    matches          Array(String) COMMENT 'Detection match descriptors',
    action           LowCardinality(String) COMMENT 'pass | challenge | block',

    -- Tamper-evident hash chain
    -- SHA256(prev_hash || event_id || timestamp || anomaly_score || url)
    prev_hash        FixedString(64) DEFAULT '0000000000000000000000000000000000000000000000000000000000000000',
    row_hash         FixedString(64) COMMENT 'SHA256 of this row content + prev_hash',

    -- Labeled ground truth (populated by security analysts post-incident)
    label            Nullable(UInt8) COMMENT '1=malicious, 0=benign, NULL=unreviewed'
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (tenant_id, timestamp, event_id)
SETTINGS
    allow_nullable_key = 0;

-- ─────────────────────────────────────────────────────────────────────
-- 2. View for analyst review / ML trainer dataset queries
-- ─────────────────────────────────────────────────────────────────────
CREATE VIEW IF NOT EXISTS waf_events_labeled AS
SELECT
    event_id,
    tenant_id,
    timestamp,
    url,
    method,
    body,
    ja4_fingerprint,
    anomaly_score,
    ml_score,
    ast_score,
    matches,
    action,
    label
FROM waf_events_audit
WHERE label IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────
-- 3. Row Policy — Skipped for local Docker dev environment
-- ─────────────────────────────────────────────────────────────────────


-- ─────────────────────────────────────────────────────────────────────
-- 4. Compliance summary view for regulatory reporting (INSA / GDPR)
-- ─────────────────────────────────────────────────────────────────────
CREATE VIEW IF NOT EXISTS waf_compliance_summary AS
SELECT
    tenant_id,
    toStartOfDay(timestamp)                  AS day,
    countIf(action = 'block')                AS total_blocked,
    countIf(action = 'challenge')            AS total_challenged,
    countIf(action = 'pass')                 AS total_passed,
    round(avg(anomaly_score), 4)             AS avg_anomaly_score,
    countIf(label = 1)                       AS confirmed_attacks,
    countIf(label = 0 AND action= 'block')  AS false_positives
FROM waf_events_audit
GROUP BY tenant_id, day
ORDER BY tenant_id, day DESC;

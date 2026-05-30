-- =============================================================================
-- AffiniSecurity WAF — Postgres Least-Privilege Role Initialization
-- Proclamation No. 1321/2024 Compliance (Data Protection)
-- Run this script ONCE as a superuser (postgres) before starting the application.
-- =============================================================================

-- 1. Create the dedicated audit user if it does not already exist.
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'waf_audit_user') THEN
        CREATE ROLE waf_audit_user WITH LOGIN PASSWORD 'audit_secret_change_me';
    END IF;
END
$$;

-- 2. Grant CONNECT privilege on the waf database.
GRANT CONNECT ON DATABASE waf TO waf_audit_user;

-- 3. Grant USAGE on the public schema so it can see the tables.
GRANT USAGE ON SCHEMA public TO waf_audit_user;

-- 4. Grant SELECT + INSERT ONLY on the audit_logs table.
--    This enforces the append-only mandate from Article 19 (Proclamation 1321/2024).
--    UPDATE and DELETE are deliberately withheld so no record can ever be altered.
GRANT SELECT, INSERT ON TABLE audit_logs TO waf_audit_user;

-- 5. Grant SELECT + INSERT + UPDATE + DELETE on ALL other application tables
--    so the main application user can continue operating normally.
--    (The main app still uses the postgres superuser connection for EF Migrations.)
--    NOTE: Replace 'waf_app_user' below if you create a dedicated app role for all other tables.
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO waf_app_user;

-- Confirmation message
DO $$ BEGIN RAISE NOTICE 'waf_audit_user role configured with APPEND-ONLY access to audit_logs.'; END $$;

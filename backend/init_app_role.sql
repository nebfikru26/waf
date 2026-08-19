-- =============================================================================
-- AffiniSecurity WAF — Least-Privilege Application Role (for Row-Level Security)
-- Run this script ONCE as a superuser (postgres) before starting the application,
-- then point ConnectionStrings:DefaultConnection at `waf_app_user` instead of the
-- `postgres` superuser.
--
-- WHY THIS IS NEEDED:
-- Postgres Row-Level Security (see DbInitializer.ApplyRowLevelSecurity) is *always*
-- bypassed for superusers and roles with the BYPASSRLS attribute, regardless of
-- FORCE ROW LEVEL SECURITY. The app currently connects as `postgres` (a superuser),
-- so RLS policies would be created but silently never enforced. This script creates
-- a normal, non-superuser role that owns the application tables, so RLS actually
-- takes effect as a second, database-level isolation layer beneath the existing
-- EF Core tenant query filter.
-- =============================================================================

-- 1. Create the dedicated application role if it does not already exist.
--    NOSUPERUSER + NOBYPASSRLS are the important bits: this role is subject to RLS.
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'waf_app_user') THEN
        CREATE ROLE waf_app_user WITH LOGIN PASSWORD 'app_secret_change_me' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
    END IF;
END
$$;

-- 2. Grant CONNECT on the database and USAGE + CREATE on the public schema.
--    CREATE is required so EF Core's EnsureCreated()/DbInitializer manual schema
--    patches (ALTER TABLE ... ADD COLUMN, CREATE TABLE IF NOT EXISTS, etc.) keep
--    working when run under this role.
GRANT CONNECT ON DATABASE waf TO waf_app_user;
GRANT USAGE, CREATE ON SCHEMA public TO waf_app_user;

-- 3. Transfer ownership of all existing tables/sequences to waf_app_user.
--    Table ownership (not just GRANT) is required to run ALTER TABLE ... ENABLE/FORCE
--    ROW LEVEL SECURITY and CREATE POLICY, and to run future ALTER TABLE migrations.
DO $$
DECLARE
    obj RECORD;
BEGIN
    FOR obj IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE format('ALTER TABLE public.%I OWNER TO waf_app_user', obj.tablename);
    END LOOP;

    FOR obj IN SELECT sequencename FROM pg_sequences WHERE schemaname = 'public' LOOP
        EXECUTE format('ALTER SEQUENCE public.%I OWNER TO waf_app_user', obj.sequencename);
    END LOOP;
END
$$;

-- 4. Ensure any tables created later (future EF migrations run under this role) are
--    automatically owned by/grantable to this same role.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO waf_app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO waf_app_user;

-- Confirmation message
DO $$ BEGIN RAISE NOTICE 'waf_app_user role configured as owner of all application tables (RLS-enforced, non-superuser).'; END $$;

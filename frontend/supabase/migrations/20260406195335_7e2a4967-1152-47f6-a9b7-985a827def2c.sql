
-- WAF Policies (per-user WAF configuration)
CREATE TABLE public.waf_policies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  waf_mode TEXT NOT NULL DEFAULT 'detection' CHECK (waf_mode IN ('detection', 'blocking')),
  rate_limit_per_minute INTEGER NOT NULL DEFAULT 100,
  geo_filter_enabled BOOLEAN NOT NULL DEFAULT false,
  geo_filter_mode TEXT NOT NULL DEFAULT 'allowlist' CHECK (geo_filter_mode IN ('allowlist', 'blocklist')),
  geo_filter_countries TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);
ALTER TABLE public.waf_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own waf_policies" ON public.waf_policies FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins manage all waf_policies" ON public.waf_policies FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER update_waf_policies_updated_at BEFORE UPDATE ON public.waf_policies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- IP Rules (whitelist/blacklist)
CREATE TABLE public.ip_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  ip_address TEXT NOT NULL,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('whitelist', 'blacklist')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ip_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own ip_rules" ON public.ip_rules FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins manage all ip_rules" ON public.ip_rules FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- URI Exclusions
CREATE TABLE public.uri_exclusions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  uri_pattern TEXT NOT NULL,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.uri_exclusions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own uri_exclusions" ON public.uri_exclusions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins manage all uri_exclusions" ON public.uri_exclusions FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- OWASP Rules (per-user toggles)
CREATE TABLE public.owasp_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  rule_id TEXT NOT NULL,
  rule_name TEXT NOT NULL,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, rule_id)
);
ALTER TABLE public.owasp_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own owasp_rules" ON public.owasp_rules FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins manage all owasp_rules" ON public.owasp_rules FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER update_owasp_rules_updated_at BEFORE UPDATE ON public.owasp_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Domains (per-user domain management)
CREATE TABLE public.domains (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  domain_name TEXT NOT NULL,
  origin_ip TEXT NOT NULL,
  ssl_mode TEXT NOT NULL DEFAULT 'Full' CHECK (ssl_mode IN ('Full', 'Flexible')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('active', 'pending', 'error')),
  ssl_provisioned BOOLEAN NOT NULL DEFAULT false,
  dns_verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.domains ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own domains" ON public.domains FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins manage all domains" ON public.domains FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER update_domains_updated_at BEFORE UPDATE ON public.domains FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Attack Logs
CREATE TABLE public.attack_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  ip_address TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  rule_name TEXT NOT NULL,
  uri TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  action TEXT NOT NULL CHECK (action IN ('blocked', 'detected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.attack_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own attack_logs" ON public.attack_logs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins view all attack_logs" ON public.attack_logs FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Analysts view all attack_logs" ON public.attack_logs FOR SELECT TO authenticated USING (has_role(auth.uid(), 'analyst'::app_role));
CREATE POLICY "Users insert own attack_logs" ON public.attack_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

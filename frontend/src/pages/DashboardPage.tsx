import { useState } from "react";
import { Shield, ShieldCheck, ShieldAlert, ShieldX, Activity, Bug, Key, Bot, UserX, Zap, Lock, BellRing, TrendingUp, TrendingDown, Globe, ArrowRight, Server, Building2, LogIn, Loader2, BarChart3, Brain, Database, Cpu } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from "recharts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

function StatCard({ icon: Icon, label, value, subtext, variant = "default" }: {
  icon: React.ElementType;
  label: string;
  value: string;
  subtext?: string;
  variant?: "default" | "success" | "destructive" | "warning";
}) {
  const iconColors = {
    default: "text-primary",
    success: "text-success",
    destructive: "text-destructive",
    warning: "text-warning",
  };

  return (
    <div className="stat-card group">
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2.5 rounded-xl bg-muted/50 transition-colors group-hover:bg-muted ${iconColors[variant]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <span className="text-sm font-medium text-muted-foreground tracking-tight">{label}</span>
      </div>
      <p className="text-3xl font-black font-mono tracking-tighter">{value}</p>
      {subtext && (
        <div className="flex items-center gap-1.5 mt-2">
          <div className="h-1 w-1 rounded-full bg-primary/40" />
          <p className="text-[10px] uppercase font-bold text-muted-foreground/60 tracking-widest">{subtext}</p>
        </div>
      )}
    </div>
  );
}

function ModuleCard({ icon: Icon, title, status, statusColor, metric, metricLabel, trend, trendUp, isLocked, href }: {
  icon: React.ElementType;
  title: string;
  status: string;
  statusColor: string;
  metric: string;
  metricLabel: string;
  trend?: string;
  trendUp?: boolean;
  isLocked?: boolean;
  href?: string;
}) {
  const navigate = useNavigate();

  return (
    <div
      onClick={() => href && navigate(isLocked ? "/billing" : href)}
      className={`glass-card p-5 transition-all duration-300 relative overflow-hidden group
        ${href ? "cursor-pointer" : ""}
        ${isLocked
          ? "opacity-60 grayscale hover:opacity-75"
          : "hover:border-primary/40 hover:-translate-y-1.5 hover:shadow-2xl hover:shadow-primary/10"
        }`}
    >
      {/* Glow Effect on hover */}
      <div className="absolute -inset-1 bg-gradient-to-r from-primary/0 via-primary/5 to-primary/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-xl pointer-events-none" />

      {isLocked && (
        <div className="absolute top-3 right-3">
          <div className="bg-muted border border-border rounded-lg px-2 py-1 flex items-center gap-1.5">
            <Lock className="h-3 w-3 text-muted-foreground" />
            <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Locked</span>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between mb-4 relative z-10">
        <div className="flex items-center gap-2.5">
          <div className={`p-1.5 rounded-lg ${isLocked ? "bg-muted" : "bg-primary/10"}`}>
            <Icon className={`h-4 w-4 ${isLocked ? "text-muted-foreground" : "text-primary"}`} />
          </div>
          <span className="text-sm font-bold tracking-tight">{title}</span>
        </div>
        {!isLocked && (
          <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${statusColor === 'bg-success/20 text-success' ? 'border-success/20 bg-success/10 text-success' : 'border-destructive/20 bg-destructive/10 text-destructive'}`}>
            {status}
          </span>
        )}
      </div>
      <p className={`text-2xl font-black font-mono tracking-tighter relative z-10 ${isLocked ? "text-muted-foreground/50" : ""}`}>{metric}</p>
      <div className="flex items-center justify-between mt-2 relative z-10">
        <span className="text-[11px] font-medium text-muted-foreground opacity-70">{metricLabel}</span>
        {trend && !isLocked && (
          <span className={`text-[10px] font-black flex items-center gap-1 px-1.5 py-0.5 rounded bg-background/40 ${trendUp ? "text-destructive" : "text-success"}`}>
            {trendUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {trend}
          </span>
        )}
      </div>
      {isLocked && (
        <p className="text-[10px] text-primary font-black uppercase tracking-widest mt-3 flex items-center gap-1.5 opacity-80 relative z-10">
          <Zap className="h-3 w-3 fill-primary" /> Upgrade Required
        </p>
      )}
    </div>
  );
}

const chartTooltipStyle = {
  backgroundColor: "rgba(255, 255, 255, 0.95)",
  backdropFilter: "blur(8px)",
  border: "1px solid rgba(0, 0, 0, 0.05)",
  borderRadius: "12px",
  color: "hsl(222, 47%, 11%)",
  fontSize: "11px",
  fontFamily: "'JetBrains Mono', monospace",
  boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
};

export default function DashboardPage() {
  const { user, isLoading, impersonateTenant } = useAuth();
  const isPlatformAdmin = user?.role === "super_admin" || user?.role === "admin" || user?.role === "support_engineer";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [tenantSearchTerm, setTenantSearchTerm] = useState("");

  const headers = {
    "Content-Type": "application/json"
  };

  const { data: trafficData = [] } = useQuery({
    queryKey: ["traffic", user?.tenantId],
    queryFn: () => fetch("/api/traffic", { headers }).then(r => r.json())
  });

  const { data: topIPs = [] } = useQuery({
    queryKey: ["topIPs", user?.tenantId],
    queryFn: () => fetch("/api/analytics/ips", { headers }).then(r => r.json())
  });

  const { data: countryData = [] } = useQuery({
    queryKey: ["countries", user?.tenantId],
    queryFn: () => fetch("/api/analytics/countries", { headers }).then(r => r.json())
  });

  const { data: attackTypes = [] } = useQuery({
    queryKey: ["attacks", user?.tenantId],
    queryFn: () => fetch("/api/analytics/attacks", { headers }).then(r => r.json())
  });

  const { data: alertLogs = [] } = useQuery({
    queryKey: ["alerts", user?.tenantId],
    queryFn: () => fetch("/api/alerts", { headers }).then(r => r.json())
  });

  const { data: stats } = useQuery({
    queryKey: ["stats", user?.tenantId],
    queryFn: () => fetch("/api/analytics/stats", { headers }).then(r => r.json())
  });

  const { data: domains = [], isLoading: isLoadingDomains } = useQuery({
    queryKey: ["domains", user?.tenantId],
    queryFn: () => fetch("/api/domains", { headers }).then(r => r.json())
  });

  const { data: crsStats } = useQuery({
    queryKey: ["crs-stats-global"],
    queryFn: () => fetch("/api/analytics/crs", { headers }).then(r => r.json()),
    enabled: isPlatformAdmin
  });

  const { data: bulletins } = useQuery({
    queryKey: ["cms-bulletins"],
    queryFn: () => fetch("/api/cms/bulletins", { headers }).then(r => r.json())
  });

  const { data: aiHealth } = useQuery({
    queryKey: ["ai-health", user?.tenantId],
    queryFn: () => fetch("/api/firewall/ai-health", { headers }).then(r => r.json()).catch(() => ({ status: "offline", requests_total: 0 })),
    refetchInterval: 30000
  });

  const { data: tenants = [], isLoading: isLoadingTenants } = useQuery({
    queryKey: ["admin-tenants"],
    queryFn: () => fetch("/api/admin/tenants", { headers }).then(r => r.json()),
    enabled: user?.role === "super_admin"
  });

  const safeTrafficData = Array.isArray(trafficData) ? trafficData : [];
  const safeAlertLogs = Array.isArray(alertLogs) ? alertLogs : [];

  const threatCategories = Object.values(
    safeAlertLogs.reduce((acc: any, log: any) => {
      const cat = log.rule || "Other";
      if (!acc[cat]) acc[cat] = { category: cat, count: 0, severity: (log.severity || "medium").toLowerCase(), mitigated: 0 };
      acc[cat].count++;
      if (log.action === "BLOCK" || log.action === "blocked") acc[cat].mitigated++;
      return acc;
    }, {})
  ).map((c: any) => ({
    ...c,
    trend: "+0%" // Placeholder for trend since we don't have historical category data yet
  })).sort((a: any, b: any) => b.count - a.count);

  const totalRequests = safeTrafficData.reduce((s: number, d: any) => s + (d?.requests || 0), 0);
  const totalBlocked = safeTrafficData.reduce((s: number, d: any) => s + (d?.blocked || 0), 0);
  const recentAlerts = safeAlertLogs.filter((a: any) => a?.severity?.toLowerCase() === "critical").length;
  const blockRate = totalRequests > 0 ? ((totalBlocked / totalRequests) * 100).toFixed(1) : "0.0";

  if (isLoading || !user) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  const safeDomains = Array.isArray(domains) ? domains : [];
  const safeTenants = Array.isArray(tenants) ? tenants : [];
  const showWizard = !isPlatformAdmin && !isLoadingDomains && safeDomains.length === 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">

        {showWizard && (
          <div className="bg-card border-2 border-primary/50 shadow-2xl shadow-primary/10 rounded-xl p-8 max-w-4xl mx-auto my-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-16 bg-primary/5 rounded-bl-full pointer-events-none" />
            <div className="flex flex-col md:flex-row gap-8 items-center relative z-10">
              <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center shrink-0 border-4 border-background shadow-xl">
                <Globe className="h-10 w-10 text-primary" />
              </div>
              <div className="flex-1 space-y-3 text-center md:text-left">
                <h2 className="text-2xl font-black">Welcome to Affinisecurity</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Your workspace is ready. To begin protecting your infrastructure and analyzing traffic, you need to add your first domain and point your DNS records to our edge network.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 pt-4">
                  <Button onClick={() => navigate("/domains?add=true")} className="glow-primary h-12 px-6">
                    <Server className="h-4 w-4 mr-2" /> ADD YOUR FIRST DOMAIN <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-10 pt-8 border-t border-border/50">
              <div className="space-y-2">
                <div className="text-primary font-mono text-xs font-bold mb-2 p-1.5 bg-primary/10 inline-block rounded">STEP 1</div>
                <h4 className="font-bold text-sm">Add Domain Property</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">Tell the WAF which domain name to expect traffic for.</p>
              </div>
              <div className="space-y-2 opacity-60">
                <div className="text-muted-foreground font-mono text-xs font-bold mb-2 p-1.5 bg-muted inline-block rounded">STEP 2</div>
                <h4 className="font-bold text-sm">SSL Provisioning</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">We automatically generate and deploy a TLS cert.</p>
              </div>
              <div className="space-y-2 opacity-60">
                <div className="text-muted-foreground font-mono text-xs font-bold mb-2 p-1.5 bg-muted inline-block rounded">STEP 3</div>
                <h4 className="font-bold text-sm">Update DNS</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">Point your CNAME or A records to the Affini Edge.</p>
              </div>
            </div>
          </div>
        )}

        {/* Existing Content wrapped to handle blur if wizard is shown */}
        <div className={showWizard ? "opacity-30 pointer-events-none grayscale transition-all duration-1000 blur-sm" : ""}>
          <div className="mb-6">
            <h1 className="text-xl font-bold">Security Overview</h1>
            <p className="text-sm text-muted-foreground">Real-time AI-Native WAAP monitoring &middot; v2.0</p>
          </div>

          {/* Primary Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={Activity} label="Total Requests" value={totalRequests.toLocaleString()} subtext="Last 24 hours" />
            <StatCard icon={ShieldX} label="Blocked" value={totalBlocked.toLocaleString()} subtext={`${blockRate}% block rate`} variant="destructive" />
            <StatCard icon={Shield} label="Active Rules" value={String(stats?.activeRules ?? stats?.active_rules ?? 0)} subtext="OWASP CRS v3.3" variant="success" />
            <StatCard icon={Bug} label="Critical Threats" value={String(stats?.criticalThreats ?? stats?.critical_threats ?? recentAlerts)} subtext="Last hour" variant="warning" />
          </div>

          {/* AI Engine Status Widget */}
          <div className="bg-card border border-border/60 rounded-xl p-4 shadow-sm">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${aiHealth?.status === "online" ? "bg-primary/20" : "bg-destructive/20"}`}>
                  <Brain className={`h-5 w-5 ${aiHealth?.status === "online" ? "text-primary" : "text-destructive"}`} />
                </div>
                <div>
                  <h3 className="text-sm font-bold flex items-center gap-2">
                    AI Threat Inference Engine
                    <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border ${aiHealth?.status === "online" ? "bg-success/10 text-success border-success/20" : "bg-destructive/10 text-destructive border-destructive/20"}`}>
                      {aiHealth?.status || "offline"}
                    </span>
                  </h3>
                  <p className="text-[10px] text-muted-foreground max-w-lg mt-0.5">
                    Dual-Engine ML + AST pipeline. XGBoost ONNX model hot-reload active.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1 flex items-center justify-end gap-1.5"><Database className="h-3 w-3" /> ONNX Loaded</div>
                  <div className="text-sm font-mono font-bold">{aiHealth?.onnx_loaded !== false ? 'True' : 'False'}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1 flex items-center justify-end gap-1.5"><Cpu className="h-3 w-3" /> Avg Latency</div>
                  <div className="text-sm font-mono font-bold">{aiHealth?.avg_latency_ms || "0"}ms</div>
                </div>
              </div>
            </div>
          </div>

          {/* Security Module Summary Cards */}
          <div>
            <h3 className="text-sm font-medium mb-3 text-muted-foreground uppercase tracking-wider">Security Modules</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              <ModuleCard
                icon={Brain}
                title="AI Engine"
                href="/admin/ai-threats"
                isLocked={!isPlatformAdmin && !user?.entitlements?.hasWafDetection}
                status={aiHealth?.status === "online" ? "Active" : "Offline"}
                statusColor={aiHealth?.status === "online" ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive"}
                metric={(aiHealth?.requests_total ?? (stats?.wafEvents ?? stats?.waf_events ?? 0)).toLocaleString()}
                metricLabel="ML inferences ran"
                trend="+0%"
                trendUp
              />
              <ModuleCard
                icon={ShieldCheck}
                title="WAF Core"
                href="/alerts"
                isLocked={!isPlatformAdmin && !user?.entitlements?.hasWafDetection}
                status="Active"
                statusColor="bg-success/20 text-success"
                metric={(isPlatformAdmin || user?.entitlements?.hasWafDetection) ? (stats?.wafEvents?.toLocaleString() ?? stats?.waf_events?.toLocaleString() ?? "0") : "—"}
                metricLabel="WAF events analyzed"
                trend={(isPlatformAdmin || user?.entitlements?.hasWafDetection) ? "+0%" : undefined}
                trendUp
              />
              <ModuleCard
                icon={Key}
                title="API Protection"
                href="/api-protection"
                isLocked={!isPlatformAdmin && !user?.entitlements?.hasApiProtection}
                status="Active"
                statusColor="bg-success/20 text-success"
                metric={(isPlatformAdmin || user?.entitlements?.hasApiProtection) ? (stats?.apiThreats?.toLocaleString() ?? stats?.api_threats?.toLocaleString() ?? "0") : "—"}
                metricLabel="API threats blocked"
                trend={(isPlatformAdmin || user?.entitlements?.hasApiProtection) ? "+0%" : undefined}
                trendUp
              />
              <ModuleCard
                icon={Bot}
                title="Bot Protection"
                href="/bot-protection"
                isLocked={!isPlatformAdmin && !user?.entitlements?.hasBotProtection}
                status="Active"
                statusColor="bg-success/20 text-success"
                metric={(isPlatformAdmin || user?.entitlements?.hasBotProtection) ? (stats?.botThreats?.toLocaleString() ?? stats?.bot_threats?.toLocaleString() ?? "0") : "—"}
                metricLabel="Bot threats identified"
                trend={(isPlatformAdmin || user?.entitlements?.hasBotProtection) ? "+0%" : undefined}
                trendUp
              />
              <ModuleCard
                icon={BarChart3}
                title="Analytics"
                href="/analytics"
                isLocked={!isPlatformAdmin && !user?.entitlements?.hasAnalytics}
                status="Live"
                statusColor="bg-success/20 text-success"
                metric={(isPlatformAdmin || user?.entitlements?.hasAnalytics) ? "24ms" : "—"}
                metricLabel="Avg query latency"
                trend={(isPlatformAdmin || user?.entitlements?.hasAnalytics) ? "-2%" : undefined}
                trendUp={false}
              />
              <ModuleCard
                icon={UserX}
                title="Acct Takeover"
                href="/account-takeover"
                isLocked={!isPlatformAdmin && !user?.entitlements?.hasAccountTakeover}
                status="Active"
                statusColor="bg-success/20 text-success"
                metric={(isPlatformAdmin || user?.entitlements?.hasAccountTakeover) ? (stats?.atoAttempts?.toLocaleString() ?? stats?.ato_attempts?.toLocaleString() ?? "0") : "—"}
                metricLabel="Attempts blocked"
                trend={(isPlatformAdmin || user?.entitlements?.hasAccountTakeover) ? "-0%" : undefined}
                trendUp={false}
              />
              <ModuleCard
                icon={Zap}
                title="DDoS"
                href="/ddos-protection"
                isLocked={!isPlatformAdmin && !user?.entitlements?.hasDdosProtection}
                status="Active"
                statusColor="bg-success/20 text-success"
                metric={(isPlatformAdmin || user?.entitlements?.hasDdosProtection) ? (stats?.ddosEvents?.toLocaleString() ?? stats?.ddos_events?.toLocaleString() ?? "0") : "—"}
                metricLabel="Attacks mitigated"
                trend={(isPlatformAdmin || user?.entitlements?.hasDdosProtection) ? "-8%" : undefined}
                trendUp={false}
              />
              <ModuleCard
                icon={Lock}
                title="SSL/TLS"
                href="/ssl-management"
                isLocked={!isPlatformAdmin && !user?.entitlements?.hasSslManagement}
                status="Healthy"
                statusColor="bg-success/20 text-success"
                metric={(isPlatformAdmin || user?.entitlements?.hasSslManagement) ? `${safeDomains.filter(d => d.sslStatus === 'active').length}/${Math.max(safeDomains.length, 1)}` : "—"}
                metricLabel="Certs provisioned"
              />
              <ModuleCard
                icon={BellRing}
                title="Alerts"
                href="/alerts"
                isLocked={!isPlatformAdmin && !user?.entitlements?.hasAttackLogs}
                status={`${recentAlerts} Critical`}
                statusColor="bg-destructive/20 text-destructive"
                metric={(isPlatformAdmin || user?.entitlements?.hasAttackLogs) ? String(safeAlertLogs.length) : "—"}
                metricLabel="Active alerts"
                trend={(isPlatformAdmin || user?.entitlements?.hasAttackLogs) ? "+5%" : undefined}
                trendUp
              />
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="chart-container group">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground/80">Requests Over Time</h3>
                <div className="flex gap-2">
                  <span className="flex items-center gap-1 text-[10px] font-mono text-primary"><span className="w-2 h-2 rounded-full bg-primary" /> REQ</span>
                  <span className="flex items-center gap-1 text-[10px] font-mono text-destructive"><span className="w-2 h-2 rounded-full bg-destructive" /> BLK</span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={safeTrafficData}>
                  <defs>
                    <linearGradient id="colorReq" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorBlk" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(0, 84%, 60%)" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="hsl(0, 84%, 60%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                  <XAxis dataKey="time" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={chartTooltipStyle} />
                  <Area type="monotone" dataKey="requests" stroke="hsl(217, 91%, 60%)" fill="url(#colorReq)" strokeWidth={3} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                  <Area type="monotone" dataKey="blocked" stroke="hsl(0, 84%, 60%)" fill="url(#colorBlk)" strokeWidth={3} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="chart-container group">
              <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground/80 mb-6">Top Attack Vectors</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={Array.isArray(attackTypes) ? attackTypes : []} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" horizontal={false} />
                  <XAxis type="number" hide />
                  <YAxis dataKey="type" type="category" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.6)" }} width={100} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={chartTooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                  <Bar dataKey="count" fill="hsl(217, 91%, 60%)" radius={[0, 6, 6, 0]} barSize={20}>
                    {Array.isArray(attackTypes) && attackTypes.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fillOpacity={1 - (index * 0.15)} fill="hsl(217, 91%, 60%)" />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Threat Categories Summary */}
          <div className="bg-card border border-border rounded-lg p-5">
            <h3 className="text-sm font-medium mb-4">Threat Mitigation Summary</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {threatCategories.slice(0, 4).map((cat) => {
                const mitigationRate = ((cat.mitigated / cat.count) * 100).toFixed(1);
                return (
                  <div key={cat.category} className="p-3 rounded-md bg-muted/30">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium">{cat.category}</span>
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${cat.severity === "critical" ? "bg-destructive/20 text-destructive" :
                        cat.severity === "high" ? "bg-warning/20 text-warning" :
                          "bg-secondary text-muted-foreground"
                        }`}>{cat.severity}</span>
                    </div>
                    <p className="text-lg font-bold font-mono">{cat.count.toLocaleString()}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-muted-foreground">{mitigationRate}% mitigated</span>
                      <span className={`text-xs font-mono ${cat.trend.startsWith("+") ? "text-destructive" : "text-success"}`}>{cat.trend}</span>
                    </div>
                    <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${mitigationRate}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top IPs & Countries */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="chart-container">
              <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground/80 mb-6">Top Attack Sources (IP)</h3>
              <div className="space-y-3">
                {(Array.isArray(topIPs) ? topIPs : []).map((ip) => (
                  <div key={ip.ip} className="flex items-center justify-between py-3 px-4 rounded-xl bg-slate-50 border border-slate-100 hover:border-primary/30 transition-all group cursor-default">
                    <div className="flex items-center gap-4">
                      <div className="h-2 w-2 rounded-full bg-primary animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                      <span className="font-mono text-sm font-bold tracking-tight text-slate-800">{ip.ip}</span>
                      <span className="text-[10px] bg-slate-200 px-2 py-0.5 rounded-full font-black text-muted-foreground uppercase">{ip.country}</span>
                    </div>
                    <div className="flex items-center gap-6 text-[11px] font-mono font-bold">
                      <span className="text-muted-foreground/80">{ip.requests.toLocaleString()} REQ</span>
                      {ip.blocked > 0 && <span className="text-destructive px-2 py-0.5 rounded bg-destructive/10 border border-destructive/20">{ip.blocked} BLK</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="chart-container">
              <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground/80 mb-6">Geographic Distribution</h3>
              <div className="space-y-3">
                {(Array.isArray(countryData) ? countryData : []).map((c) => (
                  <div key={c.code} className="flex items-center justify-between py-3 px-4 rounded-xl bg-slate-50 border border-slate-100 hover:border-primary/30 transition-all group cursor-default">
                    <div className="flex items-center gap-4">
                      <Globe className="h-3.5 w-3.5 text-primary opacity-50 group-hover:opacity-100 transition-opacity" />
                      <span className="text-sm font-bold text-slate-800">{c.country}</span>
                      <span className="text-[10px] bg-slate-200 px-2 py-0.5 rounded-full font-black text-muted-foreground uppercase">{c.code}</span>
                    </div>
                    <div className="flex items-center gap-6 text-[11px] font-mono font-bold">
                      <span className="text-muted-foreground/80">{c.requests.toLocaleString()} REQ</span>
                      <span className="text-destructive px-2 py-0.5 rounded bg-destructive/10 border border-destructive/20">{c.blocked.toLocaleString()} BLK</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="chart-container lg:col-span-2">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-destructive/10">
                    <ShieldAlert className="h-5 w-5 text-destructive animate-pulse" />
                  </div>
                  <h3 className="text-sm font-black uppercase tracking-widest text-slate-900">AffiniSecurity Intel Feed</h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
                  <span className="text-[10px] font-black text-success uppercase tracking-widest">Live Updates</span>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(Array.isArray(bulletins) && bulletins.filter((b: any) => b.isActive !== false).length > 0) ?
                  bulletins.filter((b: any) => b.isActive !== false).map((b: any) => (
                    <div key={b.id} className="p-4 rounded-2xl bg-slate-50 border border-slate-200 hover:border-destructive/30 transition-all relative overflow-hidden group">
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-destructive/20 group-hover:bg-destructive transition-colors" />
                      <div className="flex justify-between items-start mb-3">
                        <h4 className="text-sm font-black text-slate-900 group-hover:text-destructive transition-colors tracking-tight">{b.title}</h4>
                        <span className="text-[10px] font-mono font-bold text-muted-foreground/60">{b.date}</span>
                      </div>
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <span className={`text-[9px] uppercase font-black px-2 py-0.5 rounded-full border tracking-widest ${b.severity === 'Critical' ? 'bg-destructive/10 text-destructive border-destructive/20' :
                            b.severity === 'High' ? 'bg-warning/10 text-warning border-warning/20' :
                              'bg-primary/10 text-primary border-primary/20'
                            }`}>
                            {b.severity}
                          </span>
                        </div>
                        {b.content && (
                          <p className="text-xs text-slate-600 leading-relaxed font-medium">
                            {b.content}
                          </p>
                        )}
                      </div>
                    </div>
                  )) : (
                    <div className="md:col-span-2 flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50">
                      <ShieldCheck className="h-12 w-12 text-success/30 mx-auto mb-4" />
                      <p className="text-sm font-bold text-slate-600 uppercase tracking-widest">Registry State: Verified Secure</p>
                      <p className="text-xs text-slate-400 mt-1 uppercase font-mono tracking-tighter">No active threat bulletins detected in the last cycle</p>
                    </div>
                  )}
              </div>
            </div>
          </div>

          {/* Super Admin: CRS Intelligence Section */}
          {isPlatformAdmin && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">CRS Threat Intelligence</h3>
                <Button variant="link" size="sm" onClick={() => navigate("/crs-dashboard")} className="text-primary text-xs">
                  VIEW FULL REPORT <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Simplified Rule Chart for Dashboard */}
                <div className="bg-card border border-border rounded-lg p-5">
                  <h4 className="text-xs font-bold uppercase mb-4 text-muted-foreground">Most Triggered Rules (Global)</h4>
                  <div className="space-y-3">
                    {/* We can fetch this separately or use a smaller inline query */}
                    {(Array.isArray(crsStats?.topRules) ? crsStats.topRules : []).slice(0, 5).map((rule: any) => (
                      <div key={rule.id} className="flex items-center justify-between p-2 rounded bg-muted/20 border border-border/50">
                        <div className="flex flex-col">
                          <span className="text-[10px] font-bold font-mono text-primary">ID: {rule.id}</span>
                          <span className="text-[10px] text-muted-foreground truncate max-w-[250px]">{rule.name}</span>
                        </div>
                        <span className="text-xs font-bold font-mono">{rule.count.toLocaleString()}</span>
                      </div>
                    ))}
                    {(!crsStats?.topRules || crsStats.topRules.length === 0) && (
                      <div className="p-10 text-center border border-dashed rounded-lg">
                        <ShieldCheck className="h-8 w-8 text-primary/40 mx-auto mb-2" />
                        <p className="text-[10px] text-muted-foreground uppercase">Registry state is clean - No rules triggered</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-card border border-border rounded-lg p-5">
                  <h4 className="text-xs font-bold uppercase mb-4 text-muted-foreground">Platform Anomaly Score Distribution</h4>
                  <div className="h-48 flex items-center justify-center">
                    {Array.isArray(crsStats?.severityDistribution) && crsStats.severityDistribution.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={crsStats.severityDistribution}>
                          <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(215, 15%, 55%)" }} />
                          <YAxis hide />
                          <Tooltip contentStyle={chartTooltipStyle} cursor={{ fill: 'transparent' }} />
                          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                            {crsStats.severityDistribution.map((entry: any, index: number) => (
                              <Cell key={`cell-${index}`} fill={
                                entry.name === "CRITICAL" ? "hsl(0, 72%, 51%)" :
                                  entry.name === "HIGH" ? "hsl(35, 92%, 50%)" :
                                    "hsl(187, 94%, 43%)"
                              } />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex flex-col items-center">
                        <Activity className="h-8 w-8 text-primary/40 mb-2" />
                        <p className="text-[10px] text-muted-foreground uppercase font-mono">No anomaly distribution data</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

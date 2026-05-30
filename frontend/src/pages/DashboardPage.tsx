import { useState } from "react";
import { Shield, ShieldCheck, ShieldAlert, ShieldX, Activity, Bug, Key, Bot, UserX, Zap, Lock, BellRing, TrendingUp, TrendingDown, Globe, ArrowRight, Server, Building2, LogIn, Loader2, BarChart3 } from "lucide-react";
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
    <div className="stat-card">
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2 rounded-lg bg-muted ${iconColors[variant]}`}>
          <Icon className="h-4 w-4" />
        </div>
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <p className="text-2xl font-bold font-mono">{value}</p>
      {subtext && <p className="text-xs text-muted-foreground mt-1">{subtext}</p>}
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
      className={`bg-card border rounded-lg p-4 transition-all duration-200 relative overflow-hidden
        ${href ? "cursor-pointer" : ""}
        ${isLocked 
          ? "border-border opacity-60 grayscale hover:opacity-75" 
          : "border-border hover:border-primary/40 hover:shadow-md hover:shadow-primary/5"
        }`}
    >
      {/* Lock badge for locked modules */}
      {isLocked && (
        <div className="absolute top-2 right-2">
          <div className="bg-muted border border-border rounded px-1.5 py-0.5 flex items-center gap-1">
            <Lock className="h-2.5 w-2.5 text-muted-foreground" />
            <span className="text-[9px] font-mono text-muted-foreground uppercase">Locked</span>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${isLocked ? "text-muted-foreground" : "text-primary"}`} />
          <span className="text-sm font-medium">{title}</span>
        </div>
        {!isLocked && (
          <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded ${statusColor}`}>{status}</span>
        )}
      </div>
      <p className={`text-xl font-bold font-mono ${isLocked ? "text-muted-foreground/50" : ""}`}>{metric}</p>
      <div className="flex items-center justify-between mt-1">
        <span className="text-xs text-muted-foreground">{metricLabel}</span>
        {trend && !isLocked && (
          <span className={`text-xs font-mono flex items-center gap-1 ${trendUp ? "text-destructive" : "text-success"}`}>
            {trendUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {trend}
          </span>
        )}
      </div>
      {isLocked && (
        <p className="text-[10px] text-primary/70 font-mono mt-2 flex items-center gap-1">
          <Zap className="h-2.5 w-2.5" /> Upgrade to unlock
        </p>
      )}
    </div>
  );
}

const chartTooltipStyle = {
  backgroundColor: "hsl(220, 22%, 10%)",
  border: "1px solid hsl(220, 18%, 18%)",
  borderRadius: "8px",
  color: "hsl(210, 20%, 92%)",
  fontSize: "12px",
  fontFamily: "'JetBrains Mono', monospace",
};

export default function DashboardPage() {
  const { user, isLoading, impersonateTenant } = useAuth();
  const isPlatformAdmin = user?.role === "super_admin" || user?.role === "admin" || user?.role === "support_engineer";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [tenantSearchTerm, setTenantSearchTerm] = useState("");

  const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
  const headers = {
    "Authorization": `Bearer ${token}`,
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
            <p className="text-sm text-muted-foreground">Real-time WAF monitoring dashboard</p>
          </div>

        {/* Primary Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Activity} label="Total Requests" value={totalRequests.toLocaleString()} subtext="Last 24 hours" />
          <StatCard icon={ShieldX} label="Blocked" value={totalBlocked.toLocaleString()} subtext={`${blockRate}% block rate`} variant="destructive" />
          <StatCard icon={Shield} label="Active Rules" value={String(stats?.activeRules ?? stats?.active_rules ?? 0)} subtext="OWASP CRS v3.3" variant="success" />
          <StatCard icon={Bug} label="Critical Threats" value={String(stats?.criticalThreats ?? stats?.critical_threats ?? recentAlerts)} subtext="Last hour" variant="warning" />
        </div>

        {/* Security Module Summary Cards */}
        <div>
          <h3 className="text-sm font-medium mb-3 text-muted-foreground uppercase tracking-wider">Security Modules</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-card border border-border rounded-lg p-5">
            <h3 className="text-sm font-medium mb-4">Requests Over Time</h3>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={safeTrafficData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 18%, 18%)" />
                <XAxis dataKey="time" tick={{ fontSize: 11, fill: "hsl(215, 15%, 55%)" }} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(215, 15%, 55%)" }} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Area type="monotone" dataKey="requests" stroke="hsl(187, 94%, 43%)" fill="hsl(187, 94%, 43%)" fillOpacity={0.1} strokeWidth={2} />
                <Area type="monotone" dataKey="blocked" stroke="hsl(0, 72%, 51%)" fill="hsl(0, 72%, 51%)" fillOpacity={0.1} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-card border border-border rounded-lg p-5">
            <h3 className="text-sm font-medium mb-4">Top Attack Types</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={Array.isArray(attackTypes) ? attackTypes : []} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 18%, 18%)" />
                <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(215, 15%, 55%)" }} />
                <YAxis dataKey="type" type="category" tick={{ fontSize: 11, fill: "hsl(215, 15%, 55%)" }} width={110} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Bar dataKey="count" fill="hsl(187, 94%, 43%)" radius={[0, 4, 4, 0]} />
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
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                      cat.severity === "critical" ? "bg-destructive/20 text-destructive" :
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-card border border-border rounded-lg p-5">
            <h3 className="text-sm font-medium mb-4">Top IPs</h3>
            <div className="space-y-2">
              {(Array.isArray(topIPs) ? topIPs : []).map((ip) => (
                <div key={ip.ip} className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm">{ip.ip}</span>
                    <span className="text-xs bg-secondary px-2 py-0.5 rounded font-mono">{ip.country}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs font-mono">
                    <span className="text-muted-foreground">{ip.requests.toLocaleString()} req</span>
                    {ip.blocked > 0 && <span className="text-destructive">{ip.blocked} blocked</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-5">
            <h3 className="text-sm font-medium mb-4">Countries</h3>
            <div className="space-y-2">
              {(Array.isArray(countryData) ? countryData : []).map((c) => (
                <div key={c.code} className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="text-sm">{c.country}</span>
                    <span className="text-xs bg-secondary px-2 py-0.5 rounded font-mono">{c.code}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs font-mono">
                    <span className="text-muted-foreground">{c.requests.toLocaleString()} req</span>
                    <span className="text-destructive">{c.blocked.toLocaleString()} blocked</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-5">
            <div className="flex items-center gap-2 mb-4">
              <ShieldAlert className="h-4 w-4 text-destructive" />
              <h3 className="text-sm font-medium">AffiniSecurity Intelligence Bulletins</h3>
            </div>
            <div className="space-y-3">
              {(Array.isArray(bulletins) && bulletins.length > 0) ? bulletins.map((b: any) => (
                <div key={b.id} className="p-3 rounded-md bg-destructive/5 border border-destructive/20 relative overflow-hidden group">
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-destructive/50 group-hover:bg-destructive transition-colors" />
                  <div className="flex justify-between items-start mb-1">
                    <h4 className="text-sm font-bold text-destructive">{b.title}</h4>
                    <span className="text-[10px] font-mono text-muted-foreground">{b.date}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-destructive/10 text-destructive font-mono">SEVERITY: {b.severity}</span>
                  </div>
                </div>
              )) : (
                <div className="flex flex-col items-center justify-center p-6 text-center border border-dashed rounded-lg">
                  <ShieldCheck className="h-8 w-8 text-success/40 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">No active threat bulletins. Your infrastructure is secure.</p>
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

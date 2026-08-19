import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Globe, TrendingUp, ArrowUpRight, ArrowDownRight, Shield, Activity, Zap, RefreshCw } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import { useAuth } from "@/hooks/use-auth";
import { UpgradeOverlay } from "@/components/UpgradeOverlay";
import { Loader2 } from "lucide-react";

interface AnalyticsSummary {
  source: string;
  time_range?: string;
  timeRange?: string;
  total_requests?: number;
  totalRequests?: number;
  threats_blocked?: number;
  threatsBlocked?: number;
  avg_latency_ms?: string;
  avgLatencyMs?: string;
  time_series?: { time: string; requests: number }[];
  timeSeries?: { time: string; requests: number }[];
  threat_breakdown?: { name: string; value: number }[];
  threatBreakdown?: { name: string; value: number }[];
}

interface TopIP { ip: string; requests: number; blocked: number; country: string; tenantId?: string; }
interface CountryData { country: string; code: string; requests: number; blocked: number; tenantId?: string; }
interface AttackType { type: string; count: number; tenantId: string; }

const THREAT_COLORS: Record<string, string> = {
  sqli: "hsl(0, 68%, 55%)",
  xss: "hsl(38, 92%, 50%)",
  ddos: "hsl(210, 78%, 46%)",
  bot: "hsl(152, 60%, 42%)",
  ratelimit: "hsl(270, 70%, 60%)",
  clean: "hsl(220, 10%, 46%)",
};

const chartTooltipStyle = {
  backgroundColor: "hsl(222, 30%, 10%)",
  border: "1px solid hsl(220, 14%, 22%)",
  borderRadius: "8px",
  fontSize: "12px",
  fontFamily: "'JetBrains Mono', monospace",
  color: "hsl(210, 40%, 98%)",
};

// Static fallback data for when ES has no data yet
const FALLBACK_TIME_SERIES = [
  { time: "Mon", requests: 0 }, { time: "Tue", requests: 0 },
  { time: "Wed", requests: 0 }, { time: "Thu", requests: 0 },
  { time: "Fri", requests: 0 }, { time: "Sat", requests: 0 }, { time: "Sun", requests: 0 },
];

export default function AnalyticsPage() {
  const { user, isLoading: authLoading } = useAuth();

  const isPlatformAdmin = user?.role === "super_admin" || user?.role === "admin" || user?.role === "support_engineer";
  const isLocked = !authLoading && user && !isPlatformAdmin && !user.entitlements?.hasAnalytics;
  const [timeRange, setTimeRange] = useState("7d");
  const headers = {};

  const queryClient = useQueryClient();

  const { data: summary, isLoading: summaryLoading, refetch, isFetching } = useQuery<AnalyticsSummary>({
    queryKey: ["analytics-summary", timeRange],
    queryFn: () => fetch(`/api/analytics/summary?range=${timeRange}`, { headers }).then(r => r.json()),
    refetchInterval: 60_000,
    enabled: !authLoading && !!token,
  });

  // ── Live SSE for CRS ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!isPlatformAdmin) return;

    const sse = new EventSource("/api/stream/crs-events");
    sse.onmessage = (e) => {
      try {
        // We successfully received a live block event
        queryClient.setQueryData(["analytics-summary", timeRange], (old: any) => {
          if (!old) return old;
          return {
            ...old,
            threats_blocked: (old.threats_blocked || 0) + 1,
            threatsBlocked: (old.threatsBlocked || 0) + 1,
          };
        });

        // Softly invalidate other detailed views
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ["analytics-ips"] });
          queryClient.invalidateQueries({ queryKey: ["analytics-countries"] });
          queryClient.invalidateQueries({ queryKey: ["analytics-attacks"] });
        }, 1500);
      } catch (err) {
        console.error("Failed to parse live CRS event from SSE:", err);
      }
    };

    return () => sse.close();
  }, [isPlatformAdmin, queryClient, timeRange]);

  const { data: topIPs = [] } = useQuery<TopIP[]>({
    queryKey: ["analytics-ips"],
    queryFn: () => fetch("/api/analytics/ips", { headers }).then(r => r.json()),
    enabled: !authLoading && !!token,
  });

  const { data: countries = [] } = useQuery<CountryData[]>({
    queryKey: ["analytics-countries"],
    queryFn: () => fetch("/api/analytics/countries", { headers }).then(r => r.json()),
    enabled: !authLoading && !!token,
  });

  const { data: attacks = [] } = useQuery<AttackType[]>({
    queryKey: ["analytics-attacks"],
    queryFn: () => fetch("/api/analytics/attacks", { headers }).then(r => r.json()),
    enabled: !authLoading && !!token,
  });

  const safeTopIPs = Array.isArray(topIPs) ? topIPs : [];
  const safeCountries = Array.isArray(countries) ? countries : [];
  const safeAttacks = Array.isArray(attacks) ? attacks : [];

  const timeSeriesData = summary?.time_series || summary?.timeSeries;
  const timeSeries = timeSeriesData?.length ? timeSeriesData : FALLBACK_TIME_SERIES;
  const breakdownData = summary?.threat_breakdown || summary?.threatBreakdown;
  const threatBreakdown = breakdownData?.length
    ? breakdownData
    : safeAttacks.map(a => ({ name: a.type, value: a.count }));

  const totalReqs = summary?.total_requests ?? summary?.totalRequests ?? 0;
  const threatsBlk = summary?.threats_blocked ?? summary?.threatsBlocked ?? 0;

  const overviewStats = [
    {
      label: "Total Requests",
      value: summary ? (totalReqs > 1000
        ? `${(totalReqs / 1000).toFixed(1)}K`
        : String(totalReqs)) : "—",
      change: summary?.source === "elasticsearch" ? "Live" : "DB",
      up: true,
      icon: Activity,
      color: "text-blue-400",
    },
    {
      label: "Threats Blocked",
      value: summary ? String(threatsBlk) : "—",
      change: "DB Backed",
      up: true,
      icon: Shield,
      color: "text-red-400",
    },
    {
      label: "Avg Processing Time",
      value: summary ? `${summary.avg_latency_ms || summary.avgLatencyMs || "0"}ms` : "—",
      change: "Optimal",
      up: false,
      icon: Zap,
      color: "text-yellow-400",
    },
    {
      label: "Top Threat IPs",
      value: Array.isArray(topIPs) && topIPs.length > 0 ? String(topIPs.length) : "0",
      change: "Unique IPs",
      up: true,
      icon: Globe,
      color: "text-purple-400",
    },
  ];

  if (authLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className={`space-y-6 relative transition-all duration-500 ${isLocked ? 'blur-sm pointer-events-none select-none opacity-40' : ''}`}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Real-Time Analytics
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              📊 Powered by ClickHouse + PostgreSQL — real-time WAF telemetry
            </p>
          </div>
          <div className="flex items-center gap-2">
            {["1h", "24h", "7d", "30d"].map(range => (
              <Button
                key={range}
                size="sm"
                variant={timeRange === range ? "default" : "outline"}
                className="text-xs font-mono h-7 px-3"
                onClick={() => setTimeRange(range)}
              >
                {range}
              </Button>
            ))}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              onClick={() => refetch()}
              title="Refresh"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin text-primary" : "text-muted-foreground"}`} />
            </Button>
          </div>
        </div>

        {/* Overview Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {overviewStats.map((stat) => (
            <div key={stat.label} className="stat-card group hover:border-primary/30 transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{stat.label}</span>
                <stat.icon className={`h-4 w-4 ${stat.color} opacity-60 group-hover:opacity-100 transition-opacity`} />
              </div>
              <div className="flex items-end justify-between mt-2">
                <p className="text-2xl font-bold font-mono">
                  {summaryLoading ? <span className="animate-pulse text-muted-foreground/40">···</span> : stat.value}
                </p>
                <span className={`flex items-center text-[10px] font-mono px-1.5 py-0.5 rounded-full ${stat.up ? "bg-emerald-500/10 text-emerald-400" : "bg-blue-500/10 text-blue-400"}`}>
                  {stat.up ? <ArrowUpRight className="h-2.5 w-2.5 mr-0.5" /> : <ArrowDownRight className="h-2.5 w-2.5 mr-0.5" />}
                  {stat.change}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Request Volume Over Time */}
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium">Request Volume Over Time</h3>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={timeSeries}>
              <defs>
                <linearGradient id="reqGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(210, 78%, 46%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(210, 78%, 46%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 18%)" />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: "hsl(220, 10%, 46%)" }} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(220, 10%, 46%)" }} tickFormatter={v => v > 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)} />
              <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => [v.toLocaleString(), "Requests"]} />
              <Area type="monotone" dataKey="requests" stroke="hsl(210, 78%, 46%)" fill="url(#reqGradient)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Threat Breakdown */}
        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-sm font-medium mb-4">Threat Categories</h3>
          {Array.isArray(threatBreakdown) && threatBreakdown.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={threatBreakdown}
                  cx="50%" cy="50%"
                  innerRadius={50} outerRadius={85}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                  labelLine={{ stroke: "hsl(220, 14%, 30%)" }}
                >
                  {threatBreakdown.map((entry: any, i: number) => (
                    <Cell key={i} fill={THREAT_COLORS[entry.name] || `hsl(${i * 60}, 60%, 50%)`} />
                  ))}
                </Pie>
                <Tooltip contentStyle={chartTooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[240px] flex items-center justify-center text-muted-foreground text-sm">
              No threat data yet — send traffic to see classification.
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Top Threat Source IPs */}
          <div className="bg-card border border-border rounded-lg p-5">
            <h3 className="text-sm font-medium mb-4">Top Threat Source IPs</h3>
            <div className="space-y-1.5">
              {Array.isArray(topIPs) && topIPs.length > 0 ? topIPs.slice(0, 8).map((ip, i) => (
                <div key={ip.ip} className="flex items-center justify-between py-1.5 px-3 rounded-md bg-muted/20 hover:bg-muted/40 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-mono text-muted-foreground/60 w-4">{i + 1}</span>
                    <span className="text-sm font-mono">{ip.ip}</span>
                  </div>
                  <Badge variant="outline" className="text-[9px] font-mono">
                    {ip.blocked ?? 0} / {ip.requests ?? 0} blocked
                  </Badge>
                </div>
              )) : (
                <div className="py-8 text-center text-muted-foreground text-sm">No IP data available yet.</div>
              )}
            </div>
          </div>

          {/* Top Countries */}
          <div className="bg-card border border-border rounded-lg p-5">
            <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              Traffic by Country
            </h3>
            {Array.isArray(countries) && countries.length > 0 ? (
              <div className="space-y-1">
                {countries.map((c) => (
                  <div key={c.code} className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/20 hover:bg-muted/40 transition-colors">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="font-mono text-[10px] w-8 justify-center">{c.code}</Badge>
                      <span className="text-sm">{c.country}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs font-mono">
                      <span className="text-muted-foreground">{c.requests?.toLocaleString() ?? 0} req</span>
                      <span className="text-destructive">{c.blocked?.toLocaleString() ?? 0} blocked</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground text-sm">No geographic data yet. Traffic will appear as it flows through the WAF.</div>
            )}
          </div>
        </div>
      </div>
      {isLocked && (
        <UpgradeOverlay
          title="Real-Time Analytics"
          description="Unlock deep insights into your traffic with real-time WAF telemetry, ClickHouse-backed analytics, and comprehensive threat distribution maps. This feature requires the Professional plan."
          feature="Analytics"
        />
      )}
    </DashboardLayout>
  );
}

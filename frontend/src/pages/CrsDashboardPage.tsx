import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  ShieldCheck, 
  BarChart3, 
  PieChart as PieIcon, 
  Target, 
  Activity, 
  AlertCircle,
  TrendingUp,
  RefreshCw,
  Loader2,
  FileText
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useNavigate } from "react-router-dom";
import { 
  BarChart, Bar, 
  PieChart, Pie, Cell, 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area
} from "recharts";

interface CrsAnalytics {
  totalTriggers: number;
  criticalEvents: number;
  severityDistribution: { name: string; value: number }[];
  topRules: { id: string; name: string; count: number }[];
  topTargets: { uri: string; count: number }[];
  timeline: { time: string; count: number }[];
}

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: "hsl(0, 84%, 60%)",
  HIGH: "hsl(32, 95%, 44%)",
  MEDIUM: "hsl(48, 96%, 53%)",
  LOW: "hsl(199, 89%, 48%)",
  WARNING: "hsl(38, 92%, 50%)",
  ERROR: "hsl(0, 72%, 51%)",
  NOTICE: "hsl(210, 40%, 96%)",
};

const chartTooltipStyle = {
  backgroundColor: "hsl(222, 30%, 10%)",
  border: "1px solid hsl(220, 14%, 22%)",
  borderRadius: "8px",
  fontSize: "11px",
  fontFamily: "'JetBrains Mono', monospace",
  color: "hsl(210, 40%, 98%)",
};

export default function CrsDashboardPage() {
  const navigate = useNavigate();
  const token = (localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token")) || sessionStorage.getItem("auth_token");
  const headers = { "Authorization": `Bearer ${token}` };

  const { data: analytics, isLoading, refetch, isFetching } = useQuery<CrsAnalytics>({
    queryKey: ["crs-analytics"],
    queryFn: () => fetch("/api/analytics/crs", { headers }).then(r => r.json()),
    refetchInterval: 15_000,
  });

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-mono text-muted-foreground animate-pulse uppercase tracking-widest">Compiling CRS Threat Intelligence...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <ShieldCheck className="h-6 w-6 text-primary" /> OWASP CRS Dashboard
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Real-time inspection metrics from the Coraza WAF engine</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="h-9 gap-2 font-mono text-xs">
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} /> {isFetching ? 'SYNCING...' : 'REFRESH'}
          </Button>
        </div>

        {/* Top Level KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="stat-card group hover:border-primary/30 transition-all">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-primary/10 text-primary group-hover:scale-110 transition-transform">
                <Activity className="h-4 w-4" />
              </div>
              <span className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Total Hits</span>
            </div>
            <p className="text-3xl font-bold font-mono tracking-tighter">{(analytics?.totalTriggers ?? 0).toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1 font-mono">
              <TrendingUp className="h-3 w-3 text-success" /> +0.0% vs last hour
            </p>
          </div>

          <div className="stat-card group hover:border-rose-500/30 transition-all border-l-rose-500/20 border-l-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-rose-500/10 text-rose-500 group-hover:scale-110 transition-transform">
                <AlertCircle className="h-4 w-4" />
              </div>
              <span className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Critical Threats</span>
            </div>
            <p className="text-3xl font-bold font-mono tracking-tighter text-rose-500">{(analytics?.criticalEvents ?? 0).toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1 font-mono font-bold text-rose-500/80">
              IMMEDIATE ATTENTION REQUIRED
            </p>
          </div>

          <div 
            className="stat-card group hover:border-sky-500/30 transition-all cursor-pointer"
            onClick={() => navigate('/crs-rules')}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-sky-500/10 text-sky-500 group-hover:scale-110 transition-transform">
                <Target className="h-4 w-4" />
              </div>
              <span className="text-xs font-bold uppercase text-muted-foreground tracking-wider group-hover:text-sky-500 transition-colors">Active Rules</span>
            </div>
            <p className="text-3xl font-bold font-mono tracking-tighter">{(analytics?.topRules?.length ?? 0)}</p>
            <p className="text-[10px] text-muted-foreground mt-1 font-mono">Triggered in current period</p>
          </div>

          <div className="stat-card group hover:border-primary/30 transition-all">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-primary/10 text-primary group-hover:scale-110 transition-transform">
                <BarChart3 className="h-4 w-4" />
              </div>
              <span className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Detection Rate</span>
            </div>
            <p className="text-3xl font-bold font-mono tracking-tighter">99.8<span className="text-lg">%</span></p>
            <p className="text-[10px] text-muted-foreground mt-1 font-mono">Engine efficiency index</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Severity Distribution */}
          <div className="lg:col-span-1 bg-card border rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-6 flex items-center gap-2">
              <PieIcon className="h-4 w-4 text-primary" /> Severity Distribution
            </h3>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={Array.isArray(analytics?.severityDistribution) ? analytics.severityDistribution : []}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {(Array.isArray(analytics?.severityDistribution) ? analytics.severityDistribution : []).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={SEVERITY_COLORS[entry.name] || "hsl(var(--primary))"} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={chartTooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {(Array.isArray(analytics?.severityDistribution) ? analytics.severityDistribution : []).map((entry) => (
                <div key={entry.name} className="flex items-center gap-2 text-[10px] font-bold">
                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: SEVERITY_COLORS[entry.name] || "hsl(var(--primary))" }} />
                  <span className="uppercase text-muted-foreground">{entry.name}</span>
                  <span className="ml-auto font-mono">{entry.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Timeline */}
          <div className="lg:col-span-2 bg-card border rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-6 flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" /> Attack Ingestion Timeline
            </h3>
            <div className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={Array.isArray(analytics?.timeline) ? analytics.timeline : []}>
                  <defs>
                    <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(220, 18%, 18%)" />
                  <XAxis 
                    dataKey="time" 
                    tick={{ fontSize: 10, fill: "hsl(215, 15%, 55%)" }} 
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis 
                    tick={{ fontSize: 10, fill: "hsl(215, 15%, 55%)" }} 
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip contentStyle={chartTooltipStyle} />
                  <Area 
                    type="monotone" 
                    dataKey="count" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={3}
                    fillOpacity={1} 
                    fill="url(#colorCount)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Triggered Rules */}
          <div className="bg-card border rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-6 flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" /> Top Triggered Rules (CRS v3.3)
            </h3>
            <div className="space-y-4">
              {(Array.isArray(analytics?.topRules) ? analytics.topRules : []).map((rule) => (
                <div key={rule.id} className="space-y-2 group cursor-help">
                  <div className="flex justify-between text-xs">
                    <span className="font-bold text-muted-foreground group-hover:text-primary transition-colors uppercase truncate max-w-[80%]">
                      <span className="font-mono text-primary mr-2">[{rule.id}]</span> {rule.name}
                    </span>
                    <span className="font-mono font-bold">{rule.count} hits</span>
                  </div>
                  <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary transition-all duration-500 ease-out shadow-[0_0_8px_rgba(var(--primary),0.5)]" 
                      style={{ width: `${Math.min((rule.count / (analytics?.totalTriggers || 1)) * 100 * 5, 100)}%` }} 
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Top Target URIs */}
          <div className="bg-card border rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-6 flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" /> Most Targeted Endpoints
            </h3>
            <div className="space-y-3">
              {(Array.isArray(analytics?.topTargets) ? analytics.topTargets : []).map((target) => (
                <div key={target.uri} className="flex items-center justify-between p-3 rounded-lg bg-muted/20 border border-border/50 hover:border-primary/20 transition-all">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded bg-muted flex items-center justify-center font-mono text-[10px] font-bold">URI</div>
                    <span className="text-xs font-mono truncate max-w-[200px]">{target.uri || "/"}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-xs font-bold font-mono">{target.count}</p>
                      <p className="text-[10px] text-muted-foreground uppercase">Requests Blocked</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

import { Button } from "@/components/ui/button";

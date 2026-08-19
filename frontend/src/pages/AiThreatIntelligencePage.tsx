import React, { useMemo, useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/hooks/use-auth";
import {
    Zap, Shield, AlertTriangle, Globe, Activity,
    ArrowLeft, TrendingUp, Filter, RefreshCw, Loader2,
    BarChart2, Clock, Cpu, Heart, ServerCrash, CheckCircle2, WifiOff, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    ResponsiveContainer,
    AreaChart, Area,
    XAxis, YAxis, Tooltip, CartesianGrid,
    BarChart, Bar, Cell,
    Legend,
} from "recharts";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const VECTOR_COLORS = [
    "#6366f1", "#f59e0b", "#ef4444", "#10b981",
    "#8b5cf6", "#f97316", "#14b8a6", "#ec4899",
    "#3b82f6", "#84cc16",
];

function scoreColor(s: number) {
    return s >= 0.9 ? "text-red-400" : s >= 0.75 ? "text-yellow-400" : "text-muted-foreground";
}

function scoreBg(s: number) {
    return s >= 0.9
        ? "bg-red-500/10 border-red-500/30 text-red-400"
        : s >= 0.75
            ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-400"
            : "bg-muted border-border/50 text-muted-foreground";
}

// Trim hour label to "HH:00" for axis readability
function fmtHour(h: string) {
    return h ? h.slice(11) + ":00" : "";
}

// ─── Custom Tooltip for Area Chart ────────────────────────────────────────────
const AreaTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-card border border-border/60 rounded-lg px-3 py-2 shadow-lg text-[11px]">
            <div className="font-semibold text-foreground mb-1">{label}:00 UTC</div>
            {payload.map((p: any, i: number) => (
                <div key={i} style={{ color: p.color }}>
                    {p.name}: <span className="font-bold">{p.value !== undefined ? (typeof p.value === "number" && p.name === "Avg Score" ? `${(p.value * 100).toFixed(0)}%` : p.value) : "—"}</span>
                </div>
            ))}
        </div>
    );
};

const VectorTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
        <div className="bg-card border border-border/60 rounded-lg px-3 py-2 shadow-lg text-[11px] max-w-[220px]">
            <div className="font-semibold text-foreground mb-1 break-all">{d.pattern}</div>
            <div className="text-muted-foreground">Blocks: <span className="text-foreground font-bold">{d.count}</span></div>
            <div className="text-muted-foreground">Max Score: <span className="font-bold" style={{ color: d.maxScore >= 0.9 ? "#f87171" : d.maxScore >= 0.75 ? "#fbbf24" : "#6366f1" }}>{(d.maxScore * 100).toFixed(0)}%</span></div>
        </div>
    );
};

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AiThreatIntelligencePage() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const isPlatformAdmin = user?.role === "super_admin" || user?.role === "admin" || user?.role === "support_engineer";

    if (!isPlatformAdmin) {
        navigate("/alerts");
        return null;
    }

    const authHeaders = useMemo(() => {
        const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token") || "";
        return { Authorization: `Bearer ${token}` };
    }, []);

    const queryClient = useQueryClient();

    // ── Queries ────────────────────────────────────────────────────────────────
    const { data: rawEvents = [], isLoading: eventsLoading, refetch, dataUpdatedAt } = useQuery({
        queryKey: ["admin-ai-threat-intel"],
        queryFn: () => fetch("/api/firewall/ai-events", { headers: authHeaders }).then(r => r.json()),
        refetchInterval: 60_000, // Reduced polling frequency in favor of SSE
    });

    const { data: analytics, isLoading: analyticsLoading } = useQuery({
        queryKey: ["admin-ai-analytics"],
        queryFn: () => fetch("/api/firewall/ai-analytics", { headers: authHeaders }).then(r => r.json()),
        refetchInterval: 60_000,
    });

    // ── Live SSE – AI threat events ────────────────────────────────────────────
    useEffect(() => {
        if (!isPlatformAdmin) return;

        const sse = new EventSource("/api/stream/ai-events");
        sse.onmessage = (e) => {
            try {
                const payload = JSON.parse(e.data);
                const newEvent = { ...payload, blockedAt: new Date().toISOString() };
                queryClient.setQueryData(["admin-ai-threat-intel"], (old: any) => {
                    const existing = Array.isArray(old) ? old : [];
                    return [newEvent, ...existing].slice(0, 500);
                });
                setTimeout(() => {
                    queryClient.invalidateQueries({ queryKey: ["admin-ai-analytics"] });
                }, 1500);
            } catch (err) {
                console.error("Failed to parse live AI event from SSE:", err);
            }
        };
        return () => sse.close();
    }, [isPlatformAdmin, queryClient]);

    // ── AI Engine Health polling ───────────────────────────────────────────────
    const { data: aiHealth, isLoading: healthLoading } = useQuery({
        queryKey: ["ai-engine-health"],
        queryFn: () => fetch("/api/firewall/ai-health", { headers: authHeaders }).then(r => r.json()),
        refetchInterval: 10_000,
    });

    // Keep previous health for delta detection
    const prevHealthStatus = useRef<string | null>(null);
    useEffect(() => {
        if (!aiHealth?.status) return;
        if (prevHealthStatus.current !== null && prevHealthStatus.current !== aiHealth.status) {
            queryClient.invalidateQueries({ queryKey: ["ai-engine-health"] });
        }
        prevHealthStatus.current = aiHealth.status;
    }, [aiHealth?.status, queryClient]);


    // ── Per-Tenant AI Policy Overview ─────────────────────────────────────────
    const { data: policyOverview = [], isLoading: policyLoading } = useQuery({
        queryKey: ["ai-policy-overview"],
        queryFn: () => fetch("/api/firewall/ai-policy-overview", { headers: authHeaders }).then(r => r.json()),
        refetchInterval: 30_000,
    });

    // ── Global Threat Correlation ──────────────────────────────────────────────
    const { data: globalThreat, isLoading: globalLoading } = useQuery({
        queryKey: ["global-threat-correlation"],
        queryFn: () => fetch("/api/firewall/global-threats", { headers: authHeaders }).then(r => r.json()),
        refetchInterval: 60_000,
    });

    const isLoading = eventsLoading || analyticsLoading;
    const allEvents: any[] = Array.isArray(rawEvents) ? rawEvents : [];

    // ── Derived stats from events ──────────────────────────────────────────────
    const uniqueTenants = useMemo(
        () => Array.from(new Set(allEvents.map((ev: any) => ev.tenantId || ev.TenantId || "unknown"))),
        [allEvents]
    );

    const tenantStats = useMemo(() =>
        uniqueTenants.map(t => {
            const evs = allEvents.filter((ev: any) => (ev.tenantId || ev.TenantId) === t);
            const maxScore = evs.length ? Math.max(...evs.map((ev: any) => ev.anomalyScore ?? ev.AnomalyScore ?? 0)) : 0;
            const avgScore = evs.length ? evs.reduce((s: number, ev: any) => s + (ev.anomalyScore ?? ev.AnomalyScore ?? 0), 0) / evs.length : 0;
            const patterns = Array.from(new Set(evs.flatMap((ev: any) => ev.matches || ev.Matches || [])));
            return { tenant: t, count: evs.length, maxScore, avgScore, patterns };
        }).sort((a, b) => b.count - a.count),
        [allEvents, uniqueTenants]
    );

    // Recharts-friendly data from analytics
    const hourlySeries = useMemo(() => {
        if (!analytics?.hourlySeries) return [];
        return analytics.hourlySeries.map((h: any) => ({
            hour: fmtHour(h.hour),
            blocks: h.count,
            avgScore: h.avgScore,
        }));
    }, [analytics]);

    const attackVectors = useMemo(() => {
        if (!analytics?.attackVectors) return [];
        return analytics.attackVectors.map((v: any) => ({
            pattern: v.pattern?.length > 32 ? v.pattern.slice(0, 32) + "…" : (v.pattern || "?"),
            fullPattern: v.pattern || "",
            count: v.count,
            maxScore: v.maxScore,
        }));
    }, [analytics]);

    // ── Filters ────────────────────────────────────────────────────────────────
    const [tenantFilter, setTenantFilter] = useState("all");
    const [scoreFilter, setScoreFilter] = useState<"all" | "critical" | "high">("all");
    const [activeTab, setActiveTab] = useState<"intelligence" | "policy" | "global">("intelligence");

    // ── Global Threat chart data ───────────────────────────────────────────────
    const dailyTrendData = useMemo(() => {
        if (!globalThreat?.dailyTrend) return [];
        return (globalThreat.dailyTrend as any[]).map((d: any) => ({
            day: d.day ? d.day.slice(5) : "",  // "MM-DD"
            blocks: d.count,
            avgScore: d.avgScore,
        }));
    }, [globalThreat]);


    // ── Per-Tenant Policy Table Pagination ────────────────────────────────────
    const [policyPage, setPolicyPage] = useState(1);
    const [policyPageSize] = useState(10);

    useEffect(() => {
        setPolicyPage(1);
    }, [policyOverview.length]);

    const totalPolicyPages = Math.ceil((Array.isArray(policyOverview) ? policyOverview.length : 0) / policyPageSize);

    const paginatedPolicies = useMemo(() => {
        const pols = Array.isArray(policyOverview) ? policyOverview : [];
        const start = (policyPage - 1) * policyPageSize;
        return pols.slice(start, start + policyPageSize);
    }, [policyOverview, policyPage, policyPageSize]);

    const filteredEvents = useMemo(() => {
        let evs = allEvents;
        if (tenantFilter !== "all") evs = evs.filter((ev: any) => (ev.tenantId || ev.TenantId) === tenantFilter);
        if (scoreFilter === "critical") evs = evs.filter((ev: any) => (ev.anomalyScore ?? ev.AnomalyScore ?? 0) >= 0.9);
        if (scoreFilter === "high") evs = evs.filter((ev: any) => (ev.anomalyScore ?? ev.AnomalyScore ?? 0) >= 0.75);
        return evs;
    }, [allEvents, tenantFilter, scoreFilter]);

    const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : "—";

    // ── Render ─────────────────────────────────────────────────────────────────
    return (
        <DashboardLayout>
            <div className="space-y-8 p-6 max-w-screen-2xl mx-auto">

                {/* ── Page Header ────────────────────────────────────────────── */}
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => navigate("/admin")}
                            className="p-2 rounded-lg hover:bg-muted/60 transition-colors text-muted-foreground hover:text-foreground"
                        >
                            <ArrowLeft className="h-4 w-4" />
                        </button>
                        <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
                            <Zap className="h-5 w-5 text-indigo-400" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold tracking-tight">AI Threat Intelligence</h1>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Cross-tenant platform-wide AI engine telemetry — updated {lastUpdated}
                            </p>
                        </div>
                    </div>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => refetch()}
                        className="gap-2 text-xs"
                        disabled={isLoading}
                    >
                        <RefreshCw className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`} />
                        Refresh
                    </Button>
                </div>

                {/* ── Tab Bar ──────────────────────────────────────────────── */}
                <div className="flex gap-1 p-1 bg-muted/40 border border-border/40 rounded-xl w-fit">
                    {[
                        { key: "intelligence" as const, label: "Threat Intelligence", icon: Zap },
                        { key: "policy" as const, label: "Tenant Policies", icon: Shield },
                        { key: "global" as const, label: "Global Threats", icon: Globe },
                    ].map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${activeTab === tab.key
                                ? "bg-background text-foreground shadow-sm border border-border/60"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                                }`}
                        >
                            <tab.icon className="h-3.5 w-3.5" />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {activeTab === "intelligence" && (
                    <React.Fragment>

                        {/* ── Global Stats Row ────────────────────────────────────────── */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            {[
                                {
                                    label: "Blocks (24h)",
                                    value: analytics?.totalBlocks24h ?? (isLoading ? null : allEvents.length),
                                    icon: Shield,
                                    color: "text-red-400",
                                    bg: "bg-red-500/10 border-red-500/20",
                                    sub: `${allEvents.length} total all-time`
                                },
                                {
                                    label: "Tenants Affected",
                                    value: uniqueTenants.length,
                                    icon: Globe,
                                    color: "text-blue-400",
                                    bg: "bg-blue-500/10 border-blue-500/20",
                                    sub: "unique tenant IDs"
                                },
                                {
                                    label: "Avg Anomaly (24h)",
                                    value: analytics?.avgScore24h != null ? `${(analytics.avgScore24h * 100).toFixed(0)}%` : "—",
                                    icon: Activity,
                                    color: "text-violet-400",
                                    bg: "bg-violet-500/10 border-violet-500/20",
                                    sub: "mean anomaly score"
                                },
                                {
                                    label: "Peak Hour Blocks",
                                    value: analytics?.peakHourCount ?? "—",
                                    icon: Clock,
                                    color: "text-yellow-400",
                                    bg: "bg-yellow-500/10 border-yellow-500/20",
                                    sub: analytics?.peakHour ? `at ${fmtHour(analytics.peakHour)} UTC` : "last 24h"
                                },
                            ].map(({ label, value, icon: Icon, color, bg, sub }) => (
                                <div key={label} className={`rounded-xl border p-4 ${bg}`}>
                                    <div className="flex items-center gap-2 mb-2">
                                        <Icon className={`h-4 w-4 ${color}`} />
                                        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">{label}</span>
                                    </div>
                                    <div className="text-3xl font-bold">
                                        {isLoading ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : value}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground mt-1">{sub}</div>
                                </div>
                            ))}
                        </div>

                        {/* ── AI Engine Health Monitor ──────────────────────────────────────────── */}
                        {(() => {
                            const status: string = aiHealth?.status ?? "unknown";
                            const statusConfig = {
                                online: { label: "Online", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30", pulse: "bg-emerald-400", Icon: CheckCircle2 },
                                degraded: { label: "Degraded", color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/30", pulse: "bg-yellow-400", Icon: AlertCircle },
                                error: { label: "Error", color: "text-red-400", bg: "bg-red-500/10 border-red-500/30", pulse: "bg-red-400", Icon: ServerCrash },
                                offline: { label: "Offline", color: "text-red-500", bg: "bg-red-500/10 border-red-500/40", pulse: "bg-red-500", Icon: WifiOff },
                                unknown: { label: "Connecting…", color: "text-muted-foreground", bg: "bg-muted border-border/40", pulse: "bg-muted-foreground", Icon: Loader2 },
                            } as const;
                            const cfg = statusConfig[status as keyof typeof statusConfig] ?? statusConfig.unknown;
                            const StatusIcon = cfg.Icon;

                            const uptimeSecs: number = aiHealth?.uptime_seconds ?? 0;
                            const memMb = aiHealth?.memory_alloc_bytes
                                ? (aiHealth.memory_alloc_bytes / 1024 / 1024).toFixed(1)
                                : "—";
                            const reqTotal: number = aiHealth?.requests_total ?? 0;
                            const errTotal: number = aiHealth?.errors_total ?? 0;
                            const avgLatMs: number = aiHealth?.average_latency_ms ?? 0;

                            const fmtUptime = (s: number) => {
                                if (s < 60) return `${s}s`;
                                if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
                                return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
                            };

                            const latPct = Math.min((avgLatMs / 100) * 100, 100);
                            const latColor = avgLatMs >= 50 ? "bg-red-500" : avgLatMs >= 25 ? "bg-yellow-500" : "bg-emerald-500";

                            const offline = status === "offline";

                            const metrics = [
                                { label: "Uptime", value: offline ? "—" : fmtUptime(uptimeSecs), extra: null },
                                { label: "Memory", value: offline ? "—" : `${memMb} MB`, extra: null },
                                { label: "Requests", value: reqTotal.toLocaleString(), extra: null },
                                { label: "Errors", value: errTotal.toLocaleString(), extra: errTotal > 0 ? "text-red-400" : null },
                                { label: "Avg Latency", value: offline ? "—" : `${avgLatMs.toFixed(1)}ms`, extra: avgLatMs >= 50 ? "text-red-400" : avgLatMs >= 25 ? "text-yellow-400" : null },
                            ];

                            return (
                                <div className="bg-card border border-border/60 rounded-xl p-5 shadow-sm">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-2">
                                            <Heart className="h-4 w-4 text-rose-400" />
                                            <h2 className="text-sm font-bold text-foreground">AI Engine Health Monitor</h2>
                                            <span className="text-[10px] text-muted-foreground">live · updates every 10s</span>
                                        </div>
                                        <div className={`flex items-center gap-2 rounded-full px-3 py-1 border text-[11px] font-semibold ${cfg.bg} ${cfg.color}`}>
                                            <span className={`relative flex h-2 w-2`}>
                                                {status === "online" && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />}
                                                <span className={`relative inline-flex rounded-full h-2 w-2 ${cfg.pulse}`} />
                                            </span>
                                            <StatusIcon className={`h-3 w-3 ${status === "unknown" ? "animate-spin" : ""}`} />
                                            {cfg.label}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                                        {metrics.map(({ label, value, extra }) => (
                                            <div key={label} className="bg-muted/40 rounded-lg p-3 border border-border/40">
                                                <div className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1">{label}</div>
                                                <div className={`text-xl font-bold font-mono ${extra ?? ""}`}>{value}</div>
                                            </div>
                                        ))}
                                        {/* Latency bar */}
                                        <div className="bg-muted/40 rounded-lg p-3 border border-border/40 flex flex-col justify-between">
                                            <div className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1">Latency Load</div>
                                            <div className="h-2 bg-muted rounded-full overflow-hidden mt-2">
                                                <div
                                                    className={`h-full rounded-full transition-all duration-700 ${latColor}`}
                                                    style={{ width: `${latPct}%` }}
                                                />
                                            </div>
                                            <div className="text-[9px] text-muted-foreground mt-1">{latPct.toFixed(0)}% of 100ms</div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* ── Analytics Charts Row ────────────────────────────────────── */}
                        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

                            {/* 24h Hourly Trend Chart */}
                            <div className="xl:col-span-2 bg-card border border-border/60 rounded-xl p-5 shadow-sm">
                                <div className="flex items-center justify-between mb-4">
                                    <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                                        <BarChart2 className="h-4 w-4 text-indigo-400" />
                                        Blocks Over Last 24 Hours
                                    </h2>
                                    <span className="text-[10px] text-muted-foreground">Hourly granularity · UTC</span>
                                </div>

                                {analyticsLoading ? (
                                    <div className="flex items-center justify-center h-52">
                                        <Loader2 className="h-6 w-6 animate-spin text-indigo-400/50" />
                                    </div>
                                ) : hourlySeries.length === 0 ? (
                                    <div className="flex items-center justify-center h-52 text-xs text-muted-foreground">
                                        No AI blocks recorded in the past 24 hours.
                                    </div>
                                ) : (
                                    <ResponsiveContainer width="100%" height={220}>
                                        <AreaChart data={hourlySeries} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
                                            <defs>
                                                <linearGradient id="blockGrad" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                                                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                                </linearGradient>
                                                <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
                                                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                            <XAxis
                                                dataKey="hour"
                                                tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                                                tickLine={false}
                                                axisLine={false}
                                                interval={3}
                                            />
                                            <YAxis
                                                yAxisId="left"
                                                tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                                                tickLine={false}
                                                axisLine={false}
                                                allowDecimals={false}
                                            />
                                            <YAxis
                                                yAxisId="right"
                                                orientation="right"
                                                tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                                                tickLine={false}
                                                axisLine={false}
                                                domain={[0, 1]}
                                                tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                                            />
                                            <Tooltip content={<AreaTooltip />} />
                                            <Legend
                                                wrapperStyle={{ fontSize: "10px", paddingTop: "8px" }}
                                                iconType="circle"
                                                iconSize={8}
                                            />
                                            <Area
                                                yAxisId="left"
                                                type="monotone"
                                                dataKey="blocks"
                                                name="Blocks"
                                                stroke="#6366f1"
                                                strokeWidth={2}
                                                fill="url(#blockGrad)"
                                                dot={false}
                                                activeDot={{ r: 4, fill: "#6366f1" }}
                                            />
                                            <Area
                                                yAxisId="right"
                                                type="monotone"
                                                dataKey="avgScore"
                                                name="Avg Score"
                                                stroke="#f59e0b"
                                                strokeWidth={1.5}
                                                fill="url(#scoreGrad)"
                                                strokeDasharray="4 2"
                                                dot={false}
                                                activeDot={{ r: 3, fill: "#f59e0b" }}
                                            />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                )}
                            </div>

                            {/* Top Attack Vectors Chart */}
                            <div className="bg-card border border-border/60 rounded-xl p-5 shadow-sm">
                                <div className="flex items-center justify-between mb-4">
                                    <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                                        <AlertTriangle className="h-4 w-4 text-yellow-400" />
                                        Attack Vectors
                                    </h2>
                                    <span className="text-[10px] text-muted-foreground">All-time · Top 10</span>
                                </div>

                                {analyticsLoading ? (
                                    <div className="flex items-center justify-center h-52">
                                        <Loader2 className="h-6 w-6 animate-spin text-yellow-400/50" />
                                    </div>
                                ) : attackVectors.length === 0 ? (
                                    <div className="flex items-center justify-center h-52 text-xs text-muted-foreground">
                                        No attack pattern data yet.
                                    </div>
                                ) : (
                                    <ResponsiveContainer width="100%" height={220}>
                                        <BarChart
                                            data={attackVectors}
                                            layout="vertical"
                                            margin={{ top: 0, right: 4, bottom: 0, left: 4 }}
                                            barSize={12}
                                        >
                                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                                            <XAxis
                                                type="number"
                                                tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                                                tickLine={false}
                                                axisLine={false}
                                                allowDecimals={false}
                                            />
                                            <YAxis
                                                type="category"
                                                dataKey="pattern"
                                                tick={{ fontSize: 8, fill: "hsl(var(--muted-foreground))" }}
                                                tickLine={false}
                                                axisLine={false}
                                                width={80}
                                            />
                                            <Tooltip content={<VectorTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                                            <Bar dataKey="count" name="Blocks" radius={[0, 4, 4, 0]}>
                                                {attackVectors.map((_: any, index: number) => (
                                                    <Cell key={index} fill={VECTOR_COLORS[index % VECTOR_COLORS.length]} fillOpacity={0.85} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                )}
                            </div>
                        </div>

                        {/* ── Tenant / Event Feed Row ─────────────────────────────────── */}
                        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

                            {/* Left: Tenant Attack Cards */}
                            <div className="xl:col-span-1 space-y-3">
                                <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                                    <TrendingUp className="h-4 w-4 text-indigo-400" /> Tenants by Attack Volume
                                </h2>
                                {eventsLoading ? (
                                    <div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                                ) : tenantStats.length === 0 ? (
                                    <div className="rounded-xl border border-border/60 bg-card p-8 text-center text-xs text-muted-foreground">
                                        No AI block events recorded yet.
                                    </div>
                                ) : (
                                    tenantStats.map(({ tenant, count, maxScore, avgScore, patterns }) => {
                                        const isSelected = tenantFilter === tenant;
                                        return (
                                            <button
                                                key={tenant}
                                                onClick={() => setTenantFilter(isSelected ? "all" : tenant)}
                                                className={`w-full text-left p-4 rounded-xl border transition-all ${isSelected
                                                    ? "border-indigo-500/60 bg-indigo-500/10 shadow-sm shadow-indigo-500/20"
                                                    : "border-border/60 bg-card hover:border-indigo-500/30 hover:bg-indigo-500/5"
                                                    }`}
                                            >
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-[11px] font-mono font-semibold text-foreground truncate max-w-[140px]" title={tenant}>{tenant}</span>
                                                    <span className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded border ${scoreBg(maxScore)}`}>
                                                        peak {(maxScore * 100).toFixed(0)}%
                                                    </span>
                                                </div>
                                                <div className="flex items-end gap-3">
                                                    <div>
                                                        <div className={`text-2xl font-bold ${count > 5 ? "text-red-400" : count > 2 ? "text-yellow-400" : "text-foreground"}`}>{count}</div>
                                                        <div className="text-[9px] text-muted-foreground uppercase tracking-wide mt-0.5">blocks</div>
                                                    </div>
                                                    <div className="flex-1">
                                                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                                            <div
                                                                className={`h-full rounded-full transition-all ${maxScore >= 0.9 ? "bg-red-500" : maxScore >= 0.75 ? "bg-yellow-500" : "bg-indigo-500"}`}
                                                                style={{ width: `${Math.min((avgScore * 100), 100)}%` }}
                                                            />
                                                        </div>
                                                        <div className="text-[9px] text-muted-foreground mt-1">avg score {(avgScore * 100).toFixed(0)}%</div>
                                                    </div>
                                                </div>
                                                {patterns.length > 0 && (
                                                    <div className="mt-2 flex flex-wrap gap-1">
                                                        {(patterns as string[]).slice(0, 2).map((p, i) => (
                                                            <span key={i} className="text-[8px] font-mono px-1 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/15 truncate max-w-[120px]">{p}</span>
                                                        ))}
                                                    </div>
                                                )}
                                            </button>
                                        );
                                    })
                                )}
                            </div>

                            {/* Right: Event Feed */}
                            <div className="xl:col-span-2 space-y-3">
                                <div className="flex items-center justify-between gap-3">
                                    <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                                        <Shield className="h-4 w-4 text-red-400" /> Event Feed
                                        {filteredEvents.length !== allEvents.length && (
                                            <span className="text-[10px] text-muted-foreground font-normal">({filteredEvents.length} of {allEvents.length})</span>
                                        )}
                                    </h2>
                                    <div className="flex items-center gap-2">
                                        <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                                        <select
                                            value={scoreFilter}
                                            onChange={e => setScoreFilter(e.target.value as any)}
                                            className="text-xs bg-muted border border-border/60 rounded-lg px-2.5 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                                        >
                                            <option value="all">All Scores</option>
                                            <option value="high">High (≥75%)</option>
                                            <option value="critical">Critical (≥90%)</option>
                                        </select>
                                        {(tenantFilter !== "all" || scoreFilter !== "all") && (
                                            <button
                                                onClick={() => { setTenantFilter("all"); setScoreFilter("all"); }}
                                                className="text-[10px] text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
                                            >
                                                Clear filters
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="bg-card border border-border/60 rounded-xl overflow-hidden shadow-sm">
                                    <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
                                        <table className="w-full text-left text-sm whitespace-nowrap">
                                            <thead className="bg-muted/50 border-b border-border/60 uppercase tracking-wider text-[10px] text-muted-foreground font-semibold sticky top-0">
                                                <tr>
                                                    <th className="px-4 py-3">Time</th>
                                                    <th className="px-4 py-3">Tenant</th>
                                                    <th className="px-4 py-3 min-w-[180px]">URL</th>
                                                    <th className="px-4 py-3">Mth</th>
                                                    <th className="px-4 py-3">Scores</th>
                                                    <th className="px-4 py-3">Match Reasons</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border/30">
                                                {eventsLoading ? (
                                                    <tr><td colSpan={6} className="py-20 text-center"><Loader2 className="h-6 w-6 animate-spin text-indigo-500/50 mx-auto" /></td></tr>
                                                ) : filteredEvents.length === 0 ? (
                                                    <tr><td colSpan={6} className="py-12 text-center text-muted-foreground text-xs">
                                                        {allEvents.length === 0
                                                            ? "No AI-blocked events recorded. Enable the AI engine and send attack traffic to generate data."
                                                            : "No events match the current filters. Try clearing them."}
                                                    </td></tr>
                                                ) : (
                                                    filteredEvents.map((ev: any, i: number) => {
                                                        const score = ev.anomalyScore ?? ev.AnomalyScore ?? 0;
                                                        const tenant = ev.tenantId || ev.TenantId || "—";
                                                        const ts = new Date(ev.blockedAt || ev.BlockedAt);
                                                        return (
                                                            <tr key={i} className={`hover:bg-muted/20 transition-colors group ${score >= 0.9 ? "border-l-2 border-l-red-500/40" : ""}`}>
                                                                <td className="px-4 py-2.5 font-mono text-[10px] text-muted-foreground whitespace-nowrap">
                                                                    <div>{ts.toLocaleDateString()}</div>
                                                                    <div>{ts.toLocaleTimeString()}</div>
                                                                </td>
                                                                <td className="px-4 py-2.5">
                                                                    <span
                                                                        onClick={() => setTenantFilter(tenant)}
                                                                        className="text-[10px] font-mono px-2 py-0.5 rounded cursor-pointer bg-violet-500/10 text-violet-300 border border-violet-500/20 hover:bg-violet-500/20 transition-colors"
                                                                        title={`Filter to ${tenant}`}
                                                                    >
                                                                        {tenant}
                                                                    </span>
                                                                </td>
                                                                <td className="px-4 py-2.5 font-mono text-[10px] text-muted-foreground truncate max-w-[200px]" title={ev.url || ev.Url}>
                                                                    {ev.url || ev.Url || "/"}
                                                                </td>
                                                                <td className="px-4 py-2.5">
                                                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase border border-border/50 bg-background">
                                                                        {ev.method || ev.Method || "GET"}
                                                                    </span>
                                                                </td>
                                                                <td className="px-4 py-2.5">
                                                                    <div className="flex flex-col gap-1.5 align-middle">
                                                                        <div className="flex items-center gap-1.5">
                                                                            <span className={`text-xs font-bold font-mono ${scoreColor(score)} w-6 whitespace-nowrap`}>
                                                                                {(score * 100).toFixed(0)}%
                                                                            </span>
                                                                            <div className="w-12 h-1 rounded-full bg-muted overflow-hidden">
                                                                                <div
                                                                                    className={`h-full ${score >= 0.9 ? "bg-red-500" : score >= 0.75 ? "bg-yellow-500" : "bg-indigo-500"}`}
                                                                                    style={{ width: `${score * 100}%` }}
                                                                                />
                                                                            </div>
                                                                        </div>
                                                                        {((ev.mlScore || ev.MLScore) > 0 || (ev.astScore || ev.ASTScore) > 0) && (
                                                                            <div className="flex flex-wrap items-center gap-1 mt-0.5">
                                                                                <span className="text-[8px] font-mono font-semibold text-indigo-400 bg-indigo-400/10 px-1 py-0.5 rounded border border-indigo-400/20">
                                                                                    ML: {(((ev.mlScore || ev.MLScore) ?? 0) * 100).toFixed(0)}%
                                                                                </span>
                                                                                <span className="text-[8px] font-mono font-semibold text-cyan-400 bg-cyan-400/10 px-1 py-0.5 rounded border border-cyan-400/20">
                                                                                    AST: {(((ev.astScore || ev.ASTScore) ?? 0) * 100).toFixed(0)}%
                                                                                </span>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                                <td className="px-4 py-2.5">
                                                                    <div className="flex flex-col gap-1.5">
                                                                        <div className="flex flex-wrap gap-1">
                                                                            {(ev.matches || ev.Matches || []).slice(0, 2).map((m: string, j: number) => (
                                                                                <span key={j} className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                                                                                    {m.length > 28 ? m.slice(0, 28) + "…" : m}
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                        {(ev.ja4Fingerprint || ev.JA4Fingerprint) && (
                                                                            <div className="flex items-center gap-1 opacity-80 hover:opacity-100 transition-opacity">
                                                                                <span className="text-[8px] font-semibold text-muted-foreground bg-muted px-1 py-0.5 rounded">JA4</span>
                                                                                <span className="text-[9px] font-mono font-medium text-foreground tracking-tight select-all">
                                                                                    {ev.ja4Fingerprint || ev.JA4Fingerprint}
                                                                                </span>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </React.Fragment>
                )}

                {/* ═══════════════ TAB: Tenant Policies ═══════════════════════ */}
                {activeTab === "policy" && (
                    <div className="bg-card border border-border/60 rounded-xl p-5 shadow-sm">
                        <div className="flex items-center justify-between mb-5">
                            <div className="flex items-center gap-2">
                                <Shield className="h-4 w-4 text-indigo-400" />
                                <h2 className="text-sm font-bold text-foreground">Per-Tenant AI Policy Overview</h2>
                                <span className="text-[10px] text-muted-foreground">all tenants · AI status + WAF mode · refreshes every 30s</span>
                            </div>
                            {policyLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                        </div>

                        {policyOverview.length === 0 ? (
                            <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">
                                {policyLoading ? "Loading tenant policies…" : "No tenants found."}
                            </div>
                        ) : (
                            <>
                                {/* Top Pagination Controls */}
                                {policyOverview.length > policyPageSize && (
                                    <div className="flex items-center justify-between gap-4 pb-4 border-b border-border/30 mb-4 text-[11px]">
                                        <span className="text-muted-foreground">
                                            Showing <span className="font-semibold text-foreground">{Math.min((policyPage - 1) * policyPageSize + 1, policyOverview.length)}</span> to{" "}
                                            <span className="font-semibold text-foreground">{Math.min(policyPage * policyPageSize, policyOverview.length)}</span> of{" "}
                                            <span className="font-semibold text-foreground">{policyOverview.length}</span> tenants
                                        </span>
                                        <div className="flex items-center gap-1.5">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => setPolicyPage(prev => Math.max(prev - 1, 1))}
                                                disabled={policyPage === 1}
                                                className="h-7 px-2.5 text-[10px]"
                                            >
                                                Previous
                                            </Button>
                                            <div className="flex items-center gap-1">
                                                {Array.from({ length: totalPolicyPages }).map((_, idx) => {
                                                    const p = idx + 1;
                                                    if (
                                                        totalPolicyPages <= 4 ||
                                                        p === 1 ||
                                                        p === totalPolicyPages ||
                                                        Math.abs(p - policyPage) <= 1
                                                    ) {
                                                        return (
                                                            <button
                                                                key={p}
                                                                onClick={() => setPolicyPage(p)}
                                                                className={`h-7 w-7 text-[10px] rounded-lg font-bold border transition-all ${policyPage === p
                                                                    ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-400"
                                                                    : "border-border/40 hover:bg-muted text-muted-foreground hover:text-foreground"
                                                                    }`}
                                                            >
                                                                {p}
                                                            </button>
                                                        );
                                                    } else if (p === 2 || p === totalPolicyPages - 1) {
                                                        return <span key={p} className="px-0.5 text-muted-foreground">...</span>;
                                                    }
                                                    return null;
                                                })}
                                            </div>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => setPolicyPage(prev => Math.min(prev + 1, totalPolicyPages))}
                                                disabled={policyPage === totalPolicyPages}
                                                className="h-7 px-2.5 text-[10px]"
                                            >
                                                Next
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr className="border-b border-border/40 text-left">
                                                {["Tenant", "Industry", "AI Engine", "WAF Mode", "Blocks (24h)", "Status"].map(h => (
                                                    <th key={h} className="px-3 py-2.5 text-[9px] uppercase tracking-widest font-semibold text-muted-foreground">{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border/30">
                                            {paginatedPolicies.map((row: any) => (
                                                <tr key={row.tenantId} className="hover:bg-muted/30 transition-colors">
                                                    <td className="px-3 py-2.5 font-medium">{row.name}</td>
                                                    <td className="px-3 py-2.5 text-muted-foreground">{row.industry || "—"}</td>
                                                    <td className="px-3 py-2.5">
                                                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${row.aiEnabled
                                                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                                            : "bg-red-500/10 border-red-500/30 text-red-400"
                                                            }`}>
                                                            <span className={`h-1.5 w-1.5 rounded-full ${row.aiEnabled ? "bg-emerald-400" : "bg-red-400"}`} />
                                                            {row.aiEnabled ? "Enabled" : "Disabled"}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-2.5">
                                                        <span className={`inline-flex text-[10px] font-semibold px-2 py-0.5 rounded border ${row.wafMode === "prevention"
                                                            ? "bg-violet-500/10 border-violet-500/30 text-violet-400"
                                                            : "bg-blue-500/10 border-blue-500/30 text-blue-400"
                                                            }`}>
                                                            {row.wafMode === "prevention" ? "Prevention" : "Detection"}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-2.5">
                                                        <span className={`font-mono font-bold ${row.blocks24h > 0 ? "text-red-400" : "text-muted-foreground"
                                                            }`}>{row.blocks24h ?? 0}</span>
                                                    </td>
                                                    <td className="px-3 py-2.5">
                                                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${row.isActive
                                                            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                                                            : "bg-muted border-border/40 text-muted-foreground"
                                                            }`}>
                                                            {row.isActive ? "Active" : "Inactive"}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Bottom Pagination Controls */}
                                {policyOverview.length > policyPageSize && (
                                    <div className="flex items-center justify-between gap-4 pt-4 border-t border-border/30 mt-4 text-[11px]">
                                        <span className="text-muted-foreground">
                                            Showing <span className="font-semibold text-foreground">{Math.min((policyPage - 1) * policyPageSize + 1, policyOverview.length)}</span> to{" "}
                                            <span className="font-semibold text-foreground">{Math.min(policyPage * policyPageSize, policyOverview.length)}</span> of{" "}
                                            <span className="font-semibold text-foreground">{policyOverview.length}</span> tenants
                                        </span>
                                        <div className="flex items-center gap-1.5">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => setPolicyPage(prev => Math.max(prev - 1, 1))}
                                                disabled={policyPage === 1}
                                                className="h-7 px-2.5 text-[10px]"
                                            >
                                                Previous
                                            </Button>
                                            <div className="flex items-center gap-1">
                                                {Array.from({ length: totalPolicyPages }).map((_, idx) => {
                                                    const p = idx + 1;
                                                    if (
                                                        totalPolicyPages <= 4 ||
                                                        p === 1 ||
                                                        p === totalPolicyPages ||
                                                        Math.abs(p - policyPage) <= 1
                                                    ) {
                                                        return (
                                                            <button
                                                                key={p}
                                                                onClick={() => setPolicyPage(p)}
                                                                className={`h-7 w-7 text-[10px] rounded-lg font-bold border transition-all ${policyPage === p
                                                                    ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-400"
                                                                    : "border-border/40 hover:bg-muted text-muted-foreground hover:text-foreground"
                                                                    }`}
                                                            >
                                                                {p}
                                                            </button>
                                                        );
                                                    } else if (p === 2 || p === totalPolicyPages - 1) {
                                                        return <span key={p} className="px-0.5 text-muted-foreground">...</span>;
                                                    }
                                                    return null;
                                                })}
                                            </div>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => setPolicyPage(prev => Math.min(prev + 1, totalPolicyPages))}
                                                disabled={policyPage === totalPolicyPages}
                                                className="h-7 px-2.5 text-[10px]"
                                            >
                                                Next
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}

                {/* ═══════════════ TAB: Global Threats ════════════════════════ */}
                {activeTab === "global" && (
                    <div className="space-y-5">

                        {/* KPI Cards */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            {[
                                {
                                    label: "Blocks (24h)",
                                    value: globalLoading ? null : (globalThreat?.totalBlocks24h ?? 0),
                                    icon: Shield,
                                    color: "text-red-400",
                                    bg: "bg-red-500/10 border-red-500/20",
                                    sub: "platform-wide",
                                },
                                {
                                    label: "Blocks (7d)",
                                    value: globalLoading ? null : (globalThreat?.totalBlocks7d ?? 0),
                                    icon: TrendingUp,
                                    color: "text-yellow-400",
                                    bg: "bg-yellow-500/10 border-yellow-500/20",
                                    sub: "rolling 7-day window",
                                },
                                {
                                    label: "Tenants Under Attack",
                                    value: globalLoading ? null : (globalThreat?.uniqueTenants24h ?? 0),
                                    icon: Globe,
                                    color: "text-indigo-400",
                                    bg: "bg-indigo-500/10 border-indigo-500/20",
                                    sub: "active in last 24h",
                                },
                                {
                                    label: "Top Pattern",
                                    value: globalLoading ? null : (globalThreat?.topPatterns?.[0]?.totalCount ?? 0),
                                    icon: AlertTriangle,
                                    color: "text-orange-400",
                                    bg: "bg-orange-500/10 border-orange-500/20",
                                    sub: globalThreat?.topPattern
                                        ? (globalThreat.topPattern.length > 28 ? globalThreat.topPattern.slice(0, 28) + "…" : globalThreat.topPattern)
                                        : "no data yet",
                                },
                            ].map(({ label, value, icon: Icon, color, bg, sub }) => (
                                <div key={label} className={`rounded-xl border p-4 ${bg}`}>
                                    <div className="flex items-center gap-2 mb-2">
                                        <Icon className={`h-4 w-4 ${color}`} />
                                        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">{label}</span>
                                    </div>
                                    <div className="text-3xl font-bold">
                                        {value === null ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : value}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground mt-1">{sub}</div>
                                </div>
                            ))}
                        </div>

                        {/* 7-Day Block Trend Chart */}
                        <div className="bg-card border border-border/60 rounded-xl p-5 shadow-sm">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                                    <Activity className="h-4 w-4 text-indigo-400" />
                                    Platform Block Trend
                                </h2>
                                <span className="text-[10px] text-muted-foreground">All tenants · Last 7 days</span>
                            </div>
                            {globalLoading ? (
                                <div className="flex items-center justify-center h-44">
                                    <Loader2 className="h-6 w-6 animate-spin text-indigo-400/50" />
                                </div>
                            ) : dailyTrendData.length === 0 ? (
                                <div className="flex items-center justify-center h-44 text-xs text-muted-foreground">
                                    No block events in the last 7 days.
                                </div>
                            ) : (
                                <ResponsiveContainer width="100%" height={180}>
                                    <AreaChart data={dailyTrendData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                                        <defs>
                                            <linearGradient id="globalGrad" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                        <XAxis dataKey="day" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                                        <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} allowDecimals={false} />
                                        <Tooltip content={<AreaTooltip />} />
                                        <Area type="monotone" dataKey="blocks" name="Blocks" stroke="#6366f1" strokeWidth={2} fill="url(#globalGrad)" dot={false} activeDot={{ r: 4, fill: "#6366f1" }} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            )}
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                            {/* Top Targeted Tenants */}
                            <div className="bg-card border border-border/60 rounded-xl p-5 shadow-sm">
                                <div className="flex items-center gap-2 mb-4">
                                    <AlertTriangle className="h-4 w-4 text-red-400" />
                                    <h2 className="text-sm font-bold text-foreground">Top Targeted Tenants</h2>
                                    <span className="text-[10px] text-muted-foreground ml-auto">last 24h</span>
                                </div>
                                {globalLoading ? (
                                    <div className="flex items-center justify-center h-40">
                                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                    </div>
                                ) : !globalThreat?.topTargetedTenants?.length ? (
                                    <div className="flex items-center justify-center h-40 text-xs text-muted-foreground">No attack data yet.</div>
                                ) : (
                                    <div className="space-y-2">
                                        {(globalThreat.topTargetedTenants as any[]).map((t: any, i: number) => (
                                            <div key={t.tenantId} className="flex items-center gap-3 group hover:bg-muted/30 rounded-lg px-2 py-1.5 transition-colors">
                                                <span className="text-[10px] font-bold text-muted-foreground w-5 text-center">{i + 1}</span>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-xs font-semibold truncate">{t.tenantName || t.tenantId}</div>
                                                    <div className="text-[10px] text-muted-foreground">Avg {(t.avgScore * 100).toFixed(0)}% · Max {(t.maxScore * 100).toFixed(0)}%</div>
                                                </div>
                                                <span className={`text-xs font-bold font-mono ${t.blocks24h > 10 ? "text-red-400" : t.blocks24h > 3 ? "text-yellow-400" : "text-muted-foreground"}`}>
                                                    {t.blocks24h}
                                                </span>
                                                <div className="w-16 bg-muted/50 rounded-full h-1.5 overflow-hidden">
                                                    <div
                                                        className="h-1.5 rounded-full bg-gradient-to-r from-indigo-500 to-red-500 transition-all"
                                                        style={{ width: `${Math.min(100, (t.blocks24h / ((globalThreat.topTargetedTenants as any[])[0]?.blocks24h || 1)) * 100)}%` }}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Top Attack Patterns */}
                            <div className="bg-card border border-border/60 rounded-xl p-5 shadow-sm">
                                <div className="flex items-center gap-2 mb-4">
                                    <BarChart2 className="h-4 w-4 text-yellow-400" />
                                    <h2 className="text-sm font-bold text-foreground">Top Attack Patterns</h2>
                                    <span className="text-[10px] text-muted-foreground ml-auto">last 7 days · all tenants</span>
                                </div>
                                {globalLoading ? (
                                    <div className="flex items-center justify-center h-40">
                                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                    </div>
                                ) : !globalThreat?.topPatterns?.length ? (
                                    <div className="flex items-center justify-center h-40 text-xs text-muted-foreground">No pattern data yet.</div>
                                ) : (
                                    <div className="space-y-2">
                                        {(globalThreat.topPatterns as any[]).slice(0, 10).map((p: any, i: number) => (
                                            <div key={i} className="flex items-start gap-3 hover:bg-muted/30 rounded-lg px-2 py-1.5 transition-colors">
                                                <span className="text-[10px] font-bold text-muted-foreground w-5 text-center mt-0.5">{i + 1}</span>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-xs font-semibold break-all leading-snug">
                                                        {p.pattern.length > 50 ? p.pattern.slice(0, 50) + "…" : p.pattern}
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <span className="text-[10px] text-muted-foreground">{p.affectedTenants} tenant{p.affectedTenants !== 1 ? "s" : ""}</span>
                                                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${p.maxScore >= 0.9
                                                            ? "bg-red-500/10 border-red-500/30 text-red-400"
                                                            : p.maxScore >= 0.75
                                                                ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-400"
                                                                : "bg-muted border-border/40 text-muted-foreground"
                                                            }`}>
                                                            {p.maxScore >= 0.9 ? "Critical" : p.maxScore >= 0.75 ? "High" : "Medium"}
                                                        </span>
                                                    </div>
                                                </div>
                                                <span className="text-xs font-bold font-mono text-foreground">{p.totalCount}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
}

import { useState, useMemo } from "react";
import {
    AlertTriangle, ShieldBan, ShieldCheck, Filter, Loader2,
    Activity, Globe, Zap, Fingerprint, UserCheck, Search,
    ExternalLink, TrendingUp, Info, MousePointer2, Map as MapIcon,
    ShieldAlert, Target, BookOpen, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UpgradeOverlay } from "@/components/UpgradeOverlay";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, AreaChart, Area, Legend
} from 'recharts';

const severityColors: Record<string, string> = {
    critical: "bg-destructive/10 text-destructive border-destructive/30",
    high: "bg-warning/10 text-warning border-warning/30",
    medium: "bg-primary/10 text-primary border-primary/30",
    low: "bg-muted text-muted-foreground border-border",
};

const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

interface AttackLog {
    id: string;
    ip_address: string;
    rule_id: string;
    rule_name: string;
    uri: string;
    created_at: string;
    severity: string;
    action: string;
    raw_data?: string;
    mitre_technique?: string;
    mitre_tactic?: string;
}

export default function AlertsPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    const [activeTab, setActiveTab] = useState<"logs" | "traffic" | "risk" | "bots" | "ratelimit" | "ato" | "ai">("logs");
    const [severityFilter, setSeverityFilter] = useState<string>("all");
    const [ipFilter, setIpFilter] = useState("");
    const [ruleFilter, setRuleFilter] = useState("");
    const [selectedLog, setSelectedLog] = useState<AttackLog | null>(null);

    const isPlatformAdmin = user?.role === "super_admin" || user?.role === "admin" || user?.role === "support_engineer";
    const isLocked = !isPlatformAdmin && user && !user.entitlements.hasAttackLogs;

    const authHeaders = useMemo(() => {
        const token = (localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token")) || sessionStorage.getItem("auth_token");
        return { "Authorization": `Bearer ${token}` };
    }, []);

    // --- Queries ---
    const { data: alertsRaw = [], isLoading: alertsLoading } = useQuery({
        queryKey: ["alerts"],
        queryFn: () => fetch("/api/alerts", { headers: authHeaders }).then(res => res.json())
    });

    const { data: aiLogs = [], isLoading: aiLoading } = useQuery({
        queryKey: ["ai-alerts"],
        queryFn: () => fetch("/api/firewall/ai-events", { headers: authHeaders }).then(res => res.json()),
        enabled: activeTab === "ai"
    });

    const { data: trafficData, isLoading: trafficLoading } = useQuery({
        queryKey: ["analytics-traffic"],
        queryFn: () => fetch("/api/analytics/traffic", { headers: authHeaders }).then(res => res.json()),
        enabled: activeTab === "traffic"
    });

    const { data: riskData, isLoading: riskLoading } = useQuery({
        queryKey: ["analytics-risk"],
        queryFn: () => fetch("/api/analytics/risk", { headers: authHeaders }).then(res => res.json()),
        enabled: activeTab === "risk"
    });

    const { data: botData, isLoading: botLoading } = useQuery({
        queryKey: ["analytics-bots"],
        queryFn: () => fetch("/api/analytics/bots", { headers: authHeaders }).then(res => res.json()),
        enabled: activeTab === "bots"
    });

    const { data: rateData, isLoading: rateLoading } = useQuery({
        queryKey: ["analytics-ratelimit"],
        queryFn: () => fetch("/api/analytics/rate-limit", { headers: authHeaders }).then(res => res.json()),
        enabled: activeTab === "ratelimit"
    });

    const { data: atoData, isLoading: atoLoading } = useQuery({
        queryKey: ["analytics-ato"],
        queryFn: () => fetch("/api/analytics/ato", { headers: authHeaders }).then(res => res.json()),
        enabled: activeTab === "ato"
    });

    const logs: AttackLog[] = useMemo(() => {
        return (Array.isArray(alertsRaw) ? alertsRaw : []).map((l: any) => ({
            id: l.id || String(Math.random()),
            ip_address: l.ipAddress || l.ip_address || "unknown",
            rule_id: l.ruleId || l.rule_id || "0",
            rule_name: l.ruleName || l.rule_name || "Security Event",
            uri: l.requestUri || l.request_uri || "/",
            created_at: l.timestamp || l.createdAt || new Date().toISOString(),
            severity: (l.severity || "medium").toLowerCase(),
            action: l.action || "blocked",
            raw_data: l.rawData || l.raw_data,
            mitre_technique: l.mitre_technique || l.mitreTechnique,
            mitre_tactic: l.mitre_tactic || l.mitreTactic
        }));
    }, [alertsRaw]);

    const stats = useMemo(() => {
        return {
            critical: logs.filter(l => l.severity === "critical").length,
            high: logs.filter(l => l.severity === "high").length,
            medium: logs.filter(l => l.severity === "medium").length,
            low: logs.filter(l => l.severity === "low").length,
        };
    }, [logs]);

    const filteredLogs = logs.filter(l => {
        if (severityFilter !== "all" && l.severity !== severityFilter) return false;
        if (ipFilter && !l.ip_address.includes(ipFilter)) return false;
        if (ruleFilter && !l.rule_id.includes(ruleFilter)) return false;
        return true;
    });

    const isLoading = alertsLoading || trafficLoading || riskLoading || botLoading || rateLoading || atoLoading;

    return (
        <DashboardLayout>
            <div className={`space-y-6 relative transition-all duration-500 ${isLocked ? 'blur-sm pointer-events-none select-none opacity-40' : ''}`}>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Security Center</h1>
                        <p className="text-sm text-muted-foreground">Advanced intelligence & real-time threat detection</p>
                    </div>
                    <div className="flex gap-1.5 bg-muted/30 p-1 rounded-lg border border-border/50">
                        {[
                            { id: "logs", label: "Incident Logs", icon: Activity },
                            { id: "ai", label: "AI Engine", icon: Zap },
                            { id: "traffic", label: "Traffic", icon: Globe },
                            { id: "risk", label: "Risks", icon: ShieldAlert },
                            { id: "bots", label: "Bots", icon: UserCheck },
                            { id: "ratelimit", label: "Rate Limits", icon: TrendingUp },
                            { id: "ato", label: "ATO", icon: Fingerprint },
                        ].map((t) => (
                            <button
                                key={t.id}
                                onClick={() => setActiveTab(t.id as any)}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${activeTab === t.id ? "bg-background shadow-sm text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                                    }`}
                            >
                                <t.icon className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">{t.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {activeTab === "logs" && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {/* Severity Summary Cards */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {[
                                { id: "critical", label: "Critical Alerts", count: stats.critical, color: "text-destructive", borderColor: "border-destructive/30" },
                                { id: "high", label: "High Alerts", count: stats.high, color: "text-warning", borderColor: "border-warning/30" },
                                { id: "medium", label: "Medium Alerts", count: stats.medium, color: "text-primary", borderColor: "border-primary/30" },
                                { id: "low", label: "Low Alerts", count: stats.low, color: "text-muted-foreground", borderColor: "border-border" },
                            ].map((s) => (
                                <div
                                    key={s.id}
                                    onClick={() => setSeverityFilter(s.id === severityFilter ? "all" : s.id)}
                                    className={`bg-card p-4 rounded-xl border transition-all cursor-pointer hover:shadow-md ${severityFilter === s.id ? s.borderColor + " ring-1 ring-primary/20" : "border-border/60 hover:border-muted-foreground/30"
                                        }`}
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs uppercase font-bold tracking-wider text-muted-foreground">{s.label}</span>
                                        <AlertTriangle className={`h-4 w-4 ${s.color}`} />
                                    </div>
                                    <div className="flex items-baseline gap-2">
                                        <span className={`text-2xl font-bold font-mono ${s.color}`}>{s.count}</span>
                                        <span className="text-[10px] text-muted-foreground font-mono font-bold tracking-widest">EVENTS</span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Filters */}
                        <div className="flex flex-wrap items-center justify-between gap-4">
                            <div className="flex gap-2 bg-muted/50 p-1.5 rounded-lg border border-border/50">
                                {["all", "critical", "high", "medium", "low"].map((s) => (
                                    <button
                                        key={s}
                                        onClick={() => setSeverityFilter(s)}
                                        className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${severityFilter === s ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                                            }`}
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                            <div className="flex gap-3">
                                <div className="relative">
                                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground/70" />
                                    <Input
                                        placeholder="Search source IP..."
                                        value={ipFilter}
                                        onChange={e => setIpFilter(e.target.value)}
                                        className="h-9 pl-9 text-xs bg-card border-border/60 font-mono w-[180px]"
                                    />
                                </div>
                                <div className="relative">
                                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground/70" />
                                    <Input
                                        placeholder="Search Rule ID..."
                                        value={ruleFilter}
                                        onChange={e => setRuleFilter(e.target.value)}
                                        className="h-9 pl-9 text-xs bg-card border-border/60 font-mono w-[180px]"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Tabular Logs List */}
                        <div className="bg-card border border-border/60 rounded-xl overflow-hidden shadow-sm">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm whitespace-nowrap">
                                    <thead className="bg-muted/40 border-b border-border/60 uppercase tracking-wider text-[10px] text-muted-foreground font-semibold">
                                        <tr>
                                            <th className="px-4 py-3 font-medium">Timestamp</th>
                                            <th className="px-4 py-3 font-medium">Severity</th>
                                            <th className="px-4 py-3 font-medium">Action</th>
                                            <th className="px-4 py-3 font-medium min-w-[200px]">Detection Rule</th>
                                            <th className="px-4 py-3 font-medium">Target URI</th>
                                            <th className="px-4 py-3 font-medium">Source IP</th>
                                            <th className="px-4 py-3 font-medium text-right">Details</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/30">
                                        {isLoading ? (
                                            <tr>
                                                <td colSpan={7} className="py-20 text-center">
                                                    <Loader2 className="h-6 w-6 animate-spin text-primary/50 mx-auto" />
                                                </td>
                                            </tr>
                                        ) : filteredLogs.length === 0 ? (
                                            <tr>
                                                <td colSpan={7} className="py-12 text-center text-muted-foreground">
                                                    No security events match the current filters.
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredLogs.map((log) => (
                                                <tr
                                                    key={log.id}
                                                    className="hover:bg-muted/20 transition-colors cursor-pointer group"
                                                    onClick={() => setSelectedLog(log)}
                                                >
                                                    <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                                                        {new Date(log.created_at).toLocaleString()}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${severityColors[log.severity]}`}>
                                                            {log.severity}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase border border-border/50 bg-background shadow-sm ${log.action === 'blocked' ? 'text-destructive' : 'text-warning'}`}>
                                                            {log.action}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex flex-col">
                                                            <span className="font-semibold text-xs truncate max-w-[280px]" title={log.rule_name}>{log.rule_name}</span>
                                                            <span className="text-[10px] font-mono text-muted-foreground">Rule {log.rule_id}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground truncate max-w-[200px]" title={log.uri}>
                                                        {log.uri}
                                                    </td>
                                                    <td className="px-4 py-3 font-mono text-[11px] text-foreground/80">
                                                        {log.ip_address}
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground group-hover:text-primary transition-colors">
                                                            <ExternalLink className="h-4 w-4" />
                                                        </Button>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* AI Engine Blocks Tab */}
                {activeTab === "ai" && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">

                        {/* Header Banner */}
                        <div className="flex items-center justify-between gap-3 p-4 rounded-xl bg-indigo-500/5 border border-indigo-500/20">
                            <div className="flex items-center gap-3">
                                <Zap className="h-5 w-5 text-indigo-400 animate-pulse shrink-0" />
                                <div>
                                    <h3 className="text-sm font-bold text-indigo-300">AI Semantic Engine — Blocked Requests</h3>
                                    <p className="text-[11px] text-muted-foreground mt-0.5">Requests blocked based on anomaly scoring</p>
                                </div>
                            </div>
                            {/* Super admin link to full intelligence board */}
                            {isPlatformAdmin && (
                                <a
                                    href="/admin/ai-threats"
                                    className="text-[11px] font-medium text-indigo-400 hover:text-indigo-300 border border-indigo-500/30 px-3 py-1.5 rounded-lg hover:bg-indigo-500/10 transition-all flex items-center gap-1.5"
                                >
                                    🧠 Open Intelligence Board →
                                </a>
                            )}
                        </div>

                        {/* Event Table */}
                        <div className="bg-card border border-border/60 rounded-xl overflow-hidden shadow-sm">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm whitespace-nowrap">
                                    <thead className="bg-muted/40 border-b border-border/60 uppercase tracking-wider text-[10px] text-muted-foreground font-semibold">
                                        <tr>
                                            <th className="px-4 py-3">Timestamp</th>
                                            <th className="px-4 py-3">URL</th>
                                            <th className="px-4 py-3">Method</th>
                                            <th className="px-4 py-3">Score</th>
                                            <th className="px-4 py-3">Match Reasons</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/30">
                                        {aiLoading ? (
                                            <tr><td colSpan={5} className="py-20 text-center"><Loader2 className="h-6 w-6 animate-spin text-indigo-500/50 mx-auto" /></td></tr>
                                        ) : !Array.isArray(aiLogs) || (aiLogs as any[]).length === 0 ? (
                                            <tr><td colSpan={5} className="py-12 text-center text-muted-foreground text-xs">
                                                No AI-blocked events recorded yet. Enable the AI engine and trigger an attack to see results.
                                            </td></tr>
                                        ) : (
                                            (aiLogs as any[]).map((ev: any, i: number) => {
                                                const score = ev.anomalyScore ?? ev.AnomalyScore ?? 0;
                                                return (
                                                    <tr key={i} className="hover:bg-muted/20 transition-colors">
                                                        <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                                                            {new Date(ev.blockedAt || ev.BlockedAt).toLocaleString()}
                                                        </td>
                                                        <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground truncate max-w-[240px]" title={ev.url || ev.Url}>
                                                            {ev.url || ev.Url || "/"}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase border border-border/50 bg-background">
                                                                {ev.method || ev.Method || "GET"}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <span className={`text-xs font-bold font-mono ${score >= 0.9 ? 'text-destructive' : score >= 0.75 ? 'text-yellow-500' : 'text-muted-foreground'}`}>
                                                                {(score * 100).toFixed(0)}%
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <div className="flex flex-wrap gap-1">
                                                                {(ev.matches || ev.Matches || []).slice(0, 3).map((m: string, j: number) => (
                                                                    <span key={j} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                                                                        {m.length > 30 ? m.slice(0, 30) + "…" : m}
                                                                    </span>
                                                                ))}
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
                )}

                {/* Existing Traffic, Risk, Bots, RateLimit, ATO Tabs Unchanged */}
                {activeTab === "traffic" && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in zoom-in-95 duration-300">
                        <div className="bg-card border border-border/50 rounded-xl p-5 shadow-sm">
                            <h3 className="text-sm font-bold mb-6 flex items-center gap-2">
                                <Globe className="h-4 w-4 text-primary" /> Regional Traffic (Ethiopian Context)
                            </h3>
                            <div className="h-[250px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={trafficData?.regionalData}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#88888820" />
                                        <XAxis dataKey="region" fontSize={10} tick={{ fill: '#888' }} axisLine={false} tickLine={false} />
                                        <YAxis fontSize={10} tick={{ fill: '#888' }} axisLine={false} tickLine={false} />
                                        <Tooltip cursor={{ fill: '#88888810' }} contentStyle={{ backgroundColor: '#000', border: 'none', borderRadius: '8px', fontSize: '10px' }} />
                                        <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div className="bg-card border border-border/50 rounded-xl p-5 shadow-sm">
                            <h3 className="text-sm font-bold mb-6 flex items-center gap-2">
                                <Zap className="h-4 w-4 text-amber-500" /> HTTP Method Distribution
                            </h3>
                            <div className="h-[250px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={trafficData?.methodDistribution}
                                            dataKey="value"
                                            nameKey="label"
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={80}
                                            paddingAngle={5}
                                        >
                                            {trafficData?.methodDistribution.map((entry: any, index: number) => (
                                                <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip contentStyle={{ backgroundColor: '#000', border: 'none', borderRadius: '8px', fontSize: '10px' }} />
                                        <Legend iconType="circle" />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === "risk" && (
                    <div className="space-y-6 animate-in zoom-in-95 duration-300">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="col-span-1 bg-card border border-border/50 rounded-xl p-6 flex flex-col items-center justify-center text-center shadow-sm">
                                <div className="relative mb-4">
                                    <div className="h-32 w-32 rounded-full border-[10px] border-muted/30 flex items-center justify-center">
                                        <span className={`text-3xl font-bold ${riskData?.score > 70 ? 'text-destructive' : 'text-primary'}`}>{riskData?.score}%</span>
                                    </div>
                                    <div className="absolute inset-0 h-32 w-32 rounded-full border-[10px] border-primary border-t-transparent animate-spin-slow opacity-20" />
                                </div>
                                <h3 className="text-lg font-bold">Attack Likelihood</h3>
                                <p className="text-xs text-muted-foreground mt-1">Current system risk rating: <span className="font-bold text-foreground">{riskData?.rating}</span></p>
                                <div className="w-full h-1.5 bg-muted rounded-full mt-6 overflow-hidden">
                                    <div className={`h-full transition-all duration-1000 ${riskData?.score > 70 ? 'bg-destructive' : 'bg-primary'}`} style={{ width: `${riskData?.score}%` }} />
                                </div>
                            </div>

                            <div className="md:col-span-2 bg-card border border-border/50 rounded-xl p-6 shadow-sm">
                                <h3 className="text-sm font-bold mb-6 flex items-center gap-2">
                                    <TrendingUp className="h-4 w-4 text-primary" /> Risk Progression (24h)
                                </h3>
                                <div className="h-[220px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={riskData?.trends}>
                                            <defs>
                                                <linearGradient id="colorRisk" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#88888820" />
                                            <XAxis dataKey="time" fontSize={10} tick={{ fill: '#888' }} axisLine={false} />
                                            <YAxis fontSize={10} tick={{ fill: '#888' }} axisLine={false} />
                                            <Tooltip contentStyle={{ backgroundColor: '#000', border: 'none', borderRadius: '8px', fontSize: '10px' }} />
                                            <Area type="monotone" dataKey="risk" stroke="#3b82f6" fillOpacity={1} fill="url(#colorRisk)" />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>

                        <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex gap-3">
                            <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                            <div>
                                <h4 className="text-xs font-bold text-primary uppercase tracking-wider">Security Intelligence Insight</h4>
                                <p className="text-sm text-muted-foreground mt-1">
                                    Based on current heuristics, we suggest enabling "Aggressive Mode" for your <span className="font-bold text-foreground">API Endpoints</span> as we detect consistent path traversal attempts typical of automated scanners.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {(activeTab === "bots" || activeTab === "ratelimit" || activeTab === "ato") && (
                    <div className="py-20 text-center space-y-4 animate-in fade-in duration-500">
                        <div className="bg-muted w-16 h-16 rounded-full flex items-center justify-center mx-auto border border-border/50 shadow-inner">
                            {activeTab === "bots" && <UserCheck className="h-8 w-8 text-primary/50" />}
                            {activeTab === "ratelimit" && <Zap className="h-8 w-8 text-amber-500/50" />}
                            {activeTab === "ato" && <Fingerprint className="h-8 w-8 text-destructive/50" />}
                        </div>
                        <div className="max-w-md mx-auto">
                            <h3 className="text-lg font-bold">Refining Data Visualization</h3>
                            <p className="text-sm text-muted-foreground">We are currently aggregating real-time telemetry from your edge nodes to populate the <span className="text-foreground font-semibold">{activeTab.toUpperCase()}</span> module. Expected arrival in 2-3 minutes.</p>
                        </div>
                        <div className="flex justify-center gap-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-pulse" />
                            <div className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-pulse delay-75" />
                            <div className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-pulse delay-150" />
                        </div>
                    </div>
                )}

            </div>

            {isLocked && (
                <UpgradeOverlay
                    title="Security Operations Center"
                    description="Access advanced threat intelligence, bot analytics, and account takeover prevention tools. Elite SOC features require the Enterprise plan."
                    feature="Advanced Analytics"
                />
            )}

            {selectedLog && (
                <AlertDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />
            )}
        </DashboardLayout>
    );
}

function AlertDetailModal({ log, onClose }: { log: AttackLog, onClose: () => void }) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const parsedRaw = useMemo(() => {
        try { return JSON.parse(log.raw_data || "{}"); } catch { return { error: "Unparseable metadata" }; }
    }, [log.raw_data]);

    const excludeMutation = useMutation({
        mutationFn: async (data: { ruleId: string, uri: string }) => {
            const token = (localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token"));
            const res = await fetch("/api/firewall/owasp-exclusions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    ruleId: data.ruleId,
                    uriPattern: data.uri,
                    description: `False positive reported from alert ${log.id}`
                })
            });
            if (!res.ok) throw new Error("Failed to create exclusion");
            return res.json();
        },
        onSuccess: () => {
            toast({ title: "Exclusion Created", description: `Rule ${log.rule_id} is now bypassed for ${log.uri}. Edge proxy is reloading.` });
            queryClient.invalidateQueries({ queryKey: ["alerts"] });
            onClose();
        },
        onError: (e: any) => {
            toast({ title: "Exclusion Failed", description: e.message, variant: "destructive" });
        }
    });

    const blockMutation = useMutation({
        mutationFn: async (ipAddress: string) => {
            const token = (localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token"));
            const res = await fetch("/api/firewall/rules", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({ ipAddress, ruleType: "blacklist", note: `Blocked from incident alert` })
            });
            if (!res.ok) throw new Error("Failed to block IP");
            return res.json();
        },
        onSuccess: () => {
            toast({ title: "IP Blocked", description: `${log.ip_address} added to network blocklist.` });
            onClose();
        },
        onError: (e: any) => {
            toast({ title: "Block Failed", description: e.message, variant: "destructive" });
        }
    });

    const [isConfirmingFP, setIsConfirmingFP] = useState(false);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
            <div className="bg-card border shadow-2xl rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                <div className="p-5 border-b flex items-center justify-between bg-muted/20">
                    <div className="flex items-center gap-3">
                        <div className={`p-2.5 rounded-xl ${log.severity === 'critical' ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>
                            <AlertTriangle className="h-5 w-5" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold tracking-tight">Security Incident Analysis</h2>
                            <p className="text-[10px] text-muted-foreground font-mono tracking-widest">{log.id.toUpperCase()}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-all text-muted-foreground"><ShieldBan className="h-4 w-4" /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-8">
                    <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-1.5">
                            <label className="text-[9px] font-bold uppercase text-muted-foreground tracking-widest">Incident Root Cause</label>
                            <div className="flex items-center gap-2 p-3 bg-muted/40 rounded-xl border border-border/50">
                                <ShieldCheck className="h-4 w-4 text-success" />
                                <span className="text-xs font-bold leading-none">{log.rule_name}</span>
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[9px] font-bold uppercase text-muted-foreground tracking-widest">Enforcement Action</label>
                            <div className={`flex items-center gap-2 p-3 rounded-xl border border-border/50 ${log.action === 'blocked' ? 'bg-destructive/5 text-destructive' : 'bg-warning/5 text-warning'}`}>
                                <ShieldBan className="h-4 w-4" />
                                <span className="text-xs font-bold leading-none capitalize">{log.action}</span>
                            </div>
                        </div>
                    </div>

                    {/* MITRE ATT&CK Intelligence Section */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                                <Target className="h-3.5 w-3.5 text-indigo-400" /> MITRE ATT&CK Intelligence
                            </h4>
                            {(log.mitre_technique) && (
                                <a
                                    href={`https://attack.mitre.org/techniques/${log.mitre_technique?.split('.')[0]}/`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-[9px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors uppercase tracking-wider"
                                >
                                    <BookOpen className="h-3 w-3" /> View on MITRE
                                    <ExternalLink className="h-2.5 w-2.5" />
                                </a>
                            )}
                        </div>
                        {log.mitre_technique || log.mitre_tactic ? (
                            <div className="grid grid-cols-2 gap-3">
                                <div className="p-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5 space-y-2">
                                    <p className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest">Technique</p>
                                    <div className="flex items-center gap-2">
                                        <span className="inline-flex items-center gap-1.5 text-xs font-bold font-mono text-indigo-300 bg-indigo-950/60 px-2.5 py-1.5 rounded-lg border border-indigo-500/30">
                                            <Target className="h-3 w-3" />
                                            {log.mitre_technique || "—"}
                                        </span>
                                    </div>
                                    <p className="text-[9px] text-indigo-400/70 font-mono">Attack Pattern ID</p>
                                </div>
                                <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 space-y-2">
                                    <p className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest">Tactic</p>
                                    <div className="flex items-center gap-2">
                                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-300 bg-emerald-950/60 px-2.5 py-1.5 rounded-lg border border-emerald-500/30">
                                            <Zap className="h-3 w-3" />
                                            {log.mitre_tactic || "—"}
                                        </span>
                                    </div>
                                    <p className="text-[9px] text-emerald-400/70 font-mono">Kill Chain Phase</p>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center gap-3 p-4 bg-muted/20 border border-border/40 rounded-xl">
                                <div className="p-2 bg-muted rounded-lg">
                                    <Target className="h-4 w-4 text-muted-foreground/40" />
                                </div>
                                <div>
                                    <p className="text-xs font-bold text-muted-foreground">No MITRE Mapping</p>
                                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">Visit the MITRE Mapping page to assign ATT&CK context to this rule.</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Forensic Breakdown */}
                    <div className="space-y-4">
                        <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Forensic Breakdown</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {[
                                { label: "Originating IP", value: log.ip_address, icon: Globe },
                                { label: "Attack Signature", value: `Rule ${log.rule_id}`, icon: Zap },
                                { label: "Request URI", value: log.uri, icon: MousePointer2 },
                            ].map(item => (
                                <div key={item.label} className="p-3 bg-card border border-border/50 rounded-xl flex items-center gap-3">
                                    <item.icon className="h-4 w-4 text-muted-foreground/60" />
                                    <div>
                                        <p className="text-[8px] font-bold text-muted-foreground uppercase">{item.label}</p>
                                        <p className="text-[11px] font-mono font-semibold truncate max-w-[200px]" title={item.value}>{item.value}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Raw Log Payload</h4>
                            <div className="flex gap-1">
                                <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                            </div>
                        </div>
                        <div className="bg-[#0f172a] rounded-xl p-5 border border-white/5 overflow-hidden">
                            <pre className="text-[10px] font-mono text-cyan-400 overflow-x-auto custom-scrollbar">
                                {JSON.stringify(parsedRaw, null, 2)}
                            </pre>
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t bg-muted/30 flex justify-between items-center">
                    <div className="flex gap-2">
                        {isConfirmingFP ? (
                            <div className="flex items-center gap-2 animate-in slide-in-from-left-2">
                                <span className="text-[9px] font-bold text-amber-500 uppercase mr-2 shrink-0">Confirm Exclusion?</span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 px-3 text-[10px] font-bold uppercase border-amber-500/30 text-amber-500 hover:bg-amber-500/10"
                                    onClick={() => excludeMutation.mutate({ ruleId: log.rule_id, uri: log.uri })}
                                    disabled={excludeMutation.isPending}
                                >
                                    {excludeMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <ShieldCheck className="h-3 w-3 mr-2" />}
                                    YES, EXCLUDE
                                </Button>
                                <Button variant="ghost" size="sm" className="h-8 px-2 text-[10px] font-bold" onClick={() => setIsConfirmingFP(false)}>
                                    CANCEL
                                </Button>
                            </div>
                        ) : (
                            <>
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    className="h-8 px-4 text-[10px] font-bold uppercase tracking-wider"
                                    onClick={() => blockMutation.mutate(log.ip_address)}
                                    disabled={blockMutation.isPending}
                                >
                                    {blockMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <ShieldBan className="h-3 w-3 mr-2" />}
                                    NETWORK BLOCK
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 px-4 text-[10px] font-bold uppercase tracking-wider"
                                    onClick={() => setIsConfirmingFP(true)}
                                >
                                    FALSE POSITIVE
                                </Button>
                            </>
                        )}
                    </div>
                    <Button variant="default" size="sm" onClick={onClose} className="h-8 px-6 text-[10px] font-bold uppercase tracking-wider glow-primary">Acknowledge</Button>
                </div>
            </div>
        </div>
    );
}

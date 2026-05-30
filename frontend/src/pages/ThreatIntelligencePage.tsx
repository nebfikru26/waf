import { useState } from "react";
import {
  Shield, Eye, AlertTriangle, TrendingUp, Activity, Gauge,
  RefreshCw, Loader2, Settings2, CheckCircle2,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell,
} from "recharts";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UpgradeOverlay } from "@/components/UpgradeOverlay";

interface RiskThreshold {
  id?: string;
  logThreshold: number;
  challengeThreshold: number;
  blockThreshold: number;
  weightSqli: number;
  weightXss: number;
  weightPathTraversal: number;
  weightCmdi: number;
  weightSsrf: number;
  weightCustomRule: number;
  weightSchemaViol: number;
  weightAto: number;
  weightBotUa: number;
  weightMissingUa: number;
}

interface RiskEvent {
  id: string;
  client_ip: string;
  method: string;
  path: string;
  risk_score: number;
  threat_type: string;
  action: string;
  matched_pattern: string;
  timestamp: string;
}

interface RiskBucket {
  label: string;
  count: number;
  min: number;
  max: number;
}

interface RiskStats {
  buckets: RiskBucket[];
  top_threats: { threat_type: string; count: number }[];
}

const chartTooltipStyle = {
  backgroundColor: "hsl(220, 22%, 10%)",
  border: "1px solid hsl(220, 18%, 18%)",
  borderRadius: "8px",
  color: "hsl(210, 20%, 92%)",
  fontSize: "11px",
  fontFamily: "'JetBrains Mono', monospace",
};

const BUCKET_COLORS = [
  "hsl(142, 71%, 45%)",   // Low — green
  "hsl(45, 93%, 47%)",    // Medium — amber
  "hsl(25, 95%, 53%)",    // High — orange
  "hsl(0, 72%, 51%)",     // Critical — red
];

function scoreColor(score: number): string {
  if (score >= 80) return "text-red-400 border-red-400/30 bg-red-400/8";
  if (score >= 60) return "text-orange-400 border-orange-400/30 bg-orange-400/8";
  if (score >= 40) return "text-amber-400 border-amber-400/30 bg-amber-400/8";
  return "text-emerald-400 border-emerald-400/30 bg-emerald-400/8";
}

function actionBadge(action: string) {
  const map: Record<string, string> = {
    block: "text-red-400 border-red-400/30",
    challenge: "text-amber-400 border-amber-400/30",
    log: "text-sky-400 border-sky-400/30",
    allow: "text-emerald-400 border-emerald-400/30",
  };
  return map[action] || "text-muted-foreground border-border";
}

// ── Score Gauge ───────────────────────────────────────────────────────────────
function ScoreGauge({ score, label }: { score: number; label: string }) {
  const pct = Math.min(score, 100);
  const hue = Math.round(120 - pct * 1.2); // 120 green → 0 red
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-20 h-20">
        <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
          <circle cx="18" cy="18" r="15.9155" fill="none" stroke="hsl(220,22%,14%)" strokeWidth="3" />
          <circle
            cx="18" cy="18" r="15.9155" fill="none"
            stroke={`hsl(${hue}, 72%, 50%)`} strokeWidth="3"
            strokeDasharray={`${pct} ${100 - pct}`}
            strokeLinecap="round"
          />
        </svg>
        <span className={`absolute inset-0 flex items-center justify-center text-base font-bold font-mono ${scoreColor(score).split(" ")[0]}`}>
          {score}
        </span>
      </div>
      <span className="text-[10px] text-muted-foreground text-center">{label}</span>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ThreatIntelligencePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const canEdit = user?.role === "admin" || user?.role === "analyst";
  const isLocked = user && !user.entitlements.hasThreatIntel;
  const token = (localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token")) || sessionStorage.getItem("auth_token");
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`
  };
  const [localCfg, setLocalCfg] = useState<RiskThreshold | null>(null);
  const [minScore, setMinScore] = useState(0);

  const { data: thresholds, isLoading: cfgLoading } = useQuery<RiskThreshold>({
    queryKey: ["risk-thresholds"],
    queryFn: () => fetch("/api/risk/thresholds", { headers }).then(r => r.json()),
    onSuccess: (d) => { if (!localCfg) setLocalCfg(d); },
  } as any);

  const { data: stats } = useQuery<RiskStats>({
    queryKey: ["risk-stats"],
    queryFn: () => fetch("/api/risk/stats", { headers }).then(r => r.json()),
    refetchInterval: 20000,
  });

  const { data: events = [], isLoading: eventsLoading, refetch } = useQuery<RiskEvent[]>({
    queryKey: ["risk-events", minScore],
    queryFn: () => fetch(`/api/risk/events?min_score=${minScore}`, { headers }).then(r => r.json()),
    refetchInterval: 15000,
  });

  const saveMutation = useMutation({
    mutationFn: (cfg: RiskThreshold) =>
      fetch("/api/risk/thresholds", { method: "PUT", headers, body: JSON.stringify(cfg) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["risk-thresholds"] }); toast({ title: "Risk thresholds saved" }); },
    onError: () => toast({ title: "Invalid thresholds: Log ≤ Challenge ≤ Block", variant: "destructive" }),
  });

  const cfg = localCfg ?? thresholds;
  const sc = (k: keyof RiskThreshold, v: number) =>
    setLocalCfg(prev => prev ? { ...prev, [k]: v } : null);

  const safeEvents = Array.isArray(events) ? events : [];
  const buckets = stats?.buckets ?? [];
  const topThreats = stats?.top_threats ?? [];

  // Derive live stats from events
  const maxRisk = safeEvents.length > 0 ? Math.max(...safeEvents.map(e => e.risk_score)) : 0;
  const avgRisk = safeEvents.length > 0
    ? Math.round(safeEvents.reduce((s, e) => s + e.risk_score, 0) / safeEvents.length)
    : 0;
  const blockedCount = safeEvents.filter(e => e.action === "block" || e.action === "BLOCK").length;

  return (
    <DashboardLayout>
      <div className={`space-y-6 relative transition-all duration-500 ${isLocked ? 'blur-sm pointer-events-none select-none opacity-40' : ''}`}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" /> Risk Intelligence
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Predictive anomaly scoring — every request receives a 0–100 risk score based on behavioral signals
            </p>
          </div>
        </div>

        {/* Live Score Summary */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Events Logged", value: safeEvents.length, subtext: "Score ≥ threshold", icon: Activity },
            { label: "Avg Risk Score", value: avgRisk, subtext: "Current session", icon: Gauge },
            { label: "Peak Score", value: maxRisk, subtext: "Highest seen", icon: TrendingUp },
            { label: "Blocked Events", value: blockedCount, subtext: "Score ≥ block threshold", icon: Shield },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-muted text-primary"><s.icon className="h-4 w-4" /></div>
                <span className="text-sm text-muted-foreground">{s.label}</span>
              </div>
              <p className="text-2xl font-bold font-mono">{s.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.subtext}</p>
            </div>
          ))}
        </div>

        {/* Score Distribution Chart */}
        {buckets.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" /> Risk Score Distribution
            </h3>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={buckets} barSize={48}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,18%,14%)" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(210,20%,60%)" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(210,20%,60%)" }} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {buckets.map((_, i) => <Cell key={i} fill={BUCKET_COLORS[i]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Top Threat Types */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" /> Top Threat Types
            </h3>
            {topThreats.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">No threat data yet</p>
            ) : (
              <div className="space-y-2">
                {topThreats.map((t, i) => (
                  <div key={t.threat_type} className="flex items-center gap-3">
                    <span className="text-xs font-mono text-muted-foreground w-5">{i + 1}</span>
                    <span className="font-mono text-xs flex-1 capitalize">{t.threat_type?.replace(/_/g, " ")}</span>
                    <Badge variant="outline" className="font-mono text-xs">{t.count}</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Live Threshold Gauges */}
          {cfg && (
            <div className="bg-card border border-border rounded-xl p-5 col-span-2">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <Gauge className="h-4 w-4 text-primary" /> Current Threshold Configuration
              </h3>
              <div className="flex justify-around">
                <ScoreGauge score={cfg.logThreshold} label="Log Threshold" />
                <div className="flex items-center text-muted-foreground">→</div>
                <ScoreGauge score={cfg.challengeThreshold} label="Challenge Threshold" />
                <div className="flex items-center text-muted-foreground">→</div>
                <ScoreGauge score={cfg.blockThreshold} label="Block Threshold" />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[10px] text-muted-foreground">
                <div className="p-2 rounded-lg bg-muted/20 border border-border">
                  <span className="text-sky-400 font-medium">0–{cfg.logThreshold - 1}</span><br />Pass through silently
                </div>
                <div className="p-2 rounded-lg bg-amber-500/5 border border-amber-500/20">
                  <span className="text-amber-400 font-medium">{cfg.logThreshold}–{cfg.blockThreshold - 1}</span><br />Log or CAPTCHA
                </div>
                <div className="p-2 rounded-lg bg-red-500/5 border border-red-500/20">
                  <span className="text-red-400 font-medium">{cfg.blockThreshold}–100</span><br />Hard block (403)
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Threshold Configuration */}
        {cfg && (
          <div className="bg-card border border-border rounded-xl p-5 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-primary" /> Scoring Engine Configuration
              </h3>
            </div>

            {/* Action Thresholds */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Action Thresholds (0–100)</p>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { key: "logThreshold" as const, label: "Log Threshold", color: "text-sky-400" },
                  { key: "challengeThreshold" as const, label: "Challenge Threshold", color: "text-amber-400" },
                  { key: "blockThreshold" as const, label: "Block Threshold", color: "text-red-400" },
                ].map(f => (
                  <div key={f.key} className="space-y-1.5">
                    <Label className={`text-xs ${f.color}`}>{f.label}</Label>
                    <Input
                      type="number" min={0} max={100}
                      value={cfg[f.key]}
                      onChange={e => sc(f.key, parseInt(e.target.value) || 0)}
                      disabled={!canEdit} className="font-mono bg-muted/50 text-xs"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Signal Weights */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Signal Weights (points added to risk score)</p>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {[
                  { key: "weightSqli" as const, label: "SQLi" },
                  { key: "weightXss" as const, label: "XSS" },
                  { key: "weightPathTraversal" as const, label: "Path Trav." },
                  { key: "weightCmdi" as const, label: "CMDi" },
                  { key: "weightSsrf" as const, label: "SSRF" },
                  { key: "weightCustomRule" as const, label: "Custom Rule" },
                  { key: "weightSchemaViol" as const, label: "Schema Viol." },
                  { key: "weightAto" as const, label: "ATO Signal" },
                  { key: "weightBotUa" as const, label: "Bot UA" },
                  { key: "weightMissingUa" as const, label: "Missing UA" },
                ].map(f => (
                  <div key={f.key} className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">{f.label}</Label>
                    <Input
                      type="number" min={0} max={100}
                      value={cfg[f.key]}
                      onChange={e => sc(f.key, parseInt(e.target.value) || 0)}
                      disabled={!canEdit}
                      className="font-mono bg-muted/50 text-xs h-8 px-2"
                    />
                  </div>
                ))}
              </div>
            </div>

            {canEdit && (
              <div className="flex justify-end pt-2 border-t border-border">
                <Button
                  size="sm" className="text-xs font-mono"
                  disabled={saveMutation.isPending}
                  onClick={() => cfg && saveMutation.mutate(cfg)}
                >
                  {saveMutation.isPending
                    ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    : <CheckCircle2 className="h-3 w-3 mr-1" />}
                  SAVE CONFIGURATION
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Risk Event Log */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Eye className="h-4 w-4 text-primary" /> Risk Event Log
              </h3>
              <div className="flex items-center gap-2">
                <Label className="text-[10px] text-muted-foreground">Min Score:</Label>
                <Input
                  type="number" min={0} max={100} value={minScore}
                  onChange={e => setMinScore(parseInt(e.target.value) || 0)}
                  className="w-16 h-7 text-xs font-mono bg-muted/50"
                />
              </div>
            </div>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => refetch()}>
              <RefreshCw className="h-3 w-3 mr-1" /> Refresh
            </Button>
          </div>

          {eventsLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : safeEvents.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm border border-dashed border-border rounded-xl">
              No risk events above score {minScore} recorded yet.
            </div>
          ) : (
            <div className="space-y-1.5">
              {safeEvents.map(ev => (
                <div key={ev.id} className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-muted/20 hover:bg-muted/40 transition-colors text-xs">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="font-mono text-muted-foreground shrink-0">
                      {new Date(ev.timestamp).toLocaleTimeString()}
                    </span>
                    <span className="font-mono shrink-0">{ev.client_ip}</span>
                    <Badge variant="outline" className={`font-mono text-[9px] px-1 shrink-0 ${ev.method === "GET" ? "text-emerald-400 border-emerald-400/30" : "text-primary border-primary/30"}`}>
                      {ev.method}
                    </Badge>
                    <span className="font-mono text-primary truncate">{ev.path}</span>
                    {ev.matched_pattern && (
                      <span className="text-[9px] text-muted-foreground/60 truncate hidden lg:block">
                        {ev.matched_pattern}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${scoreColor(ev.risk_score)}`}>
                      {ev.risk_score}/100
                    </span>
                    <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border ${actionBadge(ev.action)}`}>
                      {ev.action.toUpperCase()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {isLocked && (
        <UpgradeOverlay 
          title="Predictive Risk Intelligence" 
          description="Identify and block advanced persistent threats (APTs) using behavioral signal scoring and global IOC feeds. This feature requires the Professional plan."
          feature="Threat Intelligence"
        />
      )}
    </DashboardLayout>
  );
}

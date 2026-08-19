import { useState } from "react";
import {
  Shield, Eye, AlertTriangle, TrendingUp, Activity, Gauge,
  RefreshCw, Loader2, Settings2, CheckCircle2, Globe,
  Database, Hash, Link2, Server, Clock, Search, Filter,
  ChevronLeft, ChevronRight, Wifi, Zap, ShieldCheck, ExternalLink,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as ChartTooltip,
  ResponsiveContainer, BarChart, Bar, Cell,
} from "recharts";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Info, Calendar, MapPin, Fingerprint, Target } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UpgradeOverlay } from "@/components/UpgradeOverlay";

// ─── Types ───────────────────────────────────────────────────────────────────

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

interface IocIndicator {
  id: string;
  indicator_value: string;
  indicator_type: string;
  pulse_name?: string;
  threat_type?: string;
  severity: string;
  source: string;
  country?: string;
  confidence_score: number;
  external_id?: string;
  external_link?: string;
  first_seen: string;
  last_seen: string;
  ingested_at: string;
}

interface IocSummary {
  totalIndicators: number;
  lastSyncedAt?: string;
  byType: { type: string; count: number }[];
  bySeverity: { severity: string; count: number }[];
  byThreat: { threat: string; count: number }[];
  bySource: { source: string; count: number; criticalCount: number; highCount: number; types: string[] }[];
  lastSyncCounts: Record<string, number>;
  criticalCount: number;
  highCount: number;
}

interface IocPage {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  items: IocIndicator[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const chartTooltipStyle = {
  backgroundColor: "hsl(220, 22%, 10%)",
  border: "1px solid hsl(220, 18%, 18%)",
  borderRadius: "8px",
  color: "hsl(210, 20%, 92%)",
  fontSize: "11px",
  fontFamily: "'JetBrains Mono', monospace",
};

const BUCKET_COLORS = [
  "hsl(142, 71%, 45%)",
  "hsl(45, 93%, 47%)",
  "hsl(25, 95%, 53%)",
  "hsl(0, 72%, 51%)",
];

const TYPE_ICONS: Record<string, any> = {
  IPv4: Server,
  IPv6: Server,
  domain: Globe,
  URL: Link2,
  "FileHash-MD5": Hash,
  "FileHash-SHA1": Hash,
  "FileHash-SHA256": Hash,
  CVE: AlertTriangle,
  other: Database,
};

// Per-source feed metadata for the feed status cards
const SOURCE_META: Record<string, { label: string; logo: string; color: string; url: string }> = {
  "AlienVault-OTX": { label: "AlienVault OTX", logo: "🛡️", color: "text-emerald-400", url: "https://otx.alienvault.com" },
  "CISA-KEV": { label: "CISA KEV", logo: "🇺🇸", color: "text-blue-400", url: "https://www.cisa.gov/known-exploited-vulnerabilities-catalog" },
  "Abuse.ch-URLhaus": { label: "Abuse.ch URLhaus", logo: "⚠️", color: "text-orange-400", url: "https://urlhaus.abuse.ch" },
  "Abuse.ch-MalwareBazaar": { label: "MalwareBazaar", logo: "🦠", color: "text-red-400", url: "https://bazaar.abuse.ch" },
};

const SEVERITY_MAP: Record<string, string> = {
  CRITICAL: "text-red-400 border-red-500/30 bg-red-500/10",
  HIGH: "text-orange-400 border-orange-400/30 bg-orange-400/10",
  MEDIUM: "text-amber-400 border-amber-400/30 bg-amber-400/10",
  LOW: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10",
};

// ─── Helper Components ───────────────────────────────────────────────────────

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

function ScoreGauge({ score, label }: { score: number; label: string }) {
  const pct = Math.min(score, 100);
  const hue = Math.round(120 - pct * 1.2);
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

function IocTypeBadge({ type }: { type: string }) {
  const Icon = TYPE_ICONS[type] || Database;
  return (
    <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold text-primary/80 bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20">
      <Icon className="h-2.5 w-2.5" /> {type}
    </span>
  );
}
// ── IOC Detail Modal ──
function IocDetailModal({ ioc, open, onOpenChange }: { ioc: IocIndicator | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  if (!ioc) return null;
  const SMeta = SOURCE_META[ioc.source];
  const vtBase = "https://www.virustotal.com/gui";
  const fallbackUrl = ioc.indicator_type.includes("IPv") ? `${vtBase}/ip-address/${ioc.indicator_value}`
    : ioc.indicator_type === "domain" ? `${vtBase}/domain/${ioc.indicator_value}`
      : ioc.indicator_type.includes("Hash") ? `${vtBase}/file/${ioc.indicator_value}`
        : `https://www.google.com/search?q=${encodeURIComponent(ioc.indicator_value)}`;
  const finalUrl = ioc.external_link || fallbackUrl;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-card border-border shadow-2xl">
        <DialogHeader className="border-b border-border/50 pb-4">
          <div className="flex items-center gap-3">
            <IocTypeBadge type={ioc.indicator_type} />
            <DialogTitle className="font-mono text-lg tracking-tight select-all">{ioc.indicator_value}</DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground mt-1">
            Intelligence fingerprint and threat metadata for verified security analysis.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
          {/* Left Column: Profile & Analytics */}
          <div className="space-y-6">
            <div className="bg-muted/30 rounded-xl p-4 border border-border/50">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
                <Shield className="h-3 w-3 text-primary" /> Threat Profile
              </h4>
              <div className="flex justify-around items-center">
                <ScoreGauge score={ioc.confidence_score} label="Confidence" />
                <div className="flex flex-col items-center gap-2">
                  <Badge variant="outline" className={`text-xs font-bold py-1 px-3 ${SEVERITY_MAP[ioc.severity]}`}>
                    {ioc.severity} SEVERITY
                  </Badge>
                  <span className="text-[9px] text-muted-foreground uppercase font-semibold">Classification</span>
                </div>
              </div>
            </div>

            <div className="bg-muted/30 rounded-xl p-4 border border-border/50">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                <Target className="h-3 w-3 text-primary" /> Contextual Intel
              </h4>
              <div className="space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">Source Provider</span>
                  <div className="flex items-center gap-1.5 font-bold text-foreground">
                    <span>{SMeta?.logo || "🌐"}</span>
                    <span>{SMeta?.label || ioc.source}</span>
                  </div>
                </div>
                <div className="flex justify-between items-start text-xs">
                  <span className="text-muted-foreground">Activity/Pulse</span>
                  <span className="font-mono text-right max-w-[180px] break-words">{ioc.pulse_name || "Uncategorized Activity"}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">Geo Origin</span>
                  <div className="flex items-center gap-1 font-mono">
                    <MapPin className="h-3 w-3 text-muted-foreground" />
                    <span>{ioc.country || "Global/Cloud"}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Timeline & Actions */}
          <div className="space-y-6">
            <div className="bg-muted/30 rounded-xl p-4 border border-border/50">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
                <Calendar className="h-3 w-3 text-primary" /> Intelligence Timeline
              </h4>
              <div className="space-y-4 relative">
                <div className="absolute left-1.5 top-2 bottom-2 w-0.5 bg-border/40" />
                {[
                  { label: "First Identified", date: ioc.first_seen, icon: Clock },
                  { label: "Last Observed", date: ioc.last_seen, icon: Activity },
                  { label: "Ingested Into WAF", date: ioc.ingested_at, icon: Database },
                ].map((item, i) => (
                  <div key={i} className="relative pl-6">
                    <div className="absolute left-0 top-1.5 h-3 w-3 rounded-full bg-card border-2 border-primary" />
                    <p className="text-[10px] text-muted-foreground uppercase font-bold leading-none">{item.label}</p>
                    <p className="text-xs font-mono mt-1 text-foreground">
                      {new Date(item.date).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-2">
                <Fingerprint className="h-3 w-3 text-primary" /> Forensic Lookups
              </h4>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="text-[11px] h-9 gap-2 border-primary/20 hover:bg-primary/5" asChild>
                  <a href={finalUrl} target="_blank" rel="noreferrer">
                    {ioc.external_link ? "Source Portal" : "VirusTotal"} <ExternalLink className="h-3 w-3" />
                  </a>
                </Button>
                <Button variant="outline" className="text-[11px] h-9 gap-2 border-border/50" asChild>
                  <a href={`https://www.google.com/search?q=${encodeURIComponent(ioc.indicator_value)}`} target="_blank" rel="noreferrer">
                    Google Search <Search className="h-3 w-3" />
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function ThreatIntelligencePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const canEdit = ["super_admin", "admin", "tenant_admin", "security_engineer", "security_analyst", "analyst"].includes(user?.role || "");
  const isLocked = user && !user.entitlements.hasThreatIntel;
  const headers = {
    "Content-Type": "application/json"
  };

  // ── IOC State ──
  const [selectedIoc, setSelectedIoc] = useState<IocIndicator | null>(null);
  const [iocSearch, setIocSearch] = useState("");
  const [iocTypeFilter, setIocTypeFilter] = useState("all");
  const [iocSeverityFilter, setIocSeverityFilter] = useState("all");
  const [iocPage, setIocPage] = useState(1);
  const [activeTab, setActiveTab] = useState<"feed" | "engine">("feed");

  // ── Risk Engine State ──
  const [localCfg, setLocalCfg] = useState<RiskThreshold | null>(null);
  const [minScore, setMinScore] = useState(0);

  // ── Queries ──
  const { data: iocSummary, isLoading: summaryLoading, refetch: refetchSummary } = useQuery<IocSummary>({
    queryKey: ["ioc-summary"],
    queryFn: () => fetch("/api/threat-feed/summary", { headers }).then(r => r.json()),
    refetchInterval: 60000,
  });

  const iocParams = new URLSearchParams({
    page: String(iocPage),
    pageSize: "25",
    ...(iocSearch && { search: iocSearch }),
    ...(iocTypeFilter !== "all" && { type: iocTypeFilter }),
    ...(iocSeverityFilter !== "all" && { severity: iocSeverityFilter }),
  });

  const { data: iocData, isLoading: iocLoading } = useQuery<IocPage>({
    queryKey: ["ioc-indicators", iocPage, iocSearch, iocTypeFilter, iocSeverityFilter],
    queryFn: () => fetch(`/api/threat-feed/indicators?${iocParams}`, { headers }).then(r => r.json()),
    keepPreviousData: true,
  } as any);

  const { data: thresholds } = useQuery<RiskThreshold>({
    queryKey: ["risk-thresholds"],
    queryFn: () => fetch("/api/risk/thresholds", { headers }).then(r => r.json()),
    onSuccess: (d) => { if (!localCfg) setLocalCfg(d); },
  } as any);

  const { data: stats } = useQuery<RiskStats>({
    queryKey: ["risk-stats"],
    queryFn: () => fetch("/api/risk/stats", { headers }).then(r => r.json()),
    refetchInterval: 20000,
  });

  const { data: events = [], isLoading: eventsLoading, refetch: refetchEvents } = useQuery<RiskEvent[]>({
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
              <Eye className="h-5 w-5 text-primary" /> Threat Intelligence
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Multi-source IOC feeds (AlienVault OTX, CISA KEV, URLhaus, MalwareBazaar) + predictive behavioral risk scoring
            </p>
          </div>
          {iocSummary?.lastSyncedAt && (
            <div className="hidden sm:flex items-center gap-2 text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-full font-mono font-bold">
              <Wifi className="h-3 w-3 animate-pulse" />
              LIVE FEED · {new Date(iocSummary.lastSyncedAt).toLocaleTimeString()}
            </div>
          )}
        </div>

        {/* Tab Switcher */}
        <div className="flex gap-1 bg-muted/30 p-1 rounded-lg w-fit border border-border">
          {[
            { key: "feed", label: "Global IOC Feed", icon: Globe },
            { key: "engine", label: "Risk Engine", icon: Gauge },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold transition-all ${activeTab === tab.key
                ? "bg-primary text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground"}`
              }
            >
              <tab.icon className="h-3.5 w-3.5" /> {tab.label}
            </button>
          ))}
        </div>

        {/* ═══ TAB: GLOBAL IOC FEED ═══ */}
        {activeTab === "feed" && (
          <div className="space-y-6">
            {/* IOC Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                {
                  label: "Total Indicators",
                  value: summaryLoading ? "—" : (iocSummary?.totalIndicators ?? 0).toLocaleString(),
                  icon: Database,
                  sub: "Across all active feeds",
                  color: "text-primary",
                },
                {
                  label: "Critical Threats",
                  value: summaryLoading ? "—" : (iocSummary?.criticalCount ?? 0).toLocaleString(),
                  icon: Zap,
                  sub: "Highest severity IOCs",
                  color: "text-red-400",
                },
                {
                  label: "High Severity",
                  value: summaryLoading ? "—" : (iocSummary?.highCount ?? 0).toLocaleString(),
                  icon: AlertTriangle,
                  sub: "Elevated risk IPs & domains",
                  color: "text-orange-400",
                },
                {
                  label: "Threat Categories",
                  value: summaryLoading ? "—" : (iocSummary?.byThreat?.length ?? 0),
                  icon: Shield,
                  sub: "Distinct threat types tracked",
                  color: "text-emerald-400",
                },
              ].map(s => (
                <TooltipProvider key={s.label}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="stat-card cursor-help">
                        <div className="flex items-center gap-3 mb-3">
                          <div className={`p-2 rounded-lg bg-muted ${s.color}`}><s.icon className="h-4 w-4" /></div>
                          <span className="text-sm text-muted-foreground">{s.label}</span>
                        </div>
                        <p className={`text-2xl font-bold font-mono ${s.color}`}>{s.value}</p>
                        <p className="text-xs text-muted-foreground mt-1">{s.sub}</p>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-[200px] text-xs">
                      {s.label === "Total Indicators" && "Sum of all active IPs, domains, and hashes tracked across all active threat feeds."}
                      {s.label === "Critical Threats" && "High-confidence indicators associated with active exploits (CVEs) or verified ransomware infrastructure."}
                      {s.label === "High Severity" && "Recent indicators with a high probability of malicious activity."}
                      {s.label === "Threat Categories" && "Total number of distinct attack vectors (e.g. Botnet, Phishing, Ransomware) identified."}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ))}
            </div>

            {/* Intelligence Sources Grid */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" /> Intelligence Sources
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                {Object.entries(SOURCE_META).map(([key, meta]) => {
                  const sourceData = iocSummary?.bySource?.find(s => s.source === key);
                  const lastCount = iocSummary?.lastSyncCounts?.[key];
                  const isActive = sourceData || lastCount !== undefined;

                  return (
                    <div key={key} className="bg-card border border-border rounded-xl p-4 relative overflow-hidden group hover:border-primary/30 transition-all">
                      <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                        <span className="text-4xl">{meta.logo}</span>
                      </div>

                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xl">{meta.logo}</span>
                        <div>
                          <h4 className="text-sm font-bold leading-tight">{meta.label}</h4>
                          <a href={meta.url} target="_blank" rel="noreferrer" className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-0.5">
                            Provider Portal <ExternalLink className="h-2 w-2" />
                          </a>
                        </div>
                      </div>

                      <div className="flex justify-between items-end">
                        <div>
                          <p className="text-2xl font-bold font-mono tracking-tight">{(sourceData?.count ?? 0).toLocaleString()}</p>
                          <div className="flex items-center gap-2">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Indicators</p>
                            {sourceData && iocSummary?.totalIndicators > 0 && (
                              <span className="text-[10px] font-bold text-primary bg-primary/10 px-1 rounded">
                                {Math.round((sourceData.count / iocSummary.totalIndicators) * 100)}%
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          {lastCount !== undefined && lastCount > 0 && (
                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px] py-0 h-4">
                              +{lastCount} New
                            </Badge>
                          )}
                          <div className={`flex items-center gap-1.5 mt-1 ${isActive ? "text-emerald-400" : "text-muted-foreground/50"}`}>
                            <div className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-emerald-400 animate-pulse" : "bg-muted-foreground/30"}`} />
                            <span className="text-[10px] font-medium">{isActive ? "Synchronized" : "Awaiting Key"}</span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 pt-3 border-t border-border/50 flex flex-wrap gap-1">
                        {(sourceData?.types ?? ["IPv4", "domain"]).slice(0, 3).map(t => (
                          <span key={t} className="px-1.5 py-0.5 rounded-md bg-muted/50 text-muted-foreground text-[9px] font-mono border border-border/50">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Type + Threat Breakdown */}
            {iocSummary && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-card border border-border rounded-xl p-5">
                  <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                    <Database className="h-4 w-4 text-primary" /> Indicators by Type
                  </h3>
                  <div className="space-y-2">
                    {(iocSummary.byType ?? []).map(t => {
                      const pct = Math.round((t.count / iocSummary.totalIndicators) * 100);
                      const Icon = TYPE_ICONS[t.type] || Database;
                      return (
                        <div key={t.type} className="flex items-center gap-3">
                          <Icon className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span className="text-xs font-mono flex-1">{t.type}</span>
                          <div className="flex-1 bg-muted/30 rounded-full h-1.5 overflow-hidden">
                            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <Badge variant="outline" className="font-mono text-[10px] ml-1">{t.count}</Badge>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-card border border-border rounded-xl p-5">
                  <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-warning" /> Top Threat Categories
                  </h3>
                  <div className="space-y-2">
                    {(iocSummary.byThreat ?? []).slice(0, 8).map((t, i) => (
                      <div key={t.threat} className="flex items-center gap-3">
                        <span className="text-[10px] font-mono text-muted-foreground w-4">{i + 1}</span>
                        <span className="text-xs font-mono flex-1 capitalize">{t.threat}</span>
                        <Badge variant="outline" className="font-mono text-[10px]">{t.count}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* IOC Indicator Table */}
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Eye className="h-4 w-4 text-primary" /> IOC Indicator Database
                  {iocData && <Badge variant="outline" className="font-mono text-[10px]">{iocData.total.toLocaleString()} total</Badge>}
                </h3>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => refetchSummary()}>
                  <RefreshCw className="h-3 w-3 mr-1" /> Refresh
                </Button>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap gap-2 mb-4">
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search indicators..."
                    value={iocSearch}
                    onChange={e => { setIocSearch(e.target.value); setIocPage(1); }}
                    className="h-8 pl-8 text-xs bg-muted/30"
                  />
                </div>
                <Select value={iocTypeFilter} onValueChange={v => { setIocTypeFilter(v); setIocPage(1); }}>
                  <SelectTrigger className="h-8 text-xs w-[120px] bg-muted/30"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">All Types</SelectItem>
                    <SelectItem value="IPv4" className="text-xs">IPv4</SelectItem>
                    <SelectItem value="domain" className="text-xs">Domain</SelectItem>
                    <SelectItem value="URL" className="text-xs">URL</SelectItem>
                    <SelectItem value="FileHash-MD5" className="text-xs">Hash (MD5)</SelectItem>
                    <SelectItem value="FileHash-SHA1" className="text-xs">Hash (SHA1)</SelectItem>
                    <SelectItem value="FileHash-SHA256" className="text-xs">Hash (SHA256)</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={iocSeverityFilter} onValueChange={v => { setIocSeverityFilter(v); setIocPage(1); }}>
                  <SelectTrigger className="h-8 text-xs w-[120px] bg-muted/30"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">All Severity</SelectItem>
                    <SelectItem value="CRITICAL" className="text-xs text-red-400">Critical</SelectItem>
                    <SelectItem value="HIGH" className="text-xs text-orange-400">High</SelectItem>
                    <SelectItem value="MEDIUM" className="text-xs text-amber-400">Medium</SelectItem>
                    <SelectItem value="LOW" className="text-xs text-emerald-400">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Table Header */}
              <div className="grid grid-cols-[1.5fr_1fr_100px_1fr_140px_100px_80px] gap-2 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border mb-1">
                <span>Indicator</span>
                <span>Context / Activity</span>
                <span className="text-center">Type</span>
                <span className="text-center">Severity</span>
                <span className="text-center">Intel Source</span>
                <span className="text-center">Confidence</span>
                <span className="text-right">Portal</span>
              </div>

              {iocLoading ? (
                <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
              ) : (iocData?.items ?? []).length === 0 ? (
                <div className="py-10 text-center text-muted-foreground text-sm border border-dashed border-border rounded-xl mt-2">
                  No IOC indicators found.
                </div>
              ) : (
                <div className="space-y-0.5">
                  {(iocData?.items ?? []).map(ioc => {
                    const SMeta = SOURCE_META[ioc.source];
                    return (
                      <div
                        key={ioc.id}
                        onClick={() => setSelectedIoc(ioc)}
                        className="grid grid-cols-[1.5fr_1fr_100px_1fr_140px_100px_80px] gap-2 items-center px-3 py-2 rounded-lg hover:bg-muted/30 transition-colors group cursor-pointer"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <IocTypeBadge type={ioc.indicator_type} />
                          {(() => {
                            const vtBase = "https://www.virustotal.com/gui";
                            const fallbackUrl = ioc.indicator_type.includes("IPv") ? `${vtBase}/ip-address/${ioc.indicator_value}`
                              : ioc.indicator_type === "domain" ? `${vtBase}/domain/${ioc.indicator_value}`
                                : ioc.indicator_type.includes("Hash") ? `${vtBase}/file/${ioc.indicator_value}`
                                  : `https://www.google.com/search?q=${encodeURIComponent(ioc.indicator_value)}`;
                            const finalUrl = ioc.external_link || fallbackUrl;

                            return (
                              <a
                                href={finalUrl} target="_blank" rel="noreferrer"
                                className="font-mono text-[11px] text-foreground truncate hover:text-primary hover:underline decoration-primary/30 underline-offset-4 transition-all"
                                title={`Investigate on ${ioc.external_link ? SMeta?.label : "external portal"}`}
                              >
                                {ioc.indicator_value}
                              </a>
                            );
                          })()}
                        </div>
                        <span className="text-[10px] text-muted-foreground line-clamp-1">
                          {ioc.pulse_name || "—"}
                        </span>
                        <div className="flex justify-center">
                          <Badge variant="outline" className="text-[9px] font-mono h-5 py-0 px-1.5">{ioc.indicator_type}</Badge>
                        </div>
                        <div className="flex justify-center">
                          <Badge variant="outline" className={`text-[9px] font-bold h-5 py-0 px-1.5 ${SEVERITY_MAP[ioc.severity] ?? "text-muted-foreground"}`}>
                            {ioc.severity}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-center gap-1.5 bg-muted/20 rounded py-0.5 px-2">
                          <span className="text-sm">{SMeta?.logo || "🌐"}</span>
                          <span className="text-[10px] font-bold text-muted-foreground truncate">{SMeta?.label || ioc.source}</span>
                        </div>
                        <div className="flex items-center justify-center gap-1">
                          <div className="w-12 h-1 bg-muted/40 rounded-full overflow-hidden hidden sm:block">
                            <div
                              className={`h-full rounded-full ${ioc.confidence_score >= 80 ? "bg-emerald-500" : ioc.confidence_score >= 50 ? "bg-amber-500" : "bg-red-500"}`}
                              style={{ width: `${ioc.confidence_score}%` }}
                            />
                          </div>
                          <span className="text-[9px] font-mono text-muted-foreground">{ioc.confidence_score}%</span>
                        </div>
                        <div className="flex justify-end">
                          {(() => {
                            const vtBase = "https://www.virustotal.com/gui";
                            const fallbackUrl = ioc.indicator_type.includes("IPv") ? `${vtBase}/ip-address/${ioc.indicator_value}`
                              : ioc.indicator_type === "domain" ? `${vtBase}/domain/${ioc.indicator_value}`
                                : ioc.indicator_type.includes("Hash") ? `${vtBase}/file/${ioc.indicator_value}`
                                  : `https://www.google.com/search?q=${encodeURIComponent(ioc.indicator_value)}`;
                            const finalUrl = ioc.external_link || fallbackUrl;

                            return (
                              <Button size="sm" variant="outline" className="h-6 px-2 text-[9px] gap-1 hover:bg-primary/10 hover:text-primary border-primary/20" asChild>
                                <a href={finalUrl} target="_blank" rel="noreferrer">
                                  {ioc.external_link ? "View" : "Lookup"} <ExternalLink className="h-2.5 w-2.5" />
                                </a>
                              </Button>
                            );
                          })()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Pagination */}
              {iocData && iocData.totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t border-border mt-2">
                  <span className="text-[10px] text-muted-foreground font-mono">
                    Page {iocData.page} of {iocData.totalPages} · {iocData.total.toLocaleString()} total
                  </span>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setIocPage(p => Math.max(1, p - 1))} disabled={iocPage === 1}>
                      <ChevronLeft className="h-3 w-3" />
                    </Button>
                    <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setIocPage(p => Math.min(iocData.totalPages, p + 1))} disabled={iocPage === iocData.totalPages}>
                      <ChevronRight className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ TAB: RISK ENGINE ═══ */}
        {activeTab === "engine" && (
          <div className="space-y-6">
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

            {/* Score Distribution */}
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
                    <ChartTooltip contentStyle={chartTooltipStyle} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {buckets.map((_, i) => <Cell key={i} fill={BUCKET_COLORS[i]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
                      <span className="text-sky-400 font-medium">0–{cfg.logThreshold - 1}</span><br />Pass silently
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
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => refetchEvents()}>
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
                          <span className="text-[9px] text-muted-foreground/60 truncate hidden lg:block">{ev.matched_pattern}</span>
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
        )}
        <IocDetailModal
          ioc={selectedIoc}
          open={!!selectedIoc}
          onOpenChange={(open) => !open && setSelectedIoc(null)}
        />
      </div>
      {isLocked && (
        <UpgradeOverlay
          title="Threat Intelligence"
          description="Monitor global IOC feeds (AlienVault OTX), identify and block known-bad IPs, domains, and file hashes with real-time threat intelligence."
          feature="Threat Intelligence"
        />
      )}
    </DashboardLayout>
  );
}

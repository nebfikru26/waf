import { useState } from "react";
import {
  UserX, Shield, Lock, Eye, AlertTriangle, Fingerprint,
  Clock, Trash2, RefreshCw, Loader2, CheckCircle2,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UpgradeOverlay } from "@/components/UpgradeOverlay";

interface ATOConfig {
  id?: string;
  enabled: boolean;
  maxFailedAttempts: number;
  windowSeconds: number;
  lockoutSeconds: number;
  action: "challenge" | "block" | "log";
  trackByFingerprint: boolean;
  authEndpoints: string;
}

interface ATOEvent {
  id: string;
  ip: string;
  fingerprint: string;
  targetPath: string;
  failures: number;
  action: string;
  timestamp: string;
}

interface ATOStats {
  totalEvents: number;
  blockedEvents: number;
  challengedEvents: number;
  uniqueIPs: number;
}

interface LockEntry {
  fingerprint: string;
  ttlSeconds: number;
}

const actionColors: Record<string, string> = {
  blocked: "text-red-400 border-red-400/30 bg-red-400/8",
  block: "text-red-400 border-red-400/30 bg-red-400/8",
  challenged: "text-amber-400 border-amber-400/30 bg-amber-400/8",
  challenge: "text-amber-400 border-amber-400/30 bg-amber-400/8",
  logged: "text-sky-400 border-sky-400/30 bg-sky-400/8",
  log: "text-sky-400 border-sky-400/30 bg-sky-400/8",
};

function formatDuration(secs: number): string {
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  return `${Math.floor(secs / 3600)}h`;
}

export default function AccountTakeoverPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isPlatformAdmin = user?.role === "super_admin" || user?.role === "admin" || user?.role === "support_engineer";
  const canEdit = isPlatformAdmin || user?.role === "tenant_admin" || user?.role === "analyst";
  const isLocked = user && !isPlatformAdmin && !user.entitlements?.hasAccountTakeover;
  const headers = {
    "Content-Type": "application/json"
  };

  // ── Config state ───────────────────────────────────────────────────────────
  const [localConfig, setLocalConfig] = useState<ATOConfig | null>(null);

  const { data: config, isLoading: configLoading } = useQuery<ATOConfig>({
    queryKey: ["ato-config"],
    queryFn: () => fetch("/api/ato/config", { headers }).then(r => r.json()),
    onSuccess: (data) => { if (!localConfig) setLocalConfig(data); },
  } as any);

  const { data: stats } = useQuery<ATOStats>({
    queryKey: ["ato-stats"],
    queryFn: () => fetch("/api/ato/stats", { headers }).then(r => r.json()),
    refetchInterval: 15000,
  });

  const { data: events = [], isLoading: eventsLoading, refetch: refetchEvents } = useQuery<ATOEvent[]>({
    queryKey: ["ato-events"],
    queryFn: () => fetch("/api/ato/events", { headers }).then(r => r.json()),
    refetchInterval: 20000,
  });

  const { data: locksData, refetch: refetchLocks } = useQuery<{ active_locks: LockEntry[]; count: number }>({
    queryKey: ["ato-locks"],
    queryFn: () => fetch("/api/ato/locks", { headers }).then(r => r.json()),
    refetchInterval: 10000,
  });

  const saveMutation = useMutation({
    mutationFn: (cfg: ATOConfig) =>
      fetch("/api/ato/config", { method: "PUT", headers, body: JSON.stringify(cfg) }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ato-config"] });
      toast({ title: "ATO settings saved" });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const clearLockMutation = useMutation({
    mutationFn: (fp: string) => fetch(`/api/ato/locks/${fp}`, { method: "DELETE" }),
    onSuccess: () => { refetchLocks(); toast({ title: "Lock cleared" }); },
  });

  const cfg = localConfig ?? config;
  const sc = (field: keyof ATOConfig, value: any) =>
    setLocalConfig(prev => prev ? { ...prev, [field]: value } : null);

  const activeLocks = locksData?.active_locks ?? [];
  const safeEvents = Array.isArray(events) ? events : [];

  return (
    <DashboardLayout>
      <div className={`space-y-6 relative transition-all duration-500 ${isLocked ? 'blur-sm pointer-events-none select-none opacity-40' : ''}`}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <UserX className="h-5 w-5 text-primary" /> Account Takeover Prevention
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Session-based credential stuffing defense using device fingerprinting and failure tracking
            </p>
          </div>
          <Badge variant="outline" className={`font-mono text-xs ${cfg?.enabled ? "border-emerald-500/40 text-emerald-400" : "border-muted-foreground/40 text-muted-foreground"}`}>
            {cfg?.enabled ? "ACTIVE" : "DISABLED"}
          </Badge>
        </div>

        {/* Live Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total Incidents", value: stats?.totalEvents ?? "–", subtext: "All time", icon: AlertTriangle, color: "text-primary" },
            { label: "Blocked", value: stats?.blockedEvents ?? "–", subtext: "Hard-blocked attacks", icon: Shield, color: "text-red-400" },
            { label: "Challenged", value: stats?.challengedEvents ?? "–", subtext: "CAPTCHA served", icon: UserX, color: "text-amber-400" },
            { label: "Active Locks", value: activeLocks.length, subtext: "Fingerprints locked now", icon: Lock, color: "text-primary" },
          ].map((s) => (
            <div key={s.label} className="stat-card">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-muted">
                  <s.icon className={`h-4 w-4 ${s.color}`} />
                </div>
                <span className="text-sm text-muted-foreground">{s.label}</span>
              </div>
              <p className="text-2xl font-bold font-mono">{s.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.subtext}</p>
            </div>
          ))}
        </div>

        {/* How it works banner */}
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex gap-3">
          <Fingerprint className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-primary mb-1">How Device Fingerprint ATO Prevention Works</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Unlike IP-rate limiting (defeated by botnets), AffiniSecurity WAF derives a <strong className="text-foreground/70">stable device fingerprint</strong> from
              the client's IP subnet, User-Agent, and Accept-Language headers. Consecutive auth failures from the same fingerprint are tracked in Redis.
              When the <span className="font-mono text-primary">max failed attempts</span> threshold is reached within the <span className="font-mono text-primary">rolling window</span>,
              the fingerprint is locked and subsequent requests are <strong className="text-foreground/70">challenged or blocked</strong> for the lockout duration.
              A successful login automatically resets the counter.
            </p>
          </div>
        </div>

        {/* Config Panel */}
        {configLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : cfg && (
          <div className="bg-card border border-border rounded-xl p-5 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" /> ATO Prevention Settings
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Enabled</span>
                <Switch checked={cfg.enabled} onCheckedChange={v => sc("enabled", v)} disabled={!canEdit} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Max Failed Attempts</Label>
                <Input
                  type="number" min={1} max={50}
                  value={cfg.maxFailedAttempts}
                  onChange={e => sc("maxFailedAttempts", parseInt(e.target.value) || 5)}
                  className="font-mono bg-muted/50" disabled={!canEdit}
                />
                <p className="text-[10px] text-muted-foreground">Failures before action</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Rolling Window</Label>
                <Input
                  type="number" min={60} step={60}
                  value={cfg.windowSeconds}
                  onChange={e => sc("windowSeconds", parseInt(e.target.value) || 900)}
                  className="font-mono bg-muted/50" disabled={!canEdit}
                />
                <p className="text-[10px] text-muted-foreground">Seconds (900 = 15 min)</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Lockout Duration</Label>
                <Input
                  type="number" min={60} step={60}
                  value={cfg.lockoutSeconds}
                  onChange={e => sc("lockoutSeconds", parseInt(e.target.value) || 1800)}
                  className="font-mono bg-muted/50" disabled={!canEdit}
                />
                <p className="text-[10px] text-muted-foreground">Seconds (1800 = 30 min)</p>
              </div>
            </div>

            {/* Action */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Action On Threshold Breach</Label>
              <div className="grid grid-cols-3 gap-2">
                {(["challenge", "block", "log"] as const).map((a) => (
                  <button
                    key={a}
                    disabled={!canEdit}
                    onClick={() => sc("action", a)}
                    className={`py-2.5 rounded-lg border text-xs font-mono font-bold transition-all ${
                      cfg.action === a
                        ? actionColors[a]
                        : "border-border text-muted-foreground hover:border-muted-foreground bg-muted/10"
                    }`}
                  >
                    {a === "challenge" ? "🟡 CHALLENGE" : a === "block" ? "🔴 BLOCK" : "🔵 LOG-ONLY"}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">
                CHALLENGE serves a CAPTCHA. BLOCK immediately rejects with 429. LOG-ONLY records the event without interrupting traffic.
              </p>
            </div>

            {/* Auth Endpoints */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Watched Auth Endpoints (comma-separated path prefixes)</Label>
              <Input
                value={cfg.authEndpoints}
                onChange={e => sc("authEndpoints", e.target.value)}
                className="font-mono bg-muted/50 text-xs" disabled={!canEdit}
                placeholder="/login,/auth,/signin,/token,/password"
              />
            </div>

            {/* Fingerprinting toggle */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
              <div>
                <p className="text-sm font-medium flex items-center gap-2">
                  <Fingerprint className="h-3.5 w-3.5 text-primary" /> Device Fingerprint Tracking
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Uses IP subnet + User-Agent + Accept-Language to create a stable device ID. Significantly harder to evade than IP-only tracking.
                </p>
              </div>
              <Switch checked={cfg.trackByFingerprint} onCheckedChange={v => sc("trackByFingerprint", v)} disabled={!canEdit} />
            </div>

            {canEdit && (
              <div className="flex justify-end pt-2 border-t border-border">
                <Button
                  size="sm" className="text-xs font-mono"
                  disabled={saveMutation.isPending}
                  onClick={() => cfg && saveMutation.mutate(cfg)}
                >
                  {saveMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                  SAVE SETTINGS
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Active Locks */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Lock className="h-4 w-4 text-primary" /> Active Fingerprint Locks
              {activeLocks.length > 0 && (
                <Badge className="text-[9px] font-mono bg-red-500/15 text-red-400 border-red-500/30 border ml-1">{activeLocks.length}</Badge>
              )}
            </h3>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => refetchLocks()}>
              <RefreshCw className="h-3 w-3 mr-1" /> Refresh
            </Button>
          </div>
          {activeLocks.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">No fingerprints currently locked. The system is clean.</p>
          ) : (
            <div className="space-y-1.5">
              {activeLocks.map((lock) => (
                <div key={lock.fingerprint} className="flex items-center justify-between py-2 px-3 rounded-lg bg-red-500/5 border border-red-500/20">
                  <div className="flex items-center gap-3">
                    <Fingerprint className="h-3.5 w-3.5 text-red-400" />
                    <span className="font-mono text-xs text-red-300">{lock.fingerprint}</span>
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" /> expires in {formatDuration(lock.ttlSeconds)}
                    </span>
                  </div>
                  {canEdit && (
                    <Button
                      size="sm" variant="ghost" className="h-6 text-[10px] font-mono text-muted-foreground hover:text-destructive"
                      onClick={() => clearLockMutation.mutate(lock.fingerprint)}
                      disabled={clearLockMutation.isPending}
                    >
                      <Trash2 className="h-3 w-3 mr-1" /> Release
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent ATO Events */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" /> ATO Incident Log
            </h3>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => refetchEvents()}>
              <RefreshCw className="h-3 w-3 mr-1" /> Refresh
            </Button>
          </div>
          {eventsLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : safeEvents.length === 0 ? (
            <div className="py-6 text-center text-muted-foreground text-sm border border-dashed border-border rounded-xl">
              No ATO events recorded yet. Incidents will appear here as they're detected.
            </div>
          ) : (
            <div className="space-y-1.5">
              {safeEvents.map((ev) => (
                <div key={ev.id} className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-muted/20 hover:bg-muted/40 transition-colors text-xs">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono text-muted-foreground shrink-0">{new Date(ev.timestamp).toLocaleTimeString()}</span>
                    <span className="font-mono shrink-0">{ev.ip}</span>
                    <span className="font-mono text-primary truncate">{ev.targetPath}</span>
                    <span className="font-mono text-muted-foreground/60 text-[10px] shrink-0">fp:{ev.fingerprint}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-muted-foreground">{ev.failures} failures</span>
                    <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border ${actionColors[ev.action] || actionColors.log}`}>
                      {ev.action.toUpperCase()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Hidden Eye Section */}
        <div className="bg-card border border-border rounded-xl p-5 opacity-60">
          <div className="flex items-center gap-2 mb-3">
            <Eye className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-muted-foreground">Breach Intelligence Feed</h3>
            <Badge variant="outline" className="text-[9px] font-mono border-amber-500/40 text-amber-400">ENTERPRISE</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Real-time leaked credential matching against HaveIBeenPwned, DeHashed and custom intel feeds.
            Available on Enterprise plan.
          </p>
        </div>
      </div>
      {isLocked && (
        <UpgradeOverlay 
          title="Account Takeover Defense" 
          description="Stop credential stuffing and automated account takeovers with advanced device fingerprinting and behavioral signal tracking. This feature requires the Enterprise plan."
          feature="ATO Protection"
        />
      )}
    </DashboardLayout>
  );
}

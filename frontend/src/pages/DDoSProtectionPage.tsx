import { useState, useEffect } from "react";
import { Zap, Shield, Activity, Globe, AlertTriangle, Settings2, Lock } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { UpgradeOverlay } from "@/components/UpgradeOverlay";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";

const chartTooltipStyle = {
  backgroundColor: "hsl(0, 0%, 100%)",
  border: "1px solid hsl(220, 14%, 88%)",
  borderRadius: "8px",
  fontSize: "12px",
  fontFamily: "'JetBrains Mono', monospace",
};

export default function DDoSProtectionPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isPlatformAdmin = user?.role === "super_admin" || user?.role === "admin" || user?.role === "support_engineer";
  const canEdit = (isPlatformAdmin || user?.role === "analyst") && (isPlatformAdmin || user?.entitlements?.hasDdosProtection);
  const isLocked = user && !isPlatformAdmin && !user.entitlements?.hasDdosProtection;

  const headers = {
    "Content-Type": "application/json"
  };

  const { data: settings, isLoading } = useQuery<any>({
    queryKey: ["security-settings", user?.tenantId],
    queryFn: () => fetch("/api/modules/security-settings", { headers }).then(r => r.json())
  });

  const updateSettingsMutation = useMutation({
    mutationFn: (newSettings: any) =>
      fetch("/api/modules/security-settings", {
        method: "PUT",
        headers,
        body: JSON.stringify({ ...settings, ...newSettings }),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["security-settings"] });
      toast({ title: "DDoS settings updated" });
    }
  });

  const { data: ddosData, isLoading: isLoadingAnalytics } = useQuery<any>({
    queryKey: ["ddos-analytics", user?.tenantId],
    queryFn: () => fetch("/api/analytics/ddos", { headers }).then(r => r.json())
  });

  const [sensitivityLevel, setSensitivityLevel] = useState("medium");
  const [thresholdRps, setThresholdRps] = useState("10000");

  useEffect(() => {
    if (settings) {
      setSensitivityLevel(settings.sensitivityLevel || "medium");
      setThresholdRps(settings.ddosThresholdRps?.toString() || "10000");
    }
  }, [settings]);

  const toggleSetting = (key: string, val: boolean) => {
    if (!canEdit) return;
    updateSettingsMutation.mutate({ [key]: val });
  };

  const iconColors: Record<string, string> = {
    default: "text-primary",
    success: "text-success",
    destructive: "text-destructive",
    warning: "text-warning",
  };

  const safeVectors = ddosData?.vectors || [];
  const safeTimeline = ddosData?.timeline || [];
  const safeAttacks = ddosData?.recentAttacks || [];

  return (
    <DashboardLayout>
      <div className={`space-y-6 relative transition-all duration-500 ${isLocked ? 'blur-sm pointer-events-none select-none opacity-40' : ''}`}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">DDoS Protection</h1>
            <p className="text-sm text-muted-foreground">Multi-layer DDoS mitigation: L3/L4 network + L7 application layer</p>
          </div>
          <Badge className={`font-mono text-xs ${safeAttacks.length > 0 ? "bg-warning/10 text-warning border-warning/30" : "bg-success/10 text-success border-success/30"}`}>
            {safeAttacks.length > 0 ? "UNDER INVESTIGATION" : "ALL SYSTEMS OPERATIONAL"}
          </Badge>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="stat-card">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-muted text-success"><Shield className="h-4 w-4" /></div>
              <span className="text-sm text-muted-foreground">Mitigated Today</span>
            </div>
            <p className="text-2xl font-bold font-mono">{ddosData?.mitigated || "0"}</p>
            <p className="text-xs text-muted-foreground mt-1">DDoS attacks stopped</p>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-muted text-warning"><Activity className="h-4 w-4" /></div>
              <span className="text-sm text-muted-foreground">Peak Traffic</span>
            </div>
            <p className="text-2xl font-bold font-mono">{ddosData?.peakTraffic || "0.0 Gbps"}</p>
            <p className="text-xs text-muted-foreground mt-1">Max observed bandwidth</p>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-muted text-primary"><Zap className="h-4 w-4" /></div>
              <span className="text-sm text-muted-foreground">Avg Latency</span>
            </div>
            <p className="text-2xl font-bold font-mono">{ddosData?.avgLatency || "N/A"}</p>
            <p className="text-xs text-muted-foreground mt-1">Edge response time</p>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-muted text-destructive"><Globe className="h-4 w-4" /></div>
              <span className="text-sm text-muted-foreground">Active Origins</span>
            </div>
            <p className="text-2xl font-bold font-mono">{ddosData?.activeOrigins || "0"}</p>
            <p className="text-xs text-muted-foreground mt-1">Attack source IPs</p>
          </div>
        </div>

        {/* Traffic Timeline */}
        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-sm font-medium mb-4">Traffic Volume (Last 24h)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={safeTimeline}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 88%)" />
              <XAxis dataKey="time" tick={{ fontSize: 11, fill: "hsl(220, 10%, 46%)" }} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(220, 10%, 46%)" }} />
              <Tooltip contentStyle={chartTooltipStyle} />
              <Area type="monotone" dataKey="legitimate" stroke="hsl(210, 78%, 46%)" fill="hsl(210, 78%, 46%)" fillOpacity={0.15} strokeWidth={2} name="Legitimate" />
              <Area type="monotone" dataKey="attack" stroke="hsl(0, 68%, 55%)" fill="hsl(0, 68%, 55%)" fillOpacity={0.15} strokeWidth={2} name="Attack Traffic" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Protection Settings */}
        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-primary" />
            Protection Layers
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { label: "L3/L4 Protection", desc: "Network-layer volumetric attack mitigation", state: settings?.ddosProtectionEnabled, key: "ddosProtectionEnabled" },
              { label: "L7 Application Protection", desc: "HTTP flood and app-layer attack defense", state: settings?.l7ProtectionEnabled, key: "l7ProtectionEnabled" },
              { label: "Rate-Based Rules", desc: "Auto-block IPs exceeding request thresholds", state: true, key: "" },
              { label: "Challenge on Surge", desc: "Issue JS challenges during traffic spikes", state: true, key: "" },
              { label: "Auto-Scaling Mitigation", desc: "Dynamically scale scrubbing capacity", state: true, key: "" },
              { label: "Geo-Based Blocking", desc: "Block traffic from high-risk regions during attack", state: false, key: "" },
            ].map((ctrl) => (
              <div key={ctrl.label} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                <div>
                  <p className="text-sm font-medium">{ctrl.label}</p>
                  <p className="text-xs text-muted-foreground">{ctrl.desc}</p>
                </div>
                <Switch checked={ctrl.state} onCheckedChange={(val) => ctrl.key && toggleSetting(ctrl.key, val)} disabled={!canEdit || !ctrl.key} />
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Sensitivity</span>
              <Select value={sensitivityLevel} onValueChange={setSensitivityLevel} disabled={!canEdit}>
                <SelectTrigger className="w-28 text-xs font-mono"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Threshold (req/s)</span>
              <Input type="number" value={thresholdRps} onChange={e => setThresholdRps(e.target.value)} className="w-28 font-mono text-xs" disabled={!canEdit} />
            </div>
            {canEdit && (
              <Button size="sm" className="font-mono text-xs" onClick={() => updateSettingsMutation.mutate({ ddosThresholdRps: parseInt(thresholdRps, 10) || 10000, sensitivityLevel })}>SAVE</Button>
            )}
          </div>
        </div>

        {/* Attack Vectors */}
        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-sm font-medium mb-4">Attack Vectors Mitigated</h3>
          <div className="space-y-2">
            {safeVectors.length === 0 && <p className="text-xs text-muted-foreground py-4 text-center">No DDoS vectors detected in the current period.</p>}
            {safeVectors.map((v: any) => (
              <div key={v.type} className="flex items-center gap-3">
                <span className="text-xs w-36 truncate">{v.type}</span>
                <div className="flex-1 h-5 bg-muted/40 rounded-full overflow-hidden relative">
                  <div className="absolute inset-0 bg-destructive/20 rounded-full" style={{ width: `100%` }} />
                  <div className="absolute inset-0 bg-success/40 rounded-full" style={{ width: `${(v.mitigated / (v.count || 1)) * 100}%` }} />
                </div>
                <span className="text-xs font-mono text-muted-foreground w-16 text-right">{v.count.toLocaleString()}</span>
                <Badge variant="default" className="text-[10px] bg-success/10 text-success border-success/30">
                  {((v.mitigated / (v.count || 1)) * 100).toFixed(1)}%
                </Badge>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Attacks */}
        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            Recent Attack Events
          </h3>
          <div className="space-y-2">
            {safeAttacks.length === 0 && <p className="text-xs text-muted-foreground py-4 text-center">No recent DDoS events recorded.</p>}
            {safeAttacks.map((atk: any, i: number) => (
              <div key={i} className="p-3 rounded-lg bg-muted/20 border border-border/50">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <Badge variant="destructive" className="text-[10px]">{atk.vector}</Badge>
                    <span className="text-xs font-mono text-muted-foreground">{atk.time} — {atk.duration}</span>
                  </div>
                  <Badge className="text-[10px] bg-success/10 text-success border-success/30">{atk.status}</Badge>
                </div>
                <div className="flex items-center gap-6 text-xs text-muted-foreground">
                  <span>Peak: <strong className="text-foreground font-mono">{atk.peakBps}</strong></span>
                  <span>PPS: <strong className="text-foreground font-mono">{atk.peakPps || "N/A"}</strong></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {isLocked && (
        <UpgradeOverlay
          title="L7 DDoS Shield"
          description="Protect your infrastructure from massive application-layer floods and volumetric attacks with auto-scaling mitigation and intelligent scrubbing. This feature requires the Enterprise plan."
          feature="DDoS Protection"
        />
      )}
    </DashboardLayout>
  );
}

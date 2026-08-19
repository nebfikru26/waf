import { useState, useEffect } from "react";
import { Bot, ShieldCheck, Eye, Zap, BarChart3, Settings2, Lock } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

const chartTooltipStyle = {
  backgroundColor: "hsl(0, 0%, 100%)",
  border: "1px solid hsl(220, 14%, 88%)",
  borderRadius: "8px",
  fontSize: "12px",
  fontFamily: "'JetBrains Mono', monospace",
};

export default function BotProtectionPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isPlatformAdmin = user?.role === "super_admin" || user?.role === "admin" || user?.role === "support_engineer";
  const canEdit = (isPlatformAdmin || user?.role === "tenant_admin" || user?.role === "analyst") && (isPlatformAdmin || user?.entitlements?.hasBotProtection);
  const isLocked = user && !isPlatformAdmin && !user.entitlements?.hasBotProtection;

  const headers = {
    "Content-Type": "application/json"
  };

  const { data: settings, isLoading } = useQuery<any>({
    queryKey: ["security-settings", user?.tenantId],
    queryFn: () => fetch("/api/modules/security-settings", { headers }).then(r => r.json())
  });

  const updateSettingsMutation = useMutation({
    mutationFn: (newSettings: any) => {
      const currentSettings = queryClient.getQueryData(["security-settings", user?.tenantId]) || settings || {};
      return fetch("/api/modules/security-settings", {
        method: "PUT",
        headers,
        body: JSON.stringify({ ...currentSettings, ...newSettings }),
      }).then(r => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["security-settings"] });
      toast({ title: "Settings updated" });
    }
  });

  const { data: botData, isLoading: isLoadingAnalytics } = useQuery<any>({
    queryKey: ["bot-analytics", user?.tenantId],
    queryFn: () => fetch("/api/analytics/bot", { headers }).then(r => r.json())
  });

  const [sensitivityLevel, setSensitivityLevel] = useState("medium");
  const [bots, setBots] = useState<{ name: string; action: string; category: string }[]>([]);

  useEffect(() => {
    if (settings) {
      setSensitivityLevel(settings.sensitivityLevel || "medium");
    }
  }, [settings]);

  useEffect(() => {
    if (botData?.knownBots) {
      setBots(botData.knownBots);
    }
  }, [botData]);

  const saveSensitivity = (level: string) => {
    setSensitivityLevel(level);
    if (!canEdit) return;
    updateSettingsMutation.mutate({ sensitivityLevel: level });
  };

  const toggleSetting = (key: string, val: boolean) => {
    if (!canEdit) return;
    const pascalKey = key.charAt(0).toUpperCase() + key.slice(1);
    updateSettingsMutation.mutate({ [key]: val, [pascalKey]: val });
  };

  const cycleAction = (name: string) => {
    if (!canEdit) return;
    const actions = ["allow", "challenge", "block"] as const;
    setBots(bots.map(b => {
      if (b.name !== name) return b;
      const idx = actions.indexOf(b.action as any);
      return { ...b, action: actions[(idx + 1) % 3] };
    }));
    toast({ title: `Bot action updated` });
  };

  const safeBotTypes = botData?.botTypes || [];
  const safeTimeline = botData?.timeline || [];
  const safePieData = [
    { name: "Good Bots", value: botData?.goodBots || 0, color: "hsl(152, 60%, 42%)" },
    { name: "Bad Bots", value: botData?.badBots || 0, color: "hsl(0, 68%, 55%)" },
  ];

  return (
    <DashboardLayout>
      <div className={`space-y-6 relative transition-all duration-500 ${isLocked ? 'blur-sm pointer-events-none select-none opacity-40' : ''}`}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Bot Protection</h1>
            <p className="text-sm text-muted-foreground">ML-powered bot detection with JS challenges, fingerprinting & behavioral analysis</p>
          </div>
          <div className="flex items-center gap-3">
            {isLoading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
            <span className="text-xs text-muted-foreground">Protection</span>
            <Switch
              checked={settings?.botProtectionEnabled ?? settings?.bot_protection_enabled ?? false}
              onCheckedChange={(val) => { if (canEdit) updateSettingsMutation.mutate({ botProtectionEnabled: val, bot_protection_enabled: val }); }}
              disabled={!canEdit}
            />
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="stat-card">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-muted text-primary"><Bot className="h-4 w-4" /></div>
              <span className="text-sm text-muted-foreground">Bot Traffic Share</span>
            </div>
            <p className="text-2xl font-bold font-mono">{botData?.totalTrafficPercent || "0%"}</p>
            <p className="text-xs text-muted-foreground mt-1">Of all requests</p>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-muted text-success"><ShieldCheck className="h-4 w-4" /></div>
              <span className="text-sm text-muted-foreground">Good Bots</span>
            </div>
            <p className="text-2xl font-bold font-mono">{botData?.goodBots?.toLocaleString() || "0"}</p>
            <p className="text-xs text-muted-foreground mt-1">Verified search & monitors</p>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-muted text-destructive"><Eye className="h-4 w-4" /></div>
              <span className="text-sm text-muted-foreground">Bad Bots</span>
            </div>
            <p className="text-2xl font-bold font-mono">{botData?.badBots?.toLocaleString() || "0"}</p>
            <p className="text-xs text-muted-foreground mt-1">Blocked scrapers & scanners</p>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-muted text-warning"><Zap className="h-4 w-4" /></div>
              <span className="text-sm text-muted-foreground">Challenges</span>
            </div>
            <p className="text-2xl font-bold font-mono">{botData?.challenges?.toLocaleString() || "0"}</p>
            <p className="text-xs text-muted-foreground mt-1">JS/CAPTCHA puzzles issued</p>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-card border border-border rounded-lg p-5">
            <h3 className="text-sm font-medium mb-4">Traffic Breakdown</h3>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={safePieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                  {safePieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={chartTooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-card border border-border rounded-lg p-5">
            <h3 className="text-sm font-medium mb-4">Bot Activity Timeline</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={safeTimeline}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 88%)" />
                <XAxis dataKey="time" tick={{ fontSize: 11, fill: "hsl(220, 10%, 46%)" }} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(220, 10%, 46%)" }} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Bar dataKey="good" fill="hsl(152, 60%, 42%)" radius={[2, 2, 0, 0]} name="Good Bots" />
                <Bar dataKey="bad" fill="hsl(0, 68%, 55%)" radius={[2, 2, 0, 0]} name="Bad Bots" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Detection Settings */}
        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-primary" />
            Detection Methods
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
              <div>
                <p className="text-sm font-medium">JavaScript Challenge</p>
                <p className="text-xs text-muted-foreground">Verify browser JS execution capability</p>
              </div>
              <Switch
                checked={settings?.jsChallengeEnabled ?? settings?.js_challenge_enabled ?? settings?.JsChallengeEnabled ?? false}
                onCheckedChange={(val) => { if (canEdit) updateSettingsMutation.mutate({ jsChallengeEnabled: val, js_challenge_enabled: val, JsChallengeEnabled: val }); }}
                disabled={!canEdit}
              />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
              <div>
                <p className="text-sm font-medium">CAPTCHA Challenge</p>
                <p className="text-xs text-muted-foreground">Human verification for suspicious traffic</p>
              </div>
              <Switch
                checked={settings?.captchaEnabled ?? settings?.captcha_enabled ?? settings?.CaptchaEnabled ?? false}
                onCheckedChange={(val) => { if (canEdit) updateSettingsMutation.mutate({ captchaEnabled: val, captcha_enabled: val, CaptchaEnabled: val }); }}
                disabled={!canEdit}
              />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
              <div>
                <p className="text-sm font-medium">Browser Fingerprinting</p>
                <p className="text-xs text-muted-foreground">TLS, canvas, WebGL fingerprint analysis</p>
              </div>
              <Switch
                checked={settings?.fingerprintingEnabled ?? settings?.fingerprinting_enabled ?? settings?.FingerprintingEnabled ?? false}
                onCheckedChange={(val) => { if (canEdit) updateSettingsMutation.mutate({ fingerprintingEnabled: val, fingerprinting_enabled: val, FingerprintingEnabled: val }); }}
                disabled={!canEdit}
              />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
              <div>
                <p className="text-sm font-medium">ML Behavioral Analysis</p>
                <p className="text-xs text-muted-foreground">AI-powered bot behavior detection</p>
              </div>
              <Switch
                checked={settings?.mlDetectionEnabled ?? settings?.ml_detection_enabled ?? false}
                onCheckedChange={(val) => { if (canEdit) updateSettingsMutation.mutate({ mlDetectionEnabled: val, ml_detection_enabled: val }); }}
                disabled={!canEdit}
              />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-4">
            <span className="text-xs text-muted-foreground">Sensitivity Level</span>
            <Select value={sensitivityLevel} onValueChange={saveSensitivity} disabled={!canEdit}>
              <SelectTrigger className="w-32 text-xs font-mono"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low" className="text-xs">Low</SelectItem>
                <SelectItem value="medium" className="text-xs">Medium</SelectItem>
                <SelectItem value="high" className="text-xs">High</SelectItem>
                <SelectItem value="paranoid" className="text-xs">Paranoid</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Known Bots */}
        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-sm font-medium mb-4">Known Bot Management</h3>
          <div className="space-y-1">
            {bots.map((bot) => (
              <div key={bot.name} className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/20 hover:bg-muted/40 transition-colors">
                <div className="flex items-center gap-3">
                  <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm font-medium">{bot.name}</span>
                  <Badge variant="secondary" className="text-[10px]">{bot.category}</Badge>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => cycleAction(bot.name)}
                  disabled={!canEdit}
                  className={`text-[10px] font-mono h-6 px-2 ${bot.action === "allow" ? "border-success/40 text-success" :
                      bot.action === "challenge" ? "border-warning/40 text-warning" :
                        "border-destructive/40 text-destructive"
                    }`}
                >
                  {bot.action.toUpperCase()}
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* Bad Bot Types */}
        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-sm font-medium mb-4">Bot Type Distribution</h3>
          <div className="space-y-2">
            {safeBotTypes.length === 0 && <p className="text-xs text-muted-foreground py-4 text-center">No bot traffic detected in the current period.</p>}
            {safeBotTypes.map((bt: any) => (
              <div key={bt.name} className="flex items-center gap-3">
                <span className="text-xs w-36 truncate">{bt.name}</span>
                <div className="flex-1 h-5 bg-muted/40 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${bt.type === "good" ? "bg-success/60" : "bg-destructive/60"}`}
                    style={{ width: `${Math.min(100, (bt.value / (botData?.totalAlerts || 1)) * 500)}%` }}
                  />
                </div>
                <span className="text-xs font-mono text-muted-foreground w-14 text-right">{bt.value.toLocaleString()}</span>
                <Badge variant={bt.type === "good" ? "secondary" : "destructive"} className="text-[10px] w-10 justify-center">
                  {bt.type}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      </div>

      {isLocked && (
        <UpgradeOverlay
          title="Bot Intelligence Shield"
          description="Protect your application from sophisticated scrapers, credential stuffing, and behavioral bots using ML-powered detection and JS challenges. This feature requires the Professional plan."
          feature="Bot Protection"
        />
      )}
    </DashboardLayout>
  );
}

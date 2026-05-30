import { useState } from "react";
import { Bell, BellRing, Mail, Webhook, Plus, Trash2, Settings2 } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { UpgradeOverlay } from "@/components/UpgradeOverlay";

const recentAlerts: { id: number; time: string; type: string; severity: string; message: string; channel: string; acknowledged: boolean }[] = [];

const alertChannels = [
  { id: "1", name: "Security Team Email", type: "email", destination: "security@affinisecurity.io", enabled: true },
  { id: "2", name: "Ops Webhook", type: "webhook", destination: "https://hooks.slack.com/services/...", enabled: true },
  { id: "3", name: "PagerDuty", type: "webhook", destination: "https://events.pagerduty.com/...", enabled: true },
  { id: "4", name: "Admin SMS", type: "sms", destination: "+251-9XX-XXX-XXX", enabled: false },
];

export default function InstantAlertsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const canEdit = user?.role === "admin" || user?.role === "analyst";
  const isLocked = user && !user.entitlements.hasNotifications;

  const [channels, setChannels] = useState(alertChannels);
  const [severityFilter, setSeverityFilter] = useState("all");

  const { data: rawAlerts = [], isLoading } = useQuery({
    queryKey: ["instant-alerts"],
    queryFn: async () => {
      const token = (localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token")) || sessionStorage.getItem("auth_token");
      const res = await fetch("/api/alerts", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      return res.json();
    }
  });

  const alerts = (Array.isArray(rawAlerts) ? rawAlerts : []).map((a: any) => ({
    id: a.id,
    time: new Date(a.timestamp).toLocaleTimeString(),
    type: a.rule || "WAF Event",
    severity: (a.severity || "info").toLowerCase(),
    message: `${a.rule} detected from ${a.ip} on ${a.uri}`,
    channel: "system",
    acknowledged: false, // In a real app, this would be fetched from a separate 'acknowledgments' table
  }));

  const [ddosAlerts, setDdosAlerts] = useState(true);
  const [sqlInjectionAlerts, setSqlInjectionAlerts] = useState(true);
  const [xssAlerts, setXssAlerts] = useState(true);
  const [rateLimitAlerts, setRateLimitAlerts] = useState(true);
  const [sslAlerts, setSslAlerts] = useState(true);
  const [botAlerts, setBotAlerts] = useState(true);
  const [atoAlerts, setAtoAlerts] = useState(true);
  const [loginAlerts, setLoginAlerts] = useState(false);

  const toggleChannel = (id: string) => {
    setChannels(channels.map(c => c.id === id ? { ...c, enabled: !c.enabled } : c));
    toast({ title: "Channel toggled" });
  };

  const acknowledgeAlert = (id: string) => {
    toast({ title: "Alert acknowledged" });
  };

  const filteredAlerts = severityFilter === "all" ? alerts : alerts.filter(a => a.severity === severityFilter);

  const severityColor = (s: string) => {
    switch (s) {
      case "critical": return "text-destructive border-destructive/30 bg-destructive/10";
      case "high": return "text-destructive border-destructive/20 bg-destructive/5";
      case "medium": return "text-warning border-warning/30 bg-warning/10";
      case "warning": return "text-warning border-warning/20 bg-warning/5";
      case "low": return "text-muted-foreground border-border bg-muted/20";
      default: return "text-primary border-primary/20 bg-primary/5";
    }
  };

  return (
    <DashboardLayout>
      <div className={`space-y-6 relative transition-all duration-500 ${isLocked ? 'blur-sm pointer-events-none select-none opacity-40' : ''}`}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Instant Alerts</h1>
            <p className="text-sm text-muted-foreground">Real-time security notifications via email, webhook, SMS & Slack</p>
          </div>
          <Badge className="font-mono text-xs bg-destructive/10 text-destructive border-destructive/30 animate-pulse">
            <BellRing className="h-3 w-3 mr-1" />
            {alerts.filter(a => !a.acknowledged).length} UNACKNOWLEDGED
          </Badge>
        </div>

        {/* Alert Rules */}
        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-primary" />
            Alert Rules — Which events trigger notifications
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: "DDoS Attacks", state: ddosAlerts, set: setDdosAlerts },
              { label: "SQL Injection", state: sqlInjectionAlerts, set: setSqlInjectionAlerts },
              { label: "XSS Attacks", state: xssAlerts, set: setXssAlerts },
              { label: "Rate Limit Violations", state: rateLimitAlerts, set: setRateLimitAlerts },
              { label: "SSL/TLS Issues", state: sslAlerts, set: setSslAlerts },
              { label: "Bot Surges", state: botAlerts, set: setBotAlerts },
              { label: "Account Takeover", state: atoAlerts, set: setAtoAlerts },
              { label: "Admin Logins", state: loginAlerts, set: setLoginAlerts },
            ].map((rule) => (
              <div key={rule.label} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30">
                <span className="text-xs font-medium">{rule.label}</span>
                <Switch checked={rule.state} onCheckedChange={rule.set} disabled={!canEdit} className="scale-90" />
              </div>
            ))}
          </div>
        </div>

        {/* Notification Channels */}
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" />
              Notification Channels
            </h3>
            {canEdit && (
              <Button size="sm" variant="outline" className="text-xs font-mono">
                <Plus className="h-3.5 w-3.5 mr-1" /> ADD CHANNEL
              </Button>
            )}
          </div>
          <div className="space-y-2">
            {channels.map((ch) => (
              <div key={ch.id} className="flex items-center justify-between py-2.5 px-3 rounded-md bg-muted/20 hover:bg-muted/40 transition-colors">
                <div className="flex items-center gap-3">
                  {ch.type === "email" ? <Mail className="h-3.5 w-3.5 text-primary" /> :
                    ch.type === "webhook" ? <Webhook className="h-3.5 w-3.5 text-primary" /> :
                      <Bell className="h-3.5 w-3.5 text-primary" />}
                  <div>
                    <p className="text-sm font-medium">{ch.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{ch.destination}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="text-[10px] font-mono">{ch.type}</Badge>
                  <Switch checked={ch.enabled} onCheckedChange={() => canEdit && toggleChannel(ch.id)} disabled={!canEdit} className="scale-90" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Alerts */}
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium">Alert Feed</h3>
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="w-28 text-xs font-mono"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            {filteredAlerts.map((alert) => (
              <div key={alert.id} className={`p-3 rounded-lg border transition-colors ${alert.acknowledged ? "bg-muted/10 border-border/50 opacity-60" : "bg-muted/20 border-border"}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <Badge className={`text-[10px] font-mono ${severityColor(alert.severity)}`}>
                      {alert.severity.toUpperCase()}
                    </Badge>
                    <span className="text-sm font-medium">{alert.type}</span>
                    <Badge variant="outline" className="text-[10px] font-mono">{alert.channel}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-muted-foreground">{alert.time}</span>
                    {!alert.acknowledged && canEdit && (
                      <Button size="sm" variant="outline" className="h-5 px-2 text-[10px] font-mono" onClick={() => acknowledgeAlert(alert.id)}>
                        ACK
                      </Button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{alert.message}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
      {isLocked && (
        <UpgradeOverlay
          title="Instant Alerting Engine"
          description="Never miss a critical event with real-time notifications across Email, SMS, Slack, and PagerDuty. This feature requires the Enterprise plan."
          feature="Instant Alerts"
        />
      )}
    </DashboardLayout>
  );
}

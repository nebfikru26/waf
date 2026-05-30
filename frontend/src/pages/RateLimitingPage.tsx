import { Gauge, Shield, AlertTriangle, Settings } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/hooks/use-auth";
import { UpgradeOverlay } from "@/components/UpgradeOverlay";

// Removed mock data: Replace with react-query when backend is ready
const rateLimitHitsData: any[] = [];
const topRateLimitedIPs: any[] = [];
const endpointRateLimits: any[] = [];
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";


const chartTooltipStyle = {
  backgroundColor: "hsl(220, 22%, 10%)",
  border: "1px solid hsl(220, 18%, 18%)",
  borderRadius: "8px",
  color: "hsl(210, 20%, 92%)",
  fontSize: "12px",
  fontFamily: "'JetBrains Mono', monospace",
};

const statusColors: Record<string, string> = {
  normal: "bg-success/20 text-success",
  warning: "bg-warning/20 text-warning",
  exceeded: "bg-destructive/20 text-destructive",
  blocked: "bg-destructive/20 text-destructive",
  "rate-limited": "bg-warning/20 text-warning",
  warned: "bg-primary/20 text-primary",
};

export default function RateLimitingPage() {
  const { user } = useAuth();
  const token = (localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token")) || sessionStorage.getItem("auth_token");
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`
  };
  const isPlatformAdmin = user?.role === "super_admin" || user?.role === "admin" || user?.role === "support_engineer";
  const isLocked = !isPlatformAdmin && user && !user.entitlements.hasRateLimiting;
  const [globalLimit, setGlobalLimit] = useState("1000");
  const [perIpLimit, setPerIpLimit] = useState("100");
  const [windowSize, setWindowSize] = useState("1m");

  const totalHits = rateLimitHitsData.reduce((s, d) => s + d.globalHits, 0);

  return (
    <DashboardLayout>
      <div className={`space-y-6 relative transition-all duration-500 ${isLocked ? 'blur-sm pointer-events-none select-none opacity-40' : ''}`}>
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Gauge className="h-5 w-5 text-primary" /> Rate Limiting
          </h1>
          <p className="text-sm text-muted-foreground">Configure per-IP, per-endpoint, and global rate limits</p>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="stat-card">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-muted text-destructive"><AlertTriangle className="h-4 w-4" /></div>
              <span className="text-sm text-muted-foreground">Rate Limit Hits</span>
            </div>
            <p className="text-2xl font-bold font-mono">{totalHits}</p>
            <p className="text-xs text-muted-foreground mt-1">Last 24 hours</p>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-muted text-warning"><Shield className="h-4 w-4" /></div>
              <span className="text-sm text-muted-foreground">IPs Rate Limited</span>
            </div>
            <p className="text-2xl font-bold font-mono">{topRateLimitedIPs.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Currently active</p>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-muted text-primary"><Settings className="h-4 w-4" /></div>
              <span className="text-sm text-muted-foreground">Endpoints Configured</span>
            </div>
            <p className="text-2xl font-bold font-mono">{endpointRateLimits.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Custom rules</p>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-muted text-destructive"><Gauge className="h-4 w-4" /></div>
              <span className="text-sm text-muted-foreground">Exceeded</span>
            </div>
            <p className="text-2xl font-bold font-mono">{endpointRateLimits.filter(e => e.status === "exceeded").length}</p>
            <p className="text-xs text-muted-foreground mt-1">Endpoints over limit</p>
          </div>
        </div>

        {/* Global Configuration */}
        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
            <Settings className="h-4 w-4 text-primary" /> Global Configuration
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Global Rate Limit (req/window)</label>
              <Input type="number" value={globalLimit} onChange={(e) => setGlobalLimit(e.target.value)} className="font-mono" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Per-IP Rate Limit (req/window)</label>
              <Input type="number" value={perIpLimit} onChange={(e) => setPerIpLimit(e.target.value)} className="font-mono" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Window Size</label>
              <Select value={windowSize} onValueChange={setWindowSize}>
                <SelectTrigger className="font-mono"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="10s">10 seconds</SelectItem>
                  <SelectItem value="30s">30 seconds</SelectItem>
                  <SelectItem value="1m">1 minute</SelectItem>
                  <SelectItem value="5m">5 minutes</SelectItem>
                  <SelectItem value="15m">15 minutes</SelectItem>
                  <SelectItem value="1h">1 hour</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Rate Limit Hits Over Time */}
        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-sm font-medium mb-4">Rate Limit Hits Over Time</h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={rateLimitHitsData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 18%, 18%)" />
              <XAxis dataKey="time" tick={{ fontSize: 11, fill: "hsl(215, 15%, 55%)" }} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(215, 15%, 55%)" }} />
              <Tooltip contentStyle={chartTooltipStyle} />
              <Area type="monotone" dataKey="globalHits" stroke="hsl(0, 72%, 51%)" fill="hsl(0, 72%, 51%)" fillOpacity={0.15} strokeWidth={2} name="Global" />
              <Area type="monotone" dataKey="perIpHits" stroke="hsl(25, 95%, 53%)" fill="hsl(25, 95%, 53%)" fillOpacity={0.15} strokeWidth={2} name="Per-IP" />
              <Area type="monotone" dataKey="perEndpointHits" stroke="hsl(187, 94%, 43%)" fill="hsl(187, 94%, 43%)" fillOpacity={0.15} strokeWidth={2} name="Per-Endpoint" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Per-Endpoint Configuration */}
          <div className="bg-card border border-border rounded-lg p-5">
            <h3 className="text-sm font-medium mb-4">Per-Endpoint Rate Limits</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-3 text-xs text-muted-foreground font-medium">Endpoint</th>
                    <th className="pb-3 text-xs text-muted-foreground font-medium text-center">Method</th>
                    <th className="pb-3 text-xs text-muted-foreground font-medium text-right">Limit</th>
                    <th className="pb-3 text-xs text-muted-foreground font-medium text-right">Current</th>
                    <th className="pb-3 text-xs text-muted-foreground font-medium text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {endpointRateLimits.map((ep, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 font-mono text-xs">{ep.endpoint}</td>
                      <td className="py-2.5 text-center">
                        <span className="text-[10px] font-mono bg-secondary px-2 py-0.5 rounded">{ep.method}</span>
                      </td>
                      <td className="py-2.5 text-right font-mono text-xs">{ep.limit}/{ep.window}</td>
                      <td className="py-2.5 text-right font-mono text-xs">{ep.currentRate}</td>
                      <td className="py-2.5 text-center">
                        <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded ${statusColors[ep.status]}`}>{ep.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top Rate Limited IPs */}
          <div className="bg-card border border-border rounded-lg p-5">
            <h3 className="text-sm font-medium mb-4">Top Rate Limited IPs</h3>
            <div className="space-y-2">
              {topRateLimitedIPs.map((ip) => (
                <div key={ip.ip} className="flex flex-wrap items-center gap-3 py-2.5 px-3 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors">
                  <span className="font-mono text-sm">{ip.ip}</span>
                  <span className="text-xs font-mono text-muted-foreground">{ip.endpoint}</span>
                  <span className="text-xs font-mono text-destructive ml-auto">{ip.hits} hits</span>
                  <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded ${statusColors[ip.status]}`}>{ip.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {isLocked && (
        <UpgradeOverlay
          title="Rate Limiting"
          description="Control per-IP, per-endpoint, and global request rates to protect your infrastructure from abuse and DDoS. Rate Limiting requires the Professional plan or above."
          feature="Rate Limiting"
        />
      )}
    </DashboardLayout>
  );
}

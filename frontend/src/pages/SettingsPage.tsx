import { useState, useEffect } from "react";
import { Globe, Key, Webhook, Lock, Copy, RefreshCw, Loader2, Plus, Trash2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/hooks/use-auth";
import { WafPermissions } from "@/lib/permissions";
import { Can } from "@/components/Can";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export default function SettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [webhookUrl, setWebhookUrl] = useState("https://hooks.example.com/waf-alerts");
  const [domains, setDomains] = useState<{ id: string; domain_name: string; status: string; ssl_mode: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKeyName, setNewKeyName] = useState("");
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);

  const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = (localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token")) || sessionStorage.getItem("auth_token");
      const response = await fetch("/api/domains", {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (Array.isArray(data)) setDomains(data);
    } catch (e) {
      console.error("Failed to load settings data", e);
    }
    setLoading(false);
  };

  const { data: apiKeys = [], isLoading: isLoadingKeys } = useQuery({
    queryKey: ["api-keys"],
    queryFn: () => fetch("/api/apikey", { headers: { "Authorization": `Bearer ${token}` } }).then(r => r.json())
  });

  const generateKeyMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch("/api/apikey", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ name })
      });
      if (!res.ok) throw new Error("Failed to generate key");
      return res.json();
    },
    onSuccess: (data) => {
      setNewlyCreatedKey(data.secret);
      setNewKeyName("");
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast({ title: "API Key Generated", description: "Save this key now. You will not be able to see it again." });
    },
    onError: () => toast({ title: "Error", description: "Failed to generate API key", variant: "destructive" })
  });

  const revokeKeyMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/apikey/${id}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to revoke key");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast({ title: "API Key Revoked", description: "The key has been permanently deactivated." });
    }
  });

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-3xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Tenant Settings</h1>
            <p className="text-sm text-muted-foreground">Manage organization configuration</p>
          </div>
          {user?.role && (
            <span className="text-xs font-mono px-2 py-1 rounded bg-primary/10 text-primary border border-primary/20">
              {user.role.toUpperCase()}
            </span>
          )}
        </div>

        {/* Domains */}
        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" /> Protected Domains
          </h3>
          <div className="space-y-2">
            {domains.length === 0 && <p className="text-xs text-muted-foreground">No domains configured</p>}
            {domains.map((d) => (
              <div key={d.id} className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/30">
                <span className="font-mono text-sm">{d.domain_name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono bg-secondary px-2 py-0.5 rounded">{d.ssl_mode}</span>
                  <span className={`text-xs font-mono ${d.status === "active" ? "text-success" : "text-warning"}`}>{d.status.toUpperCase()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* SSL */}
        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
            <Lock className="h-4 w-4 text-primary" /> SSL Settings
          </h3>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/30">
              <span className="text-muted-foreground">Min TLS Version</span>
              <span className="font-mono text-primary">TLS 1.2</span>
            </div>
            <div className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/30">
              <span className="text-muted-foreground">HSTS</span>
              <span className="font-mono text-success">ENABLED</span>
            </div>
            <div className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/30">
              <span className="text-muted-foreground">Auto-Provisioning</span>
              <span className="font-mono text-success">ACTIVE</span>
            </div>
          </div>
        </div>

        {/* API Keys */}
        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
            <Key className="h-4 w-4 text-primary" /> API Keys for Automation
          </h3>
          <p className="text-xs text-muted-foreground mb-4">Generate API keys to authenticate headless automation scripts and CI/CD pipelines.</p>
          
          <div className="space-y-4">
            {newlyCreatedKey && (
              <div className="p-4 bg-primary/10 border border-primary/20 rounded-md">
                <div className="flex items-center gap-2 mb-2 text-primary font-bold text-sm">
                  <ShieldAlert className="h-4 w-4" /> Please save this key now
                </div>
                <p className="text-xs text-muted-foreground mb-3">This is the only time the full key will be displayed. If you lose it, you must generate a new one.</p>
                <div className="flex items-center gap-2">
                  <Input value={newlyCreatedKey} readOnly className="bg-background font-mono text-xs text-primary" />
                  <Button size="icon" variant="outline" className="shrink-0" onClick={() => copyText(newlyCreatedKey)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            <Can permission={WafPermissions.ApiKeysManage}>
              <div className="flex items-center gap-2 mb-4">
                <Input 
                  placeholder="e.g. Terraform Production Key" 
                  value={newKeyName} 
                  onChange={(e) => setNewKeyName(e.target.value)}
                  className="bg-muted/50 font-mono text-xs" 
                />
                <Button 
                  size="sm" 
                  className="shrink-0 text-xs"
                  disabled={!newKeyName.trim() || generateKeyMutation.isPending}
                  onClick={() => generateKeyMutation.mutate(newKeyName)}
                >
                  {generateKeyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-2" /> Generate Key</>}
                </Button>
              </div>
            </Can>

            <div className="space-y-2">
              {isLoadingKeys ? (
                <div className="flex justify-center p-4"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
              ) : apiKeys.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No API keys generated yet.</p>
              ) : (
                apiKeys.map((key: any) => (
                  <div key={key.id} className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/30 border border-border/50">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold ${key.isRevoked ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{key.name}</span>
                        {key.isRevoked && <span className="text-[9px] bg-destructive/10 text-destructive px-1.5 py-0.5 rounded font-mono uppercase">Revoked</span>}
                      </div>
                      <div className="text-xs font-mono text-muted-foreground mt-1">
                        {key.isRevoked ? "••••••••••••••••••••••••••••••••••••" : key.prefix}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground">
                        {key.lastUsedAt ? `Last used ${new Date(key.lastUsedAt).toLocaleDateString()}` : "Never used"}
                      </span>
                      {!key.isRevoked && (
                        <Can permission={WafPermissions.ApiKeysManage}>
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={() => revokeKeyMutation.mutate(key.id)}
                            disabled={revokeKeyMutation.isPending}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </Can>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Webhook */}
        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
            <Webhook className="h-4 w-4 text-primary" /> Webhook Configuration
          </h3>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Alert Webhook URL</Label>
              <div className="flex gap-2">
                <Input value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} className="bg-muted/50 font-mono text-xs" />
                <Button size="sm" className="font-mono text-xs shrink-0">SAVE</Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Receives POST requests for critical alerts and blocked attacks.
            </p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

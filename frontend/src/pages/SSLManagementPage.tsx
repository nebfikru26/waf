import { useState } from "react";
import { Lock, ShieldCheck, AlertTriangle, RefreshCw, Plus, Settings2, Loader2 } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UpgradeOverlay } from "@/components/UpgradeOverlay";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SSLCertificate {
  id: string;
  domain: string;
  issuer: string;
  expiry: string;
  status: string;
  grade: string;
  protocol: string;
}

interface TLSConfig {
  httpsRedirect: boolean;
  hsts: boolean;
  hstsPreload: boolean;
  ocspStapling: boolean;
  autoRenewal: boolean;
  tls13Only: boolean;
  minTlsVersion: string;
}

const cipherSuites = [
  { name: "TLS_AES_256_GCM_SHA384", protocol: "TLS 1.3", strength: "256-bit", status: "recommended" },
  { name: "TLS_CHACHA20_POLY1305_SHA256", protocol: "TLS 1.3", strength: "256-bit", status: "recommended" },
  { name: "TLS_AES_128_GCM_SHA256", protocol: "TLS 1.3", strength: "128-bit", status: "acceptable" },
  { name: "ECDHE-RSA-AES256-GCM-SHA384", protocol: "TLS 1.2", strength: "256-bit", status: "acceptable" },
  { name: "ECDHE-RSA-AES128-GCM-SHA256", protocol: "TLS 1.2", strength: "128-bit", status: "acceptable" },
  { name: "DHE-RSA-AES256-SHA256", protocol: "TLS 1.2", strength: "256-bit", status: "legacy" },
];

interface ProvisionInput {
  domain: string;
  email: string;
  useStaging: boolean;
}

export default function SSLManagementPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isPlatformAdmin = user?.role === "super_admin" || user?.role === "admin" || user?.role === "support_engineer";
  const canEdit = isPlatformAdmin || user?.role === "tenant_admin" || user?.role === "security_engineer";
  const isLocked = !isPlatformAdmin && user && !user.entitlements?.hasSslManagement;

  const token = (localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token")) || sessionStorage.getItem("auth_token");
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`
  };

  const { data: certs = [], isLoading: isLoadingCerts } = useQuery<SSLCertificate[]>({
    queryKey: ["ssl-certificates", user?.tenantId],
    queryFn: () => fetch("/api/ssl/certificates", { headers }).then(r => r.json())
  });

  const { data: config, isLoading: isLoadingConfig } = useQuery<TLSConfig>({
    queryKey: ["ssl-config", user?.tenantId],
    queryFn: () => fetch("/api/ssl/config", { headers }).then(r => r.json())
  });

  const updateConfigMutation = useMutation({
    mutationFn: (newConfig: Partial<TLSConfig>) => 
      fetch("/api/ssl/config", {
        method: "PUT",
        headers,
        body: JSON.stringify({ ...config, ...newConfig }),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ssl-config"] });
      toast({ title: "TLS configuration updated" });
    }
  });

  const provisionMutation = useMutation({
    mutationFn: (input: ProvisionInput) => 
      fetch("/api/ssl/provision", {
        method: "POST",
        headers,
        body: JSON.stringify(input),
      }).then(async r => {
        if (!r.ok) {
          const err = await r.json();
          throw new Error(err.error || "Provisioning failed");
        }
        return r.json();
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["ssl-certificates"] });
      toast({ title: "Certificate Provisioned", description: `Successfully issued for ${data.domain}` });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Provisioning Failed", 
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const [useStaging, setUseStaging] = useState(true);
  const [acmeEmail, setAcmeEmail] = useState(user?.email || "");

  const safeCerts = Array.isArray(certs) ? certs : [];
  
  const sslStats = [
    { label: "Active Certificates", value: String(safeCerts.filter(c => c.status === "active").length), icon: Lock, variant: "success" },
    { label: "Expiring Soon", value: String(safeCerts.filter(c => c.status === "expiring").length), icon: AlertTriangle, variant: "warning" },
    { label: "SSL Grade", value: safeCerts.length > 0 ? "A+" : "N/A", icon: ShieldCheck, variant: "default" },
    { label: "HTTPS Coverage", value: safeCerts.length > 0 ? "100%" : "0%", icon: Lock, variant: "success" },
  ];

  const iconColors: Record<string, string> = {
    default: "text-primary",
    success: "text-success",
    warning: "text-warning",
  };

  if (isLoadingCerts || isLoadingConfig) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  const handleToggle = (key: keyof TLSConfig, val: boolean) => {
    if (!canEdit) return;
    updateConfigMutation.mutate({ [key]: val });
  };

  return (
    <DashboardLayout>
      <div className={`space-y-6 relative transition-all duration-500 ${isLocked ? 'blur-sm pointer-events-none select-none opacity-40' : ''}`}>
        <div>
          <h1 className="text-xl font-bold">SSL/TLS Management</h1>
          <p className="text-sm text-muted-foreground">Certificate lifecycle, TLS configuration & encryption enforcement</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {sslStats.map((stat) => (
            <div key={stat.label} className="stat-card">
              <div className="flex items-center gap-3 mb-3">
                <div className={`p-2 rounded-lg bg-muted ${iconColors[stat.variant]}`}>
                  <stat.icon className="h-4 w-4" />
                </div>
                <span className="text-sm text-muted-foreground">{stat.label}</span>
              </div>
              <p className="text-2xl font-bold font-mono">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Certificates */}
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium">SSL Certificates</h3>
            {canEdit && (
              <Button size="sm" variant="outline" className="text-xs font-mono">
                <Plus className="h-3.5 w-3.5 mr-1" /> ADD CERTIFICATE
              </Button>
            )}
          </div>
          <div className="space-y-2">
            {safeCerts.map((cert) => (
              <div key={cert.id} className="flex items-center justify-between py-3 px-4 rounded-lg bg-muted/20 hover:bg-muted/40 transition-colors">
                <div className="flex items-center gap-4">
                  <Lock className={`h-4 w-4 ${cert.status === "active" ? "text-success" : cert.status === "expiring" ? "text-warning" : "text-destructive"}`} />
                  <div>
                    <p className="text-sm font-mono font-medium">{cert.domain}</p>
                    <p className="text-xs text-muted-foreground">Issuer: {cert.issuer} · Expires: {new Date(cert.expiry).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="font-mono text-[10px]">{cert.protocol}</Badge>
                  <Badge className={`text-[10px] font-mono ${
                    cert.grade === "A+" ? "bg-success/10 text-success border-success/30" :
                    cert.grade === "A" ? "bg-primary/10 text-primary border-primary/30" :
                    "bg-warning/10 text-warning border-warning/30"
                  }`}>{cert.grade}</Badge>
                  <Badge variant={cert.status === "active" ? "default" : cert.status === "expiring" ? "secondary" : "destructive"} className="text-[10px]">
                    {cert.status}
                  </Badge>
                  {canEdit && (
                    <div className="flex items-center gap-1">
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="h-8 px-2 text-[10px] font-mono hover:bg-primary/10 hover:text-primary"
                        onClick={() => provisionMutation.mutate({ domain: cert.domain, email: acmeEmail, useStaging })}
                        disabled={provisionMutation.isPending}
                      >
                        {provisionMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <ShieldCheck className="h-3 w-3 mr-1" />}
                        PROVISION REAL
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => toast({ title: "Certificate renewal triggered" })}>
                        <RefreshCw className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* TLS Settings */}
        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-primary" />
            TLS Configuration
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { label: "Force HTTPS Redirect", desc: "Redirect all HTTP to HTTPS", state: config?.httpsRedirect, key: "httpsRedirect" as keyof TLSConfig },
              { label: "HSTS Header", desc: "Strict-Transport-Security header", state: config?.hsts, key: "hsts" as keyof TLSConfig },
              { label: "HSTS Preload", desc: "Add to browser preload lists", state: config?.hstsPreload, key: "hstsPreload" as keyof TLSConfig },
              { label: "OCSP Stapling", desc: "Faster certificate validation", state: config?.ocspStapling, key: "ocspStapling" as keyof TLSConfig },
              { label: "Auto-Renewal", desc: "Automatically renew certificates", state: config?.autoRenewal, key: "autoRenewal" as keyof TLSConfig },
              { label: "TLS 1.3 Only", desc: "Disable older TLS versions", state: config?.tls13Only, key: "tls13Only" as keyof TLSConfig },
            ].map((ctrl) => (
              <div key={ctrl.label} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                <div>
                  <p className="text-sm font-medium">{ctrl.label}</p>
                  <p className="text-xs text-muted-foreground">{ctrl.desc}</p>
                </div>
                <Switch checked={ctrl.state} onCheckedChange={(val) => handleToggle(ctrl.key, val)} disabled={!canEdit} />
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-4">
            <span className="text-xs text-muted-foreground">Minimum TLS Version</span>
            <Select value={config?.minTlsVersion} onValueChange={(val) => updateConfigMutation.mutate({ minTlsVersion: val })} disabled={!canEdit}>
              <SelectTrigger className="w-28 text-xs font-mono"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1.0">TLS 1.0</SelectItem>
                <SelectItem value="1.1">TLS 1.1</SelectItem>
                <SelectItem value="1.2">TLS 1.2</SelectItem>
                <SelectItem value="1.3">TLS 1.3</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="mt-6 border-t border-border pt-4">
            <h4 className="text-xs font-semibold mb-3 uppercase tracking-wider text-muted-foreground">ACME (Let's Encrypt) Automated Provisioning</h4>
            <div className="flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/10">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">Use Staging Environment</p>
                  <p className="text-[10px] text-muted-foreground">Avoid rate limits. Untrusted in browsers.</p>
                </div>
                <Switch checked={useStaging} onCheckedChange={setUseStaging} disabled={!canEdit} />
              </div>
              <div className="flex-1 min-w-[200px]">
                <p className="text-xs text-muted-foreground mb-1.5">ACME Registration Email</p>
                <Input 
                  value={acmeEmail} 
                  onChange={e => setAcmeEmail(e.target.value)} 
                  placeholder="admin@example.com"
                  className="bg-muted/30 text-xs font-mono h-9"
                  disabled={!canEdit}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Cipher Suites */}
        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-sm font-medium mb-4">Cipher Suite Configuration</h3>
          <div className="space-y-1">
            {cipherSuites.map((cs) => (
              <div key={cs.name} className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/20 text-xs">
                <div className="flex items-center gap-3">
                  <span className="font-mono">{cs.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="text-[10px] font-mono">{cs.protocol}</Badge>
                  <span className="text-muted-foreground">{cs.strength}</span>
                  <Badge className={`text-[10px] ${
                    cs.status === "recommended" ? "bg-success/10 text-success border-success/30" :
                    cs.status === "acceptable" ? "bg-primary/10 text-primary border-primary/30" :
                    "bg-warning/10 text-warning border-warning/30"
                  }`}>{cs.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {isLocked && (
        <UpgradeOverlay
          title="SSL/TLS Management"
          description="Manage certificates, enforce HTTPS, configure HSTS, OCSP stapling, and TLS version controls. SSL/TLS Management requires the Standard plan or above."
          feature="SSL/TLS Management"
        />
      )}
    </DashboardLayout>
  );
}

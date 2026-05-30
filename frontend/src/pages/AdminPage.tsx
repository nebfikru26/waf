import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Shield, UserCog, Loader2, CreditCard, Save, Globe, Lock, ShieldCheck, Zap, Bot, Plus, ShieldAlert, Key, UserX, Activity, Eye, History, Bell, BarChart3, Settings, Mail, Phone, Trash2, EyeOff, ArrowRight, Building2, Server, RefreshCw, Scale, Gavel } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useToast } from "@/hooks/use-toast";
import { useAuth, type Role } from "@/hooks/use-auth";
import { CmsManager } from "@/components/CmsManager";
import { WafEngineManager } from "@/components/WafEngineManager";
import { ComplianceCenter } from "@/components/ComplianceCenter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNavigate } from "react-router-dom";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: Role;
  tenantId: string;
}

interface PlanConfig {
  id: string;
  name: string;
  maxDomains: number;
  hasWafDetection: boolean;
  hasWafBlocking: boolean;
  hasApiProtection: boolean;
  hasBotProtection: boolean;
  hasDdosProtection: boolean;
  hasAccountTakeover: boolean;
  hasRateLimiting: boolean;
  hasSslManagement: boolean;
  hasThreatIntel: boolean;
  hasAttackLogs: boolean;
  hasNotifications: boolean;
  hasAnalytics: boolean;
  priceEtb: number;
  isActive: boolean;
}

interface SystemConfig {
  id: number;
  salesContactEmail: string;
  salesContactPhone: string;
  supportEmail: string;
  crsRulesRepositoryUrl?: string;
}

interface Tenant {
  id: string;
  name: string;
  industry: string;
  contactEmail: string;
  contactPhone: string;
}

export default function AdminPage() {
  const { user, isLoading } = useAuth();
  const isPlatformAdmin = user?.role === "super_admin" || user?.role === "admin" || user?.role === "support_engineer";
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("plans");

  const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
  const headers = {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json"
  };

  // --- Plans Logic ---
  const { data: plans, isLoading: isLoadingPlans } = useQuery<PlanConfig[]>({
    queryKey: ["admin-plans"],
    queryFn: () => fetch("/api/plans", { headers }).then(r => r.json()),
    enabled: isPlatformAdmin
  });

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newPlanName, setNewPlanName] = useState("");
  const [newPlanPrice, setNewPlanPrice] = useState(0);

  const [editingPlan, setEditingPlan] = useState<PlanConfig | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const { data: sysConfig, isLoading: isLoadingConfig } = useQuery<SystemConfig>({
    queryKey: ["admin-sys-config"],
    queryFn: () => fetch("/api/platform/config", { headers }).then(r => r.json()),
    enabled: isPlatformAdmin
  });

  const { data: tenants, isLoading: isLoadingTenants } = useQuery<Tenant[]>({
    queryKey: ["admin-tenants"],
    queryFn: () => fetch("/api/admin/tenants", { headers }).then(r => r.json()),
    enabled: isPlatformAdmin
  });

  const impersonateTenant = useMutation({
    mutationFn: async (tenantId: string) => {
      const res = await fetch(`/api/admin/impersonate/${tenantId}`, {
        method: "POST",
        headers,
      });
      if (!res.ok) throw new Error("Failed to impersonate tenant");
      return res.json();
    },
    onSuccess: (data) => {
      // Apply the impersonated token to local storage and force reload
      localStorage.setItem("auth_token", data.token);
      toast({ title: "Impersonation Active", description: "You are now managing the selected organization." });
      window.location.href = "/";
    },
    onError: (error: any) => {
      toast({ title: "Impersonation Failed", description: error.message, variant: "destructive" });
    }
  });

  const updatePlan = useMutation({
    mutationFn: async (plan: PlanConfig) => {
      const res = await fetch(`/api/plans/${plan.id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(plan),
      });
      if (!res.ok) throw new Error("Failed to update plan");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-plans"] });
      toast({ title: "Plan Synchronized", description: "All entitlements and limits have been updated." });
      setIsEditDialogOpen(false);
    },
  });

  const createPlan = useMutation({
    mutationFn: async ({ name, priceEtb }: { name: string, priceEtb: number }) => {
      const newPlan: Partial<PlanConfig> = {
        name,
        maxDomains: 5,
        priceEtb,
        hasWafDetection: true,
        isActive: true,
      };
      const res = await fetch("/api/plans", {
        method: "POST",
        headers,
        body: JSON.stringify(newPlan),
      });
      if (!res.ok) throw new Error("Failed to create plan");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-plans"] });
      toast({ title: "New Plan Created", description: "You can now configure its specific features." });
      setIsCreateDialogOpen(false);
      setNewPlanName("");
      setNewPlanPrice(0);
    },
  });

  const deletePlan = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/plans/${id}`, { method: "DELETE", headers });
      if (!res.ok) throw new Error("Failed to delete plan");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-plans"] });
      toast({ title: "Plan Retired", description: "The service tier has been permanently removed." });
    },
  });

  const updateConfig = useMutation({
    mutationFn: async (config: SystemConfig) => {
      const res = await fetch("/api/platform/config", {
        method: "PUT",
        headers,
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error("Failed to update platform settings");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-sys-config"] });
      toast({ title: "Platform Synchronized", description: "Global contact settings have been applied." });
    },
  });

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!user || !isPlatformAdmin) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
          <div className="h-16 w-16 bg-destructive/10 rounded-full flex items-center justify-center">
            <Lock className="h-8 w-8 text-destructive" />
          </div>
          <div className="text-center">
            <h2 className="text-xl font-bold">Access Restricted</h2>
            <p className="text-muted-foreground">This terminal requires Super Admin or Support Engineer credentials.</p>
          </div>
          <Button variant="outline" onClick={() => navigate("/")}>RETURN TO SAFETY</Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2 text-primary font-mono uppercase tracking-tighter">
            <Shield className="h-5 w-5" /> Super Admin Control Center
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Global platform management and product entitlement settings</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="bg-muted/50 border border-border p-1 gap-1">
            <TabsTrigger value="plans" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <CreditCard className="h-4 w-4 mr-2" /> Products & Plans
            </TabsTrigger>
            <TabsTrigger value="organizations" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Building2 className="h-4 w-4 mr-2" /> Organizations
            </TabsTrigger>
            <TabsTrigger value="engine" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Server className="h-4 w-4 mr-2" /> WAF Engine
            </TabsTrigger>
            <TabsTrigger value="cms" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Globe className="h-4 w-4 mr-2" /> CMS & Content
            </TabsTrigger>
            <TabsTrigger value="intelligence" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <ShieldCheck className="h-4 w-4 mr-2" /> WAF Intelligence
            </TabsTrigger>
            <TabsTrigger value="compliance" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Scale className="h-4 w-4 mr-2" /> Compliance
            </TabsTrigger>
            <TabsTrigger value="config" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Settings className="h-4 w-4 mr-2" /> Platform Settings
            </TabsTrigger>
          </TabsList>

          {/* 1. Plans */}
          <TabsContent value="plans" className="pt-4 space-y-6">
            <div className="flex justify-between items-center bg-muted/20 p-5 rounded-xl border border-dashed border-border shadow-inner">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Zap className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-bold">Subscription Architecture</p>
                  <p className="text-xs text-muted-foreground">Manage service tiers, pricing, and functional entitlements.</p>
                </div>
              </div>

              <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="glow-primary font-mono text-xs">
                    <Plus className="h-4 w-4 mr-2" /> ADD NEW TIER
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                  <DialogHeader>
                    <DialogTitle>Provision New Asset</DialogTitle>
                    <DialogDescription>
                      Define a new service tier for the platform. You can configure entitlements after creation.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="plan-name">Tier Label</Label>
                      <Input
                        id="plan-name"
                        placeholder="e.g. Business Pro"
                        value={newPlanName}
                        onChange={e => setNewPlanName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="plan-price">Base Monthly Price (ETB)</Label>
                      <Input
                        id="plan-price"
                        type="number"
                        placeholder="0"
                        value={newPlanPrice}
                        onChange={e => setNewPlanPrice(parseFloat(e.target.value))}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>CANCEL</Button>
                    <Button onClick={() => createPlan.mutate({ name: newPlanName, priceEtb: newPlanPrice })}>CREATE TIER</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {isLoadingPlans ? (
                <div className="flex justify-center py-12 lg:col-span-2"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
              ) : (
                Array.isArray(plans) && plans.map((p) => (
                  <div key={p.id} className="bg-card border border-border rounded-xl p-6 space-y-5 shadow-sm relative overflow-hidden flex flex-col group hover:border-primary/40 transition-all">
                    {p.name === 'Enterprise' && (
                      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 blur-[60px] rounded-full -mr-16 -mt-16 pointer-events-none" />
                    )}
                    <div className="flex items-center justify-between z-10">
                      <div className="flex items-center gap-3">
                        <CreditCard className={`h-4 w-4 ${p.name === 'Enterprise' ? 'text-primary' : 'text-muted-foreground'}`} />
                        <div>
                          <h3 className="text-lg font-bold flex items-center gap-2">
                            {p.name}
                            {!p.isActive && <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded border border-border uppercase">Disabled</span>}
                          </h3>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-primary"
                          title="View & Edit Details" onClick={() => { setEditingPlan({ ...p }); setIsEditDialogOpen(true); }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                          title="Permanently Delete Tier" onClick={() => { if (confirm(`Are you sure?`)) deletePlan.mutate(p.id); }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 z-10">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1"><Globe className="h-3 w-3" /> Max Domains</label>
                        <p className="font-mono text-sm">{p.maxDomains}</p>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase">Price (ETB / Month)</label>
                        <p className="font-mono text-sm">{p.priceEtb.toLocaleString()} ETB</p>
                      </div>
                    </div>
                    <div className="space-y-3 pt-2 flex-1">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border/50 pb-1">Enabled Entitlements</p>
                      <div className="flex flex-wrap gap-1.5">
                        {p.hasWafDetection && <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-primary/20 uppercase font-mono">WAF</span>}
                        {p.hasApiProtection && <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-primary/20 uppercase font-mono">API</span>}
                        {p.hasBotProtection && <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-primary/20 uppercase font-mono">BOT</span>}
                        {p.hasDdosProtection && <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-primary/20 uppercase font-mono">DDOS</span>}
                        {p.hasAnalytics && <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-primary/20 uppercase font-mono">Analytics</span>}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Edit Plan Dialog (Abbreviated for brevity, keep existing logic) */}
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
              <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-primary" /> Edit Subscription Tier: {editingPlan?.name}
                  </DialogTitle>
                </DialogHeader>
                {editingPlan && (
                  <div className="space-y-6 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2"><Label>Tier Name</Label><Input value={editingPlan.name} onChange={e => setEditingPlan({ ...editingPlan, name: e.target.value })} /></div>
                      <div className="space-y-2"><Label>Monthly Price (ETB)</Label><Input type="number" value={editingPlan.priceEtb} onChange={e => setEditingPlan({ ...editingPlan, priceEtb: parseFloat(e.target.value) })} /></div>
                      <div className="space-y-2"><Label>Maximum Domains</Label><Input type="number" value={editingPlan.maxDomains} onChange={e => setEditingPlan({ ...editingPlan, maxDomains: parseInt(e.target.value) })} /></div>
                    </div>
                    <div className="space-y-3">
                      <Label className="text-xs font-bold uppercase tracking-widest text-primary">Service Entitlements</Label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {[
                          { id: 'hasWafDetection', label: 'WAF rules (Detection)', icon: ShieldCheck },
                          { id: 'hasWafBlocking', label: 'OWASP Protection (Blocking)', icon: ShieldAlert },
                          { id: 'hasApiProtection', label: 'API Protection Shield', icon: Key },
                          { id: 'hasBotProtection', label: 'Bot Intelligence', icon: Bot },
                          { id: 'hasDdosProtection', label: 'L7 DDoS Defense Shield', icon: Zap },
                          { id: 'hasAccountTakeover', label: 'Account Takeover Protect', icon: UserX },
                          { id: 'hasRateLimiting', label: 'Rate Limiting Engine', icon: Activity },
                          { id: 'hasSslManagement', label: 'SSL/TLS Multi-Domain', icon: Lock },
                          { id: 'hasThreatIntel', label: 'Advanced Threat Intel', icon: Eye },
                          { id: 'hasAttackLogs', label: 'Real-time Security Logs', icon: History },
                          { id: 'hasNotifications', label: 'Global Notifications', icon: Bell },
                          { id: 'hasAnalytics', label: 'Real-Time Analytics', icon: BarChart3 },
                        ].map((svc) => (
                          <div key={svc.id} className="flex items-center space-x-2 p-2 rounded-md border bg-muted/10 hover:bg-muted/20">
                            <Checkbox id={`edit-${svc.id}`} checked={(editingPlan as any)[svc.id]} onCheckedChange={(checked) => setEditingPlan({ ...editingPlan, [svc.id]: !!checked })} />
                            <label htmlFor={`edit-${svc.id}`} className="text-xs font-medium cursor-pointer flex items-center gap-2"><svc.icon className="h-3.5 w-3.5 text-primary" /> {svc.label}</label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>CANCEL</Button>
                  <Button className="glow-primary" onClick={() => updatePlan.mutate(editingPlan!)} disabled={updatePlan.isPending}>
                    {updatePlan.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />} SAVE PLAN CHANGES
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* 2. Organizations */}
          <TabsContent value="organizations" className="pt-4 space-y-6">
            <div className="flex justify-between items-center bg-muted/20 p-5 rounded-xl border border-dashed border-border shadow-inner">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center"><Building2 className="h-5 w-5 text-primary" /></div>
                <div>
                  <p className="text-sm font-bold">Tenant Management Directory</p>
                  <p className="text-xs text-muted-foreground">Monitor platform tenants and impersonate organization admins for direct assistance.</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {isLoadingTenants ? (
                <div className="flex justify-center py-12 lg:col-span-3"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
              ) : (
                Array.isArray(tenants) && tenants.map((t) => (
                  <div key={t.id} className="bg-card border border-border rounded-xl p-5 space-y-4 shadow-sm hover:border-primary/40 transition-all flex flex-col">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 bg-muted/50 rounded flex items-center justify-center text-xl font-bold text-primary">{(t.name && t.name.length > 0) ? t.name.charAt(0).toUpperCase() : "?"}</div>
                      <div className="overflow-hidden"><h3 className="font-bold text-sm truncate">{t.name || "Unnamed Organization"}</h3><p className="text-[10px] text-muted-foreground uppercase font-mono tracking-widest truncate">{t.industry || "Unknown Industry"}</p></div>
                    </div>
                    <div className="space-y-2 py-2 border-y border-border/50 flex-1">
                      <div className="flex items-center gap-2 text-xs"><Mail className="h-3 w-3 text-muted-foreground" /><span className="truncate">{t.contactEmail || "N/A"}</span></div>
                      <div className="flex items-center gap-2 text-xs"><Phone className="h-3 w-3 text-muted-foreground" /><span className="truncate">{t.contactPhone || "N/A"}</span></div>
                    </div>
                    <div className="pt-2">
                      <Button variant="outline" size="sm" className="w-full text-xs font-mono font-bold" onClick={() => impersonateTenant.mutate(t.id)} disabled={impersonateTenant.isPending}>
                        {impersonateTenant.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <Eye className="h-3 w-3 mr-2" />} IMPERSONATE TENANT
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </TabsContent>

          {/* 3. WAF Engine */}
          <TabsContent value="engine">
            <WafEngineManager />
          </TabsContent>

          {/* 4. CMS */}
          <TabsContent value="cms" className="pt-4">
            <CmsManager />
          </TabsContent>

          {/* 5. Intelligence */}
          <TabsContent value="intelligence" className="pt-4">
            <div className="bg-card border border-border rounded-xl p-8 text-center space-y-4">
              <div className="h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto"><Activity className="h-8 w-8 text-primary" /></div>
              <div><h3 className="text-lg font-bold">Comprehensive CRS Analytics</h3><p className="text-sm text-muted-foreground max-w-md mx-auto">Access deep-dive inspection metrics across the platform.</p></div>
              <Button className="glow-primary h-12 px-8 font-bold" onClick={() => navigate("/crs-dashboard")}>OPEN SECURITY INTELLIGENCE HUB <ArrowRight className="h-4 w-4 ml-2" /></Button>
            </div>
          </TabsContent>

          {/* 5. Compliance */}
          <TabsContent value="compliance" className="pt-4 space-y-6">
            <ComplianceCenter />
          </TabsContent>

          {/* 6. Settings */}
          <TabsContent value="config" className="pt-4 max-w-2xl">
            <div className="bg-card border border-border rounded-xl p-6 space-y-6 shadow-sm">
              <div><h3 className="text-lg font-bold">Platform Configuration</h3><p className="text-xs text-muted-foreground mt-1">Manage global support and security update sources.</p></div>
              {isLoadingConfig ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2"><label className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1.5 font-mono"><Mail className="h-3.5 w-3.5" /> Sales Email</label><Input value={sysConfig?.salesContactEmail} onChange={e => queryClient.setQueryData(["admin-sys-config"], { ...sysConfig, salesContactEmail: e.target.value })} className="bg-muted/30 font-mono text-sm" /></div>
                  <div className="space-y-2"><label className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1.5 font-mono"><Phone className="h-3.5 w-3.5" /> Sales Phone</label><Input value={sysConfig?.salesContactPhone} onChange={e => queryClient.setQueryData(["admin-sys-config"], { ...sysConfig, salesContactPhone: e.target.value })} className="bg-muted/30 font-mono text-sm" /></div>
                  <div className="space-y-2"><label className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1.5 font-mono"><Shield className="h-3.5 w-3.5" /> Tech Support</label><Input value={sysConfig?.supportEmail} onChange={e => queryClient.setQueryData(["admin-sys-config"], { ...sysConfig, supportEmail: e.target.value })} className="bg-muted/30 font-mono text-sm" /></div>
                  <div className="space-y-2 pt-2 border-t border-border/50">
                    <label className="text-[10px] font-bold text-primary uppercase flex items-center gap-1.5 font-mono">
                      <RefreshCw className="h-3.5 w-3.5" /> OWASP CRS Repository (ZIP Archive)
                    </label>
                    <Input
                      value={sysConfig?.crsRulesRepositoryUrl}
                      onChange={e => queryClient.setQueryData(["admin-sys-config"], { ...sysConfig, crsRulesRepositoryUrl: e.target.value })}
                      className="bg-primary/5 font-mono text-[11px] border-primary/20"
                      placeholder="https://github.com/coreruleset/coreruleset/archive/refs/heads/main.zip"
                    />
                    <p className="text-[10px] text-muted-foreground italic">Update this link if the official OWASP repository moves or you wish to use a specific version.</p>
                  </div>
                  <div className="pt-6 border-t border-border/50"><Button className="glow-primary font-mono text-xs w-full" onClick={() => updateConfig.mutate(sysConfig!)} disabled={updateConfig.isPending}>{updateConfig.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />} SAVE PLATFORM CONFIG</Button></div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

import { useState } from "react";
import {
  CreditCard, CheckCircle2, Loader2, ArrowRight, Mail, Phone, ExternalLink,
  ShieldCheck, XCircle, TrendingDown, Zap, Shield, Bot, Key, UserX, Globe,
  Lock, Eye, Bell, BarChart3, Activity, ShieldAlert
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "react-router-dom";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

interface SubscriptionData {
  id: string; tenantId: string; planName: string; status: string; gateway: string;
}

interface PlanConfig {
  id: string; name: string; maxDomains: number;
  hasWafDetection: boolean; hasWafBlocking: boolean; hasApiProtection: boolean;
  hasBotProtection: boolean; hasDdosProtection: boolean; hasAccountTakeover: boolean;
  hasRateLimiting: boolean; hasSslManagement: boolean; hasThreatIntel: boolean;
  hasAttackLogs: boolean; hasNotifications: boolean; hasAnalytics: boolean;
  priceEtb: number; isActive: boolean;
}

interface SystemConfig { salesContactEmail: string; salesContactPhone: string; }

// Industry-standard feature groups (OWASP/NIST aligned)
const FEATURE_GROUPS = [
  {
    title: "Core Protection",
    desc: "Foundational WAF defenses against OWASP Top 10",
    features: [
      { id: "hasWafDetection", label: "WAF Rules (Detection)", icon: ShieldCheck, desc: "Detect SQLi, XSS, LFI, RCE patterns" },
      { id: "hasWafBlocking", label: "OWASP Protection (Blocking)", icon: ShieldAlert, desc: "Active blocking of confirmed threats" },
      { id: "hasRateLimiting", label: "Rate Limiting Engine", icon: Activity, desc: "Per-IP and global rate enforcement" },
    ]
  },
  {
    title: "Advanced Threat Defense",
    desc: "L7 attack mitigation and intelligent bot management",
    features: [
      { id: "hasDdosProtection", label: "L7 DDoS Defense Shield", icon: Zap, desc: "Layer-7 volumetric flood mitigation" },
      { id: "hasBotProtection", label: "Bot Intelligence", icon: Bot, desc: "Behavioral bot scoring and JS challenge" },
      { id: "hasAccountTakeover", label: "Account Takeover Protect", icon: UserX, desc: "ATO and credential stuffing defense" },
      { id: "hasApiProtection", label: "API Protection Shield", icon: Key, desc: "Schema validation and endpoint control" },
    ]
  },
  {
    title: "Infrastructure & Compliance",
    desc: "SSL/TLS management and multi-domain infrastructure",
    features: [
      { id: "hasSslManagement", label: "SSL/TLS Multi-Domain", icon: Lock, desc: "Auto-renewing certificates per domain" },
      { id: "hasThreatIntel", label: "Advanced Threat Intel", icon: Eye, desc: "Global IOC feeds and reputation scoring" },
    ]
  },
  {
    title: "Visibility & Operations",
    desc: "Logs, alerts, and real-time analytics",
    features: [
      { id: "hasAttackLogs", label: "Real-time Security Logs", icon: Shield, desc: "Streaming attack event capture" },
      { id: "hasNotifications", label: "Global Notifications", icon: Bell, desc: "Email/webhook alert delivery" },
      { id: "hasAnalytics", label: "Real-Time Analytics", icon: BarChart3, desc: "Traffic insights and threat dashboards" },
    ]
  },
];

const PLAN_BADGE: Record<string, { color: string; label: string }> = {
  Free:         { color: "bg-muted/60 text-muted-foreground border border-border", label: "Free Trial" },
  Professional: { color: "bg-sky-500/15 text-sky-400 border border-sky-500/30", label: "Professional" },
  Enterprise:   { color: "bg-amber-400/15 text-amber-400 border border-amber-400/30", label: "Enterprise" },
};

const PLAN_ORDER = ["Free", "Professional", "Enterprise"];

export default function BillingPage() {
  const { toast } = useToast();
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [checkoutPlan, setCheckoutPlan] = useState<PlanConfig | null>(null);
  const [confirmDowngrade, setConfirmDowngrade] = useState<PlanConfig | null>(null);
  const [isContactSalesOpen, setIsContactSalesOpen] = useState(false);
  const isPlatformAdmin = user?.role === "super_admin" || user?.role === "admin" || user?.role === "support_engineer";
  const authHeaders = { "Content-Type": "application/json" };

  const { data: subs = [], isLoading: isLoadingSubs } = useQuery<SubscriptionData[]>({
    queryKey: ["billing"],
    queryFn: () => fetch("/api/billing", { headers: authHeaders }).then(r => r.json()),
  });

  const { data: plans = [], isLoading: isLoadingPlans } = useQuery<PlanConfig[]>({
    queryKey: ["plans"],
    queryFn: () => fetch("/api/plans", { headers: authHeaders }).then(r => r.json()),
  });

  const { data: sysConfig } = useQuery<SystemConfig>({
    queryKey: ["sys-config"],
    queryFn: () => fetch("/api/platform/config", { headers: authHeaders }).then(r => r.json()),
  });

  const checkoutMutation = useMutation({
    mutationFn: async ({ planName, gateway }: { planName: string; gateway: string }) => {
      const res = await fetch("/api/billing/checkout", {
        method: "POST", headers: authHeaders,
        body: JSON.stringify({ planName, gateway }),
      });
      if (!res.ok) throw new Error("Payment initialization failed");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["billing"] });
      refreshUser();
      toast({ title: "Subscription Activated!", description: data.message || "Your plan has been upgraded." });
      setCheckoutPlan(null);
      setConfirmDowngrade(null);
    },
    onError: (err: any) => toast({ title: "Payment Error", description: err.message, variant: "destructive" }),
  });

  const safeSubs = Array.isArray(subs) ? subs : [];
  const safePlans = Array.isArray(plans) ? plans : [];
  const currentPlan = safeSubs.length > 0 ? safeSubs[safeSubs.length - 1] : null;
  const currentPlanDef = safePlans.find(p => p.name === currentPlan?.planName);
  const sortedActivePlans = [...safePlans]
    .filter(p => p.isActive)
    .sort((a, b) => PLAN_ORDER.indexOf(a.name) - PLAN_ORDER.indexOf(b.name));

  const getPlanRelation = (planName: string): "current" | "upgrade" | "downgrade" | "free" => {
    if (!currentPlan) return planName === "Free" ? "current" : "upgrade";
    const curr = PLAN_ORDER.indexOf(currentPlan.planName);
    const target = PLAN_ORDER.indexOf(planName);
    if (curr === target) return "current";
    if (planName === "Free") return "free";
    return target > curr ? "upgrade" : "downgrade";
  };

  if (isPlatformAdmin) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center py-24 gap-6 text-center max-w-md mx-auto">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <ShieldCheck className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Platform Administrator</h1>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              Billing is managed by client organizations. Use the <strong>Admin Center</strong> to configure plans and pricing.
            </p>
          </div>
          <Button className="glow-primary font-mono text-xs" onClick={() => navigate("/admin")}>
            <ShieldCheck className="h-4 w-4 mr-2" /> OPEN ADMIN CENTER
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" /> Billing & Subscriptions
          </h1>
          <p className="text-sm text-muted-foreground">Manage your WAF capabilities and payment in ETB.</p>
        </div>

        {/* Current Plan */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-sm font-semibold mb-4">Current Subscription</h3>
          {isLoadingSubs ? (
            <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</div>
          ) : currentPlan ? (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 border border-primary/20 bg-primary/5 rounded-lg">
              <div>
                <p className="font-bold text-lg text-primary">{currentPlan.planName} Tier</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs bg-success/20 text-success px-2 py-0.5 rounded font-mono uppercase">{currentPlan.status}</span>
                  <span className="text-xs font-mono text-muted-foreground">via {currentPlan.gateway}</span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Monthly price</p>
                <p className="font-mono text-sm font-bold">ETB {currentPlanDef?.priceEtb?.toLocaleString() ?? "—"}</p>
              </div>
            </div>
          ) : (
            <div className="p-4 border border-dashed border-border rounded-lg text-center text-muted-foreground">
              <p className="text-sm">You are on the <strong>Free Trial</strong>. Upgrade to activate security features.</p>
            </div>
          )}

          {/* Active Features Summary */}
          {currentPlanDef && (
            <div className="mt-5 pt-4 border-t border-border/50">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Active Security Features</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {FEATURE_GROUPS.flatMap(g => g.features).map(f => {
                  const active = (currentPlanDef as any)[f.id];
                  return (
                    <div key={f.id} className={`flex items-center gap-1.5 text-[10px] font-mono ${active ? "text-primary" : "text-muted-foreground/40"}`}>
                      {active ? <CheckCircle2 className="h-3 w-3 shrink-0" /> : <XCircle className="h-3 w-3 shrink-0" />}
                      {f.label}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Pricing Tiers */}
        <div>
          <h3 className="text-sm font-semibold mb-4">Available Tiers</h3>
          {isLoadingPlans ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {sortedActivePlans.map(p => {
                const relation = getPlanRelation(p.name);
                const badge = PLAN_BADGE[p.name];
                const isCurrent = relation === "current";
                const isDowngrade = relation === "downgrade";
                const isProfessional = p.name === "Professional";

                return (
                  <div 
                    key={p.id} 
                    className={`bg-card border ${
                      isCurrent 
                        ? "border-primary ring-2 ring-primary/20" 
                        : isProfessional 
                          ? "border-primary/40 shadow-lg shadow-primary/5" 
                          : "border-border hover:border-border-hover transition-colors"
                    } rounded-2xl p-6 flex flex-col relative overflow-hidden transition-all duration-300`}
                  >
                    {/* Professional Badge */}
                    {isProfessional && !isCurrent && (
                      <div className="absolute top-0 right-0">
                        <div className="bg-primary text-primary-foreground text-[10px] font-bold px-3 py-1 rounded-bl-xl uppercase tracking-tighter">
                          Best Value
                        </div>
                      </div>
                    )}

                    {badge && !isCurrent && !isProfessional && (
                      <div className={`absolute top-4 right-4 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${badge.color}`}>
                        {badge.label}
                      </div>
                    )}

                    {isCurrent && (
                      <div className="absolute top-4 right-4 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase bg-primary/20 text-primary border border-primary/30">
                        Active
                      </div>
                    )}

                    <div className="mb-6">
                      <h4 className="text-lg font-bold tracking-tight">{p.name}</h4>
                      <div className="mt-2 flex items-baseline gap-1">
                        <span className="text-3xl font-bold font-mono tracking-tighter text-foreground">ETB {p.priceEtb.toLocaleString()}</span>
                        <span className="text-muted-foreground text-xs font-medium">/mo</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2 font-medium opacity-80">
                        {p.maxDomains === 999 ? "Unlimited domains" : `${p.maxDomains} domain${p.maxDomains !== 1 ? "s" : ""}`} included
                      </p>
                    </div>

                    {/* Feature Groups */}
                    <div className="space-y-6 flex-1 mb-8">
                      {FEATURE_GROUPS.map(group => {
                        const enabledInThisPlan = group.features.filter(f => (p as any)[f.id]);
                        if (enabledInThisPlan.length === 0) return null;

                        return (
                          <div key={group.title} className="space-y-2.5">
                            <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-primary/80">
                              {group.title}
                            </p>
                            <div className="space-y-2">
                              {group.features.map(f => {
                                const enabled = (p as any)[f.id];
                                if (!enabled) return null; // Only show enabled features for cleaner cards
                                return (
                                  <div key={f.id} className="flex items-start gap-2.5 text-xs group/feat">
                                    <div className="mt-0.5 p-0.5 rounded-full bg-primary/10 text-primary">
                                      <CheckCircle2 className="h-3 w-3 shrink-0" />
                                    </div>
                                    <span className="text-foreground/90 font-medium leading-tight">{f.label}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                      
                      {/* Show missing features as subtle list if it's not the top plan */}
                      {p.name !== "Enterprise" && (
                         <div className="pt-2 border-t border-border/40">
                            <p className="text-[9px] font-bold text-muted-foreground/50 uppercase mb-2">Missing Features</p>
                            <div className="space-y-1 opacity-40">
                               {FEATURE_GROUPS.flatMap(g => g.features)
                                 .filter(f => !(p as any)[f.id])
                                 .slice(0, 3)
                                 .map(f => (
                                   <div key={f.id} className="flex items-center gap-2 text-[10px] grayscale">
                                      <XCircle className="h-2.5 w-2.5" />
                                      <span>{f.label}</span>
                                   </div>
                                 ))
                               }
                               {FEATURE_GROUPS.flatMap(g => g.features).filter(f => !(p as any)[f.id]).length > 3 && (
                                 <p className="text-[9px] italic ml-4 text-muted-foreground/60">+ more enterprise features</p>
                               )}
                            </div>
                         </div>
                      )}
                    </div>

                    <Button
                      className={`w-full font-mono text-[10px] h-10 tracking-widest ${
                        isCurrent 
                          ? "bg-muted text-muted-foreground border-border" 
                          : isProfessional || p.name === "Enterprise"
                            ? "glow-primary font-bold" 
                            : "bg-secondary hover:bg-secondary/80 text-secondary-foreground"
                      }`}
                      variant={isCurrent ? "outline" : isDowngrade ? "outline" : "default"}
                      disabled={isCurrent || p.name === "Free"}
                      onClick={() => {
                        if (p.name === "Custom") { setIsContactSalesOpen(true); return; }
                        if (isDowngrade) { setConfirmDowngrade(p); return; }
                        setCheckoutPlan(p);
                      }}
                    >
                      {isCurrent ? (
                        <><CheckCircle2 className="h-3.5 w-3.5 mr-2" /> CURRENT PLAN</>
                      ) : isDowngrade ? (
                        <><TrendingDown className="h-3.5 w-3.5 mr-2" /> DOWNGRADE</>
                      ) : p.name === "Custom" ? (
                        <><ExternalLink className="h-3.5 w-3.5 mr-2" /> CONTACT SALES</>
                      ) : p.name === "Free" ? (
                        "FREE PLAN"
                      ) : (
                        <><Zap className="h-3.5 w-3.5 mr-2" /> UPGRADE NOW</>
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>


        {/* Checkout Modal */}
        <Dialog open={!!checkoutPlan} onOpenChange={(o) => !o && setCheckoutPlan(null)}>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle>Upgrade to {checkoutPlan?.name}</DialogTitle>
              <DialogDescription>Complete your payment via Ethiopian payment gateway.</DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg text-sm">
                You are upgrading to <strong className="text-primary">{checkoutPlan?.name}</strong> — ETB {checkoutPlan?.priceEtb?.toLocaleString()}/month.
                All security features included in this plan will be <strong>immediately activated</strong>.
              </div>
              {[
                { label: "Telebirr", color: "green", letter: "T" },
                { label: "Chapa", color: "blue", letter: "C" },
              ].map(gw => (
                <Button key={gw.label} variant="outline"
                  className={`w-full h-14 flex items-center justify-between px-6 border-${gw.color}-600/30 hover:bg-${gw.color}-600/10 hover:border-${gw.color}-600`}
                  onClick={() => checkoutPlan && checkoutMutation.mutate({ planName: checkoutPlan.name, gateway: gw.label })}
                  disabled={checkoutMutation.isPending}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full bg-${gw.color}-500/20 flex items-center justify-center font-bold text-${gw.color}-500`}>{gw.letter}</div>
                    <span className="text-sm font-bold">Pay with {gw.label}</span>
                  </div>
                  {checkoutMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                </Button>
              ))}
            </div>
          </DialogContent>
        </Dialog>

        {/* Downgrade Confirm Modal */}
        <Dialog open={!!confirmDowngrade} onOpenChange={(o) => !o && setConfirmDowngrade(null)}>
          <DialogContent className="sm:max-w-[440px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-warning">
                <TrendingDown className="h-5 w-5" /> Confirm Downgrade
              </DialogTitle>
              <DialogDescription>
                Downgrading to <strong>{confirmDowngrade?.name}</strong> will immediately deactivate security features not included in that plan.
              </DialogDescription>
            </DialogHeader>
            <div className="py-3 space-y-3">
              {currentPlanDef && confirmDowngrade && (
                <div className="space-y-1.5 text-xs">
                  <p className="font-semibold text-destructive mb-2">Features that will be deactivated:</p>
                  {FEATURE_GROUPS.flatMap(g => g.features).filter(f =>
                    (currentPlanDef as any)[f.id] && !(confirmDowngrade as any)[f.id]
                  ).map(f => (
                    <div key={f.id} className="flex items-center gap-2 text-destructive/80">
                      <XCircle className="h-3 w-3 shrink-0" /> {f.label}
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setConfirmDowngrade(null)}>Cancel</Button>
                <Button variant="destructive" className="flex-1" disabled={checkoutMutation.isPending}
                  onClick={() => confirmDowngrade && checkoutMutation.mutate({ planName: confirmDowngrade.name, gateway: "Downgrade" })}>
                  {checkoutMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <TrendingDown className="h-4 w-4 mr-2" />}
                  Confirm Downgrade
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Contact Sales */}
        <Dialog open={isContactSalesOpen} onOpenChange={setIsContactSalesOpen}>
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><ExternalLink className="h-5 w-5 text-primary" /> Enterprise Consultation</DialogTitle>
              <DialogDescription>Our security team will design a custom infrastructure plan for you.</DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div className="p-4 bg-muted/30 rounded-lg border border-border space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center"><Mail className="h-4 w-4 text-primary" /></div>
                  <div>
                    <p className="text-[10px] uppercase font-bold text-muted-foreground">Sales Email</p>
                    <p className="text-sm font-mono">{sysConfig?.salesContactEmail || "sales@affinisecurity.io"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center"><Phone className="h-4 w-4 text-primary" /></div>
                  <div>
                    <p className="text-[10px] uppercase font-bold text-muted-foreground">Sales Phone</p>
                    <p className="text-sm font-mono">{sysConfig?.salesContactPhone || "+251 911 000 000"}</p>
                  </div>
                </div>
              </div>
              <Button className="w-full" variant="outline" onClick={() => setIsContactSalesOpen(false)}>Close</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}

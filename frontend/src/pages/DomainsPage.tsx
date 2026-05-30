import { useState, useEffect } from "react";
import {
  Globe, Plus, CheckCircle, Clock, Copy, X, Shield, Loader2,
  AlertCircle, Edit2, ChevronDown, ChevronRight, ArrowRight,
  Lock, Radio, RotateCcw, Terminal,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Domain {
  id: string;
  domain_name: string;
  origin_ip: string;
  ssl_mode: string;
  status: string;
  ssl_provisioned: boolean;
  dns_verified: boolean;
  under_attack_mode: boolean;
  force_https: boolean;
  protection_mode: string;
  sensitivity: number;
}

interface DnsRecord {
  type: string;
  host: string;
  value: string;
  ttl: string;
  purpose: string;
}

interface DnsInstructions {
  domain: string;
  records: DnsRecord[];
  verification_status: { dns_verified: boolean; ssl_provisioned: boolean };
  next_step: string;
}

// --- Wizard Step --- //
type WizardStep = 1 | 2 | 3;

const SSL_MODES = [
  {
    key: "Full",
    label: "Full (Strict)",
    desc: "Encrypts all the way to your origin with certificate validation. Most secure.",
    icon: "🔒",
    recommended: true,
  },
  {
    key: "Flexible",
    label: "Flexible",
    desc: "Encrypts traffic between visitors and WAF edge only. Origin can use HTTP.",
    icon: "🔐",
    recommended: false,
  },
  {
    key: "Off",
    label: "HTTP Only",
    desc: "No encryption. Traffic flows through the WAF without TLS termination.",
    icon: "⚠️",
    recommended: false,
  },
];

// Lifecycle step indicator
function DomainLifecycle({ domain }: { domain: Domain }) {
  const steps = [
    { label: "Added", done: true, icon: Globe },
    { label: "DNS Verified", done: domain.dns_verified, icon: Radio },
    { label: "SSL Active", done: domain.ssl_provisioned, icon: Lock },
    { label: "Protected", done: domain.dns_verified && domain.ssl_provisioned, icon: Shield },
  ];

  return (
    <div className="flex items-center gap-1 mt-3">
      {steps.map((step, i) => (
        <div key={step.label} className="flex items-center">
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono transition-all ${
            step.done
              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
              : "bg-muted/30 text-muted-foreground/50 border border-border"
          }`}>
            <step.icon className="h-2.5 w-2.5" />
            {step.label}
          </div>
          {i < steps.length - 1 && (
            <ChevronRight className={`h-3 w-3 mx-0.5 shrink-0 ${step.done ? "text-emerald-500/50" : "text-border"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// Expandable per-domain DNS instruction panel
function DomainDNSPanel({ domain }: { domain: Domain }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [instructions, setInstructions] = useState<DnsInstructions | null>(null);

  const load = async () => {
    if (instructions) { setOpen(!open); return; }
    setLoading(true);
    try {
      const token = (localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token")) || sessionStorage.getItem("auth_token");
      const res = await fetch(`/api/domains/${domain.id}/dns-instructions`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) setInstructions(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
    setOpen(true);
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  const recordColors: Record<string, string> = {
    CNAME: "text-blue-400 border-blue-400/30 bg-blue-400/5",
    A:     "text-purple-400 border-purple-400/30 bg-purple-400/5",
    TXT:   "text-amber-400 border-amber-400/30 bg-amber-400/5",
  };

  return (
    <div className="mt-2">
      <button
        onClick={load}
        className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground hover:text-primary transition-colors"
      >
        {loading ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : open ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        DNS Setup Instructions
      </button>

      {open && instructions && (
        <div className="mt-3 border border-border/60 rounded-lg overflow-hidden">
          {/* Next step banner */}
          <div className={`px-4 py-2.5 border-b border-border/60 flex items-start gap-2 text-xs ${
            domain.dns_verified && domain.ssl_provisioned
              ? "bg-emerald-500/10 text-emerald-400"
              : "bg-amber-500/10 text-amber-400"
          }`}>
            {domain.dns_verified && domain.ssl_provisioned
              ? <CheckCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              : <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            }
            <span>{instructions.next_step}</span>
          </div>

          {/* DNS records table */}
          <div className="divide-y divide-border/40">
            {instructions.records.map((rec) => (
              <div key={rec.type + rec.host} className="px-4 py-3 grid grid-cols-[56px_80px_1fr_32px] gap-3 items-center hover:bg-muted/10 transition-colors">
                <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border text-center ${recordColors[rec.type] || "text-muted-foreground"}`}>
                  {rec.type}
                </span>
                <span className="text-xs font-mono text-muted-foreground truncate">{rec.host}</span>
                <div>
                  <span className="text-xs font-mono break-all">{rec.value}</span>
                  <p className="text-[9px] text-muted-foreground/60 mt-0.5">{rec.purpose}</p>
                </div>
                <button onClick={() => copy(rec.value)} className="text-muted-foreground hover:text-primary transition-colors">
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="px-4 py-2 border-t border-border/60 bg-muted/10 flex items-center gap-2">
            <Terminal className="h-3 w-3 text-muted-foreground/50" />
            <span className="text-[9px] font-mono text-muted-foreground/60">TTL: 300s — changes propagate within 5 minutes</span>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Add Domain Wizard --- //
function AddDomainWizard({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (domain: Domain) => void;
}) {
  const { toast } = useToast();
  const [step, setStep] = useState<WizardStep>(1);
  const [form, setForm] = useState({ name: "", origin: "", ssl: "Full" });
  const [saving, setSaving] = useState(false);
  const [createdDomain, setCreatedDomain] = useState<Domain | null>(null);

  const reset = () => { setStep(1); setForm({ name: "", origin: "", ssl: "Full" }); setCreatedDomain(null); };

  const handleClose = () => { reset(); onClose(); };

  const submit = async () => {
    setSaving(true);
    try {
      const token = (localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token")) || sessionStorage.getItem("auth_token");
      const res = await fetch("/api/domains", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          domain_name: form.name.trim(),
          origin_ip: form.origin.trim(),
          ssl_mode: form.ssl,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setCreatedDomain(data);
        onCreated(data);
        setStep(3);
      } else {
        toast({ title: "Error", description: data.error || "Failed to add domain", variant: "destructive" });
      }
    } catch {
      toast({ title: "Network error", description: "Could not reach the server", variant: "destructive" });
    }
    setSaving(false);
  };

  const steps = [
    { n: 1, label: "Domain & Origin" },
    { n: 2, label: "SSL Mode" },
    { n: 3, label: "DNS Setup" },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] flex flex-col overflow-hidden bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" /> Add New Domain
          </DialogTitle>
        </DialogHeader>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 pr-1 pb-2">
        {/* Step indicator */}
        <div className="flex items-center gap-2 pt-1 pb-3">
          {steps.map((s, i) => (
            <div key={s.n} className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 text-[10px] font-mono px-2.5 py-1 rounded-full transition-all ${
                step === s.n
                  ? "bg-primary text-primary-foreground"
                  : step > s.n
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "bg-muted/40 text-muted-foreground/50"
              }`}>
                {step > s.n ? <CheckCircle className="h-2.5 w-2.5" /> : <span>{s.n}</span>}
                {s.label}
              </div>
              {i < steps.length - 1 && <ArrowRight className={`h-3 w-3 shrink-0 ${step > s.n ? "text-emerald-400/50" : "text-border"}`} />}
            </div>
          ))}
        </div>

        {/* Step 1: Name + Origin */}
        {step === 1 && (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs">Domain Name <span className="text-destructive">*</span></Label>
              <Input
                id="wizard-domain-name"
                placeholder="app.yourcompany.com"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="bg-muted/50 font-mono text-sm"
              />
              <p className="text-[10px] text-muted-foreground">Enter the public domain you want to protect via the WAF</p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Origin Server IP / Hostname <span className="text-destructive">*</span></Label>
              <Input
                id="wizard-origin-ip"
                placeholder="10.0.1.50"
                value={form.origin}
                onChange={(e) => setForm({ ...form, origin: e.target.value })}
                className="bg-muted/50 font-mono text-sm"
              />
              <p className="text-[10px] text-muted-foreground">The backend server IP the WAF forwards clean traffic to</p>
            </div>
            <Button
              className="w-full font-mono text-xs glow-primary"
              disabled={!form.name.trim() || !form.origin.trim()}
              onClick={() => setStep(2)}
            >
              Next — Choose SSL Mode <ArrowRight className="h-3.5 w-3.5 ml-2" />
            </Button>
          </div>
        )}

        {/* Step 2: SSL Mode */}
        {step === 2 && (
          <div className="space-y-2.5 py-2">
            {SSL_MODES.map((mode) => (
              <button
                key={mode.key}
                onClick={() => setForm({ ...form, ssl: mode.key })}
                className={`w-full text-left p-3.5 rounded-lg border transition-all ${
                  form.ssl === mode.key
                    ? "border-primary bg-primary/8 ring-1 ring-primary/30"
                    : "border-border hover:border-muted-foreground/40 bg-muted/20"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base leading-none">{mode.icon}</span>
                    <span className="text-sm font-medium">{mode.label}</span>
                    {mode.recommended && (
                      <span className="text-[9px] font-mono bg-primary/20 text-primary px-1.5 py-0.5 rounded">RECOMMENDED</span>
                    )}
                  </div>
                  {form.ssl === mode.key && <CheckCircle className="h-4 w-4 text-primary shrink-0" />}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1 ml-7 leading-snug">{mode.desc}</p>
              </button>
            ))}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1 font-mono text-xs" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button className="flex-1 font-mono text-xs glow-primary" disabled={saving} onClick={submit}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                Add Domain
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: DNS Setup Instructions */}
        {step === 3 && createdDomain && (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
              <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
              <div>
                <p className="text-sm font-medium text-emerald-400">Domain added successfully!</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Configure the DNS records below to activate WAF protection</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-medium">Required DNS Records</p>
              <p className="text-[10px] text-muted-foreground">Add these at your domain registrar or DNS provider:</p>
            </div>

            {[
              { type: "CNAME", host: "@", value: "proxy.affinisecurity.io", ttl: "300" },
              { type: "A",     host: "@", value: "185.199.108.100",         ttl: "300" },
              { type: "TXT",   host: "_affinisecurity-verify", value: `affinisecurity-verify=${createdDomain.id}`, ttl: "300" },
            ].map((rec) => (
              <div key={rec.type} className="flex items-center gap-3 bg-muted/30 rounded-md px-3 py-2.5 font-mono text-xs">
                <span className="w-12 text-primary font-bold shrink-0">{rec.type}</span>
                <span className="text-muted-foreground w-28 shrink-0 truncate">{rec.host}</span>
                <span className="flex-1 truncate">{rec.value}</span>
                <button
                  onClick={() => { navigator.clipboard.writeText(rec.value); }}
                  className="text-muted-foreground hover:text-primary transition-colors shrink-0"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}

            <div className="p-3 bg-muted/20 rounded border border-border text-[10px] text-muted-foreground">
              <strong className="text-foreground/70">Next steps:</strong>
              <ol className="mt-1 space-y-1 list-decimal list-inside">
                <li>Add the CNAME or A record to your DNS provider</li>
                <li>Wait up to 5 minutes for propagation</li>
                <li>Click <strong className="text-foreground/70">Verify DNS</strong> on the domain card</li>
                <li>Click <strong className="text-foreground/70">Provision SSL</strong> to get your TLS certificate</li>
              </ol>
            </div>

            <Button className="w-full font-mono text-xs" onClick={handleClose}>
              Done — View My Domains
            </Button>
          </div>
        )}
        </div>{/* end scrollable body */}
      </DialogContent>
    </Dialog>
  );
}

// --- Edit Dialog --- //
function EditDomainDialog({
  domain,
  open,
  onClose,
  onUpdated,
}: {
  domain: Domain | null;
  open: boolean;
  onClose: () => void;
  onUpdated: (d: Domain) => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ 
    name: "", origin: "", ssl: "", 
    protection_mode: "prevention", 
    sensitivity: 1 
  });

  useEffect(() => {
    if (domain) setForm({ 
      name: domain.domain_name, 
      origin: domain.origin_ip, 
      ssl: domain.ssl_mode,
      protection_mode: domain.protection_mode || "prevention",
      sensitivity: domain.sensitivity || 1
    });
  }, [domain]);

  const save = async () => {
    if (!domain) return;
    setSaving(true);
    try {
      const token = (localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token")) || sessionStorage.getItem("auth_token");
      const res = await fetch(`/api/domains/${domain.id}`, {
        method: "PUT",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ 
          domain_name: form.name.trim(), 
          origin_ip: form.origin.trim(), 
          ssl_mode: form.ssl,
          protection_mode: form.protection_mode,
          sensitivity: form.sensitivity
        }),
      });
      const data = await res.json();
      if (res.ok) {
        onUpdated(data);
        toast({ title: "Domain updated", description: "Configuration changes applied successfully" });
        onClose();
      } else {
        toast({ title: "Error", description: data.error || "Failed to update domain", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Network error", variant: "destructive" });
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[420px] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit2 className="h-4 w-4 text-primary" /> Edit {domain?.domain_name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-xs">Domain Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-muted/50 font-mono" />
            {domain && form.name !== domain.domain_name && (
              <p className="text-[10px] text-amber-400 flex items-center gap-1">
                <AlertCircle className="h-3 w-3 shrink-0" />
                Changing hostname will reset DNS &amp; SSL verification
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Origin Server IP</Label>
            <Input value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })} className="bg-muted/50 font-mono" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">SSL Mode</Label>
            <div className="grid grid-cols-3 gap-2">
              {SSL_MODES.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setForm({ ...form, ssl: m.key })}
                  className={`py-2 px-2 rounded-md text-[10px] font-mono border transition-all text-center ${
                    form.ssl === m.key ? "bg-primary/10 border-primary text-primary" : "bg-muted/30 border-border text-muted-foreground hover:border-muted-foreground"
                  }`}
                >
                  {m.icon} {m.key}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-4 border-t border-border pt-4 mt-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-2">
              <Shield className="h-3 w-3" /> WAF Orchestration
            </h3>
            
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-xs">Protection Mode</Label>
                <p className="text-[10px] text-muted-foreground">
                  {form.protection_mode === "prevention" ? "Actively blocking threats" : "Shadow mode: Log only"}
                </p>
              </div>
              <div className="flex bg-muted/30 p-0.5 rounded-lg border border-border">
                <button 
                  onClick={() => setForm({ ...form, protection_mode: "detection" })}
                  className={`px-3 py-1 text-[10px] font-mono rounded-md transition-all ${form.protection_mode === "detection" ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" : "text-muted-foreground hover:text-foreground"}`}
                >
                  DETECTION
                </button>
                <button 
                  onClick={() => setForm({ ...form, protection_mode: "prevention" })}
                  className={`px-3 py-1 text-[10px] font-mono rounded-md transition-all ${form.protection_mode === "prevention" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "text-muted-foreground hover:text-foreground"}`}
                >
                  PREVENTION
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Security Sensitivity (Paranoia Level)</Label>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                  form.sensitivity === 1 ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" :
                  form.sensitivity === 2 ? "text-blue-400 border-blue-500/30 bg-blue-400/10" :
                  form.sensitivity === 3 ? "text-amber-400 border-amber-500/30 bg-amber-500/10" :
                  "text-destructive border-destructive/30 bg-destructive/10"
                }`}>
                  LEVEL {form.sensitivity}
                </span>
              </div>
              <input 
                type="range" min="1" max="4" step="1"
                value={form.sensitivity}
                onChange={(e) => setForm({ ...form, sensitivity: parseInt(e.target.value) })}
                className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
              />
              <div className="flex justify-between text-[9px] text-muted-foreground font-mono">
                <span>Standard (Safe)</span>
                <span>Balanced</span>
                <span>Strict</span>
                <span>Hyper-Secure</span>
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1 font-mono text-xs" onClick={onClose}>Cancel</Button>
            <Button className="flex-1 font-mono text-xs glow-primary" disabled={saving} onClick={save}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              Save Policy
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// --- Main Page --- //
export default function DomainsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [domainsList, setDomainsList] = useState<Domain[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editDomain, setEditDomain] = useState<Domain | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [provisioningId, setProvisioningId] = useState<string | null>(null);
  const [domainToDelete, setDomainToDelete] = useState<Domain | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!user) return;
    loadDomains();
  }, [user]);

  useEffect(() => {
    if (searchParams.get("add") === "true") {
      setWizardOpen(true);
      const p = new URLSearchParams(searchParams);
      p.delete("add");
      setSearchParams(p, { replace: true });
    }
  }, [searchParams]);

  const loadDomains = async () => {
    setLoading(true);
    try {
      const token = (localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token")) || sessionStorage.getItem("auth_token");
      const res = await fetch("/api/domains", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const data = await res.json();
      if (Array.isArray(data)) {
        setDomainsList(data);
      } else if (res.status === 401) {
        toast({ title: "Session Expired", description: "Please login again.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to load domains", variant: "destructive" });
    }
    setLoading(false);
  };

  const verifyDns = async (id: string) => {
    setVerifyingId(id);
    try {
      const token = (localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token")) || sessionStorage.getItem("auth_token");
      const res = await fetch(`/api/domains/${id}/verify-dns`, { 
        method: "PATCH",
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        setDomainsList(prev => prev.map(d => d.id === id ? { ...d, dns_verified: true, status: "active" } : d));
        toast({ title: "DNS Verified ✓", description: "Traffic will now route through the WAF proxy" });
      } else {
        const e = await res.json();
        toast({ title: "Verification failed", description: e.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    }
    setVerifyingId(null);
  };

  const toggleFeature = async (domain: Domain, feature: 'under_attack_mode' | 'force_https') => {
    try {
      const token = (localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token")) || sessionStorage.getItem("auth_token");
      const updatedDomain = { ...domain, [feature]: !domain[feature] };
      const res = await fetch(`/api/domains/${domain.id}`, {
        method: "PUT",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(updatedDomain),
      });
      if (res.ok) {
        setDomainsList(prev => prev.map(d => d.id === domain.id ? updatedDomain : d));
        toast({ title: "Updated", description: "Settings applied instantly to edge nodes." });
      } else {
        toast({ title: "Error", description: "Failed to update settings", variant: "destructive" });
      }
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    }
  };

  const provisionSsl = async (id: string) => {
    setProvisioningId(id);
    try {
      const token = (localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token")) || sessionStorage.getItem("auth_token");
      const res = await fetch(`/api/domains/${id}/provision-ssl`, { 
        method: "PATCH",
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        setDomainsList(prev => prev.map(d => d.id === id ? { ...d, ssl_provisioned: true } : d));
        toast({ title: "SSL Provisioned ✓", description: "TLS certificate issued and activated" });
      } else {
        const e = await res.json();
        toast({ title: "Provisioning failed", description: e.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    }
    setProvisioningId(null);
  };

  const removeDomain = async (domain: Domain) => {
    setIsDeleting(true);
    try {
      const token = (localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token")) || sessionStorage.getItem("auth_token");
      const res = await fetch(`/api/domains/${domain.id}`, { 
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        setDomainsList(prev => prev.filter(d => d.id !== domain.id));
        toast({ title: "Domain Removed", description: `${domain.domain_name} is no longer protected by the WAF` });
        setDomainToDelete(null);
      } else {
        toast({ title: "Error", description: "Failed to remove domain", variant: "destructive" });
      }
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    }
    setIsDeleting(false);
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" /> Domains
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {domainsList.length} domain{domainsList.length !== 1 ? "s" : ""} under WAF protection
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="font-mono text-xs h-8" onClick={loadDomains}>
              <RotateCcw className="h-3 w-3 mr-1" /> Refresh
            </Button>
            <Button className="font-mono text-xs glow-primary h-8" onClick={() => setWizardOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> ADD DOMAIN
            </Button>
          </div>
        </div>

        {/* Domain Cards */}
        {domainsList.length === 0 ? (
          <div className="border border-dashed border-border rounded-xl py-16 text-center space-y-3">
            <Globe className="h-10 w-10 text-muted-foreground/30 mx-auto" />
            <p className="text-sm text-muted-foreground">No domains yet</p>
            <p className="text-xs text-muted-foreground/60">Add your first domain to start routing traffic through the WAF</p>
            <Button className="font-mono text-xs glow-primary mt-2" onClick={() => setWizardOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add First Domain
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {domainsList.map((domain) => (
              <div key={domain.id} className="bg-card border border-border rounded-xl p-5 hover:border-primary/20 transition-colors">
                {/* Domain header row */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
                      domain.status === "active" ? "bg-emerald-500/10" : "bg-amber-500/10"
                    }`}>
                      <Globe className={`h-4 w-4 ${domain.status === "active" ? "text-emerald-400" : "text-amber-400"}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-semibold truncate">{domain.domain_name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">→ {domain.origin_ip}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-mono bg-muted/40 px-2 py-0.5 rounded border border-border">
                      SSL: {domain.ssl_mode}
                    </span>
                    <span className={`flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded border ${
                      domain.status === "active"
                        ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                        : "text-amber-400 border-amber-500/30 bg-amber-500/10"
                    }`}>
                      {domain.status === "active" ? <CheckCircle className="h-2.5 w-2.5" /> : <Clock className="h-2.5 w-2.5" />}
                      {domain.status.toUpperCase()}
                    </span>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary"
                      onClick={() => setEditDomain(domain)}>
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => setDomainToDelete(domain)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Lifecycle progress */}
                <DomainLifecycle domain={domain} />

                {/* Action buttons */}
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/60">
                  <div className="flex items-center gap-2">
                    {!domain.dns_verified ? (
                      <Button size="sm" variant="outline" className="text-[10px] h-7 font-mono px-3"
                        disabled={verifyingId === domain.id} onClick={() => verifyDns(domain.id)}>
                        {verifyingId === domain.id
                          ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          : <Radio className="h-3 w-3 mr-1" />}
                        Verify DNS
                      </Button>
                    ) : (
                      <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/30 px-2 py-1 rounded">
                        <CheckCircle className="h-2.5 w-2.5" /> DNS VERIFIED
                      </span>
                    )}

                    {!domain.ssl_provisioned ? (
                      <Button size="sm" variant="outline" className="text-[10px] h-7 font-mono px-3"
                        disabled={provisioningId === domain.id || !domain.dns_verified}
                        onClick={() => provisionSsl(domain.id)}
                        title={!domain.dns_verified ? "Verify DNS first" : "Provision SSL certificate"}>
                        {provisioningId === domain.id
                          ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          : <Shield className="h-3 w-3 mr-1" />}
                        Provision SSL
                      </Button>
                    ) : (
                      <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/30 px-2 py-1 rounded">
                        <Lock className="h-2.5 w-2.5" /> SSL ACTIVE
                      </span>
                    )}
                  </div>

                  {/* Premium Toggles */}
                  <div className="flex items-center gap-4 bg-muted/10 px-3 py-1 rounded-lg border border-border">
                    <div className="flex items-center gap-2" title="Blocks common DDoS and Bot attacks with a JS Challenge">
                      <Shield className="h-3.5 w-3.5 text-amber-400" />
                      <Label className="text-[10px] font-mono cursor-pointer" htmlFor={`attack-${domain.id}`}>Under Attack Mode</Label>
                      <Switch id={`attack-${domain.id}`} checked={domain.under_attack_mode} onCheckedChange={() => toggleFeature(domain, 'under_attack_mode')} className="scale-75 data-[state=checked]:bg-amber-500" />
                    </div>
                    <div className="w-px h-4 bg-border/50"></div>
                    <div className="flex items-center gap-2" title="Force all HTTP traffic to HTTPS">
                      <Lock className="h-3.5 w-3.5 text-primary" />
                      <Label className="text-[10px] font-mono cursor-pointer" htmlFor={`https-${domain.id}`}>Force HTTPS</Label>
                      <Switch id={`https-${domain.id}`} checked={domain.force_https} onCheckedChange={() => toggleFeature(domain, 'force_https')} className="scale-75" />
                    </div>
                  </div>
                </div>

                {/* Per-domain DNS instructions (collapsible) */}
                <DomainDNSPanel domain={domain} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Wizard */}
      <AddDomainWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreated={(d) => setDomainsList(prev => [d, ...prev])}
      />

      {/* Edit dialog */}
      <EditDomainDialog
        domain={editDomain}
        open={!!editDomain}
        onClose={() => setEditDomain(null)}
        onUpdated={(d) => setDomainsList(prev => prev.map(x => x.id === d.id ? d : x))}
      />

      {/* Delete Confirmation Modal */}
      <Dialog open={!!domainToDelete} onOpenChange={(o) => !o && setDomainToDelete(null)}>
        <DialogContent className="sm:max-w-[400px] border-destructive/20 bg-card">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Remove Domain?
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to remove <strong className="text-foreground">{domainToDelete?.domain_name}</strong> from the WAF?
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              This action will instantly stop proxying traffic for this domain and delete all associated security policies.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <Button variant="outline" className="font-mono text-xs" onClick={() => setDomainToDelete(null)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" className="font-mono text-xs" onClick={() => domainToDelete && removeDomain(domainToDelete)} disabled={isDeleting}>
              {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : null}
              Yes, Remove
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

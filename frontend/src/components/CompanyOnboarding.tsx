import { useState, useEffect } from "react";
import {
  Building2, MapPin, Phone, Mail, Globe, Save, Loader2,
  Shield, Zap, Server, ChevronRight, ChevronLeft, CheckCircle2,
  Settings, AlertTriangle, LayoutGrid, Info, ShieldCheck
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";

type Step = 1 | 2 | 3 | 4 | 5;

const STEPS = [
  { id: 1, title: "Organization", icon: Building2 },
  { id: 2, title: "Security", icon: Shield },
  { id: 3, title: "Infrastructure", icon: Server },
  { id: 4, title: "Policy", icon: LayoutGrid },
  { id: 5, title: "Ready", icon: CheckCircle2 }
];

export function CompanyOnboarding() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [currentStep, setCurrentStep] = useState<Step>(1);

  const [formData, setFormData] = useState({
    name: "",
    legalName: "",
    address: "",
    industry: "",
    contactPhone: "",
    contactEmail: "",
    tinNo: "",
    licenseNo: "",
    category: "",
    // Security Config
    wafMode: "Detection",
    sensitivity: "Medium",
    // Infrastructure
    domain: "",
    originHost: "",
    // Policy
    templateId: ""
  });

  const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const { data: templates = [] } = useQuery({
    queryKey: ["rule-templates-simple"],
    queryFn: async () => {
      const res = await fetch("/api/templates", { headers });
      if (!res.ok) return [];
      return res.json();
    }
  });

  useEffect(() => {
    if (
      user &&
      user.tenant &&
      !user.tenant.isProfileComplete &&
      (user.tenant.onboardingStep ?? 0) < 5 &&
      (user.role === 'admin' || user.role === 'tenant_admin' || user.role === 'customer' || user.isImpersonating)
    ) {
      setIsOpen(true);
      setFormData(prev => ({
        ...prev,
        name: user.tenant.name || "",
        legalName: user.tenant.legalName || user.tenant.name || "",
        address: user.tenant.address || "",
        contactPhone: user.tenant.contactPhone || "",
        contactEmail: user.tenant.contactEmail || "",
        industry: user.tenant.industry || "",
        domain: user.tenant.domain || "",
        tinNo: user.tenant.tinNo || "",
        licenseNo: user.tenant.licenseNo || "",
        category: user.tenant.category || "Private"
      }));
    } else {
      setIsOpen(false);
    }
  }, [user]);

  const handleNext = () => {
    if (currentStep < 5) setCurrentStep((currentStep + 1) as Step);
  };

  const handleBack = () => {
    if (currentStep > 1) setCurrentStep((currentStep - 1) as Step);
  };

  const handleFinalize = async () => {
    setIsSaving(true);
    try {
      // 1. Update Company Profile
      const res = await fetch("/api/company", {
        method: "PUT",
        headers,
        body: JSON.stringify({
          name: formData.name,
          legalName: formData.legalName,
          address: formData.address,
          industry: formData.industry,
          contactPhone: formData.contactPhone,
          contactEmail: formData.contactEmail,
          tinNo: formData.tinNo,
          licenseNo: formData.licenseNo,
          category: formData.category,
          onboardingStep: 5,
        })
      });

      if (!res.ok) throw new Error("Profile update failed");

      // 2. Apply Security Template if selected
      if (formData.templateId && user?.tenant?.id) {
        await fetch(`/api/admin/templates/${formData.templateId}/apply/${user.tenant.id}`, {
          method: "POST",
          headers,
        });
      }

      toast({
        title: "Setup Complete!",
        description: `${formData.name} is now protected by AffiniSecurity.`,
      });
      refreshUser();
      setIsOpen(false);
    } catch (error) {
      toast({
        title: "Setup Error",
        description: "We couldn't save your final configuration.",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5" /> Trade Name
                </label>
                <Input
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="bg-muted/30 h-11"
                  placeholder="e.g. Acme Corp"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5" /> Legal Name
                </label>
                <Input
                  value={formData.legalName}
                  onChange={e => setFormData({ ...formData, legalName: e.target.value })}
                  className="bg-muted/30 h-11"
                  placeholder="As per license"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5" /> TIN Number
                </label>
                <Input
                  value={formData.tinNo}
                  onChange={e => setFormData({ ...formData, tinNo: e.target.value })}
                  className="bg-muted/30 h-11"
                  placeholder="10 Digits"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5" /> License No
                </label>
                <Input
                  value={formData.licenseNo}
                  onChange={e => setFormData({ ...formData, licenseNo: e.target.value })}
                  className="bg-muted/30 h-11"
                  placeholder="Business License"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" /> Head Office Address
              </label>
              <Input
                value={formData.address}
                onChange={e => setFormData({ ...formData, address: e.target.value })}
                placeholder="Business HQ Location in Ethiopia"
                className="bg-muted/30 h-11"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" /> Contact Phone
                </label>
                <Input
                  value={formData.contactPhone}
                  onChange={e => setFormData({ ...formData, contactPhone: e.target.value })}
                  className="bg-muted/30 h-11"
                  placeholder="+251..."
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" /> Contact Email
                </label>
                <Input
                  value={formData.contactEmail}
                  onChange={e => setFormData({ ...formData, contactEmail: e.target.value })}
                  className="bg-muted/30 h-11"
                  placeholder="corp@org.et"
                />
              </div>
            </div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="space-y-3">
              <label className="text-xs font-bold text-muted-foreground uppercase">WAF Operation Mode</label>
              <div className="grid grid-cols-2 gap-3">
                <div
                  onClick={() => setFormData({ ...formData, wafMode: "Detection" })}
                  className={cn(
                    "p-4 rounded-xl border-2 cursor-pointer transition-all",
                    formData.wafMode === "Detection" ? "border-primary bg-primary/5 shadow-sm" : "border-muted bg-muted/20 opacity-60 hover:opacity-100"
                  )}
                >
                  <Zap className="h-5 w-5 mb-2 text-primary" />
                  <div className="font-bold text-sm">Detection</div>
                  <p className="text-[10px] text-muted-foreground">Monitor and log threats only.</p>
                </div>
                <div
                  onClick={() => setFormData({ ...formData, wafMode: "Prevention" })}
                  className={cn(
                    "p-4 rounded-xl border-2 cursor-pointer transition-all",
                    formData.wafMode === "Prevention" ? "border-emerald-500 bg-emerald-50 shadow-sm" : "border-muted bg-muted/20 opacity-60 hover:opacity-100"
                  )}
                >
                  <Shield className="h-5 w-5 mb-2 text-emerald-600" />
                  <div className="font-bold text-sm">Prevention</div>
                  <p className="text-[10px] text-muted-foreground">Actively block malicious traffic.</p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-bold text-muted-foreground uppercase">Sensitivity Level</label>
              <div className="flex gap-2 p-1 bg-muted/50 rounded-lg">
                {["Low", "Medium", "High"].map(lvl => (
                  <button
                    key={lvl}
                    onClick={() => setFormData({ ...formData, sensitivity: lvl })}
                    className={cn(
                      "flex-1 py-2 text-xs font-bold rounded-md transition-all",
                      formData.sensitivity === lvl ? "bg-white shadow-sm text-primary" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
              <div className="flex items-start gap-2 p-3 bg-blue-50/50 rounded-xl border border-blue-100">
                <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                <p className="text-[10px] text-blue-600/80 leading-relaxed">
                  Higher sensitivity increases security but may cause occasional false positives. We recommend starting with <b>Medium</b>.
                </p>
              </div>
            </div>
          </div>
        );
      case 3:
        return (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5" /> Public Domain
              </label>
              <Input
                value={formData.domain}
                onChange={e => setFormData({ ...formData, domain: e.target.value })}
                placeholder="e.g. app.acme.com"
                className="bg-muted/30 h-11"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5">
                <Server className="h-3.5 w-3.5" /> Origin Host / IP
              </label>
              <Input
                value={formData.originHost}
                onChange={e => setFormData({ ...formData, originHost: e.target.value })}
                placeholder="e.g. 10.0.0.1 or origin.internal"
                className="bg-muted/30 h-11"
              />
            </div>
            <div className="p-4 bg-amber-50 rounded-xl border border-amber-100 flex items-start gap-3">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
              <p className="text-[10px] text-amber-700 leading-normal">
                You will need to update your DNS records to point to our edge proxy after finishing this setup.
              </p>
            </div>
          </div>
        );
      case 4:
        return (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
            <label className="text-xs font-bold text-muted-foreground uppercase">Select Security Policy</label>
            <div className="max-h-[300px] overflow-y-auto pr-2 space-y-2">
              {templates.map((t: any) => (
                <div
                  key={t.id}
                  onClick={() => setFormData({ ...formData, templateId: t.id })}
                  className={cn(
                    "p-3 rounded-xl border-2 cursor-pointer transition-all flex items-center justify-between",
                    formData.templateId === t.id ? "border-primary bg-primary/5" : "border-muted/50 hover:border-muted opacity-80"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-slate-100 rounded-lg">
                      <Shield className="h-4 w-4 text-slate-500" />
                    </div>
                    <div>
                      <div className="text-sm font-bold">{t.name}</div>
                      <div className="text-[10px] text-muted-foreground">{t.ruleCount} Rules • {t.category}</div>
                    </div>
                  </div>
                  {formData.templateId === t.id && <CheckCircle2 className="h-4 w-4 text-primary" />}
                </div>
              ))}
              {templates.length === 0 && (
                <div className="text-center py-6 text-muted-foreground italic text-sm">No templates available.</div>
              )}
            </div>
          </div>
        );
      case 5:
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300 text-center py-4">
            <div className="inline-flex p-4 bg-emerald-100 rounded-full mb-2">
              <CheckCircle2 className="h-10 w-10 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900">Final Verification</h3>
              <p className="text-xs text-slate-500 mt-1">Review your configuration before launching.</p>
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-left space-y-3">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400 font-bold uppercase">Domain</span>
                <span className="font-medium text-slate-900">{formData.domain}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400 font-bold uppercase">Exposure</span>
                <span className="font-medium text-blue-600">{formData.wafMode} - {formData.sensitivity}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400 font-bold uppercase">Policy Type</span>
                <span className="font-medium text-slate-900">{templates.find((t: any) => t.id === formData.templateId)?.name || 'Custom'}</span>
              </div>
            </div>

            <p className="text-[10px] text-slate-400">
              By launching, you agree to enable traffic inspection for the specified domain.
            </p>
          </div>
        );
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(val) => !isSaving && setIsOpen(val)}>
      <DialogContent
        className="sm:max-w-[500px] rounded-3xl p-0 overflow-hidden border-none shadow-2xl"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <div className="bg-primary/5 p-6 border-b border-primary/10">
          <div className="flex items-center justify-between mb-6">
            <Logo showText className="h-8" />
            <div className="flex gap-1">
              {STEPS.map(s => (
                <div
                  key={s.id}
                  className={cn(
                    "h-1.5 w-6 rounded-full transition-all duration-300",
                    currentStep === s.id ? "bg-primary w-10" : currentStep > s.id ? "bg-primary/40" : "bg-slate-200"
                  )}
                />
              ))}
            </div>
          </div>
          <DialogTitle className="text-2xl font-bold text-slate-900 flex items-center gap-3">
            {STEPS[currentStep - 1].title} Setup
          </DialogTitle>
          <DialogDescription className="text-slate-500 mt-1">
            Step {currentStep} of 5 — {STEPS[currentStep - 1].title === "Organization" ? "Verified Corporate Identity" : "Environment Configuration"}
          </DialogDescription>
        </div>

        <div className="p-8">
          {renderStep()}

          <div className="flex gap-3 mt-10">
            {currentStep > 1 && (
              <Button
                variant="outline"
                onClick={handleBack}
                className="flex-1 h-12 rounded-xl group border-slate-200"
                disabled={isSaving}
              >
                <ChevronLeft className="h-4 w-4 mr-2 transition-transform group-hover:-translate-x-1" />
                Back
              </Button>
            )}
            {currentStep < 5 ? (
              <Button
                onClick={handleNext}
                className={cn("h-12 rounded-xl glow-primary font-bold transition-all", currentStep === 1 ? "w-full" : "flex-1")}
              >
                Continue
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <Button
                onClick={handleFinalize}
                className="flex-1 h-12 rounded-xl glow-primary font-bold shadow-emerald-500/20"
                disabled={isSaving}
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Shield className="h-4 w-4 mr-2" />}
                LAUNCH INFRASTRUCTURE
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

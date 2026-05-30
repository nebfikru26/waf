import { useState, useEffect } from "react";
import { Building2, MapPin, Phone, Mail, Globe, Save, Loader2 } from "lucide-react";
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
import { Logo } from "@/components/Logo";

export function CompanyOnboarding() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    address: "",
    industry: "",
    contactPhone: "",
    contactEmail: ""
  });

  useEffect(() => {
    // Show modal if profile is incomplete and user is an admin for the tenant
    // Skip if super admin is impersonating — don't force them into tenant onboarding
    if (
      user &&
      user.tenant &&
      !user.tenant.isProfileComplete &&
      !user.isImpersonating &&
      (user.role === 'admin' || user.role === 'tenant_admin' || user.role === 'customer')
    ) {
      setIsOpen(true);
      setFormData({
        name: user.tenant.name || "",
        address: user.tenant.address || "",
        industry: user.tenant.industry || "",
        contactPhone: user.tenant.contactPhone || "",
        contactEmail: user.tenant.contactEmail || ""
      });
    } else {
      setIsOpen(false);
    }
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const token = (localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token")) || sessionStorage.getItem("auth_token");
      const res = await fetch("/api/company", {
        method: "PUT",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          legalName: formData.name,
          name: formData.name,
          address: formData.address,
          industry: formData.industry,
          contactPhone: formData.contactPhone,
          contactEmail: formData.contactEmail
        })
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Onboarding failed");
      }
      
      toast({ title: "Organization Verified", description: "Your company profile is now active." });
      // Refresh user context in-place to mark onboarding complete — no logout needed
      await refreshUser();
      setIsOpen(false);
    } catch (err: any) {
      toast({ title: "Setup Error", description: err.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen}>
      <DialogContent className="sm:max-w-[500px]" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Corporate Onboarding
          </DialogTitle>
          <DialogDescription>
            Please provide your organization's verified details to activate your security licenses.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-4 pt-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" /> Company Legal Name
            </label>
            <Input 
              required
              value={formData.name} 
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              className="bg-muted/30"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" /> Business Address
            </label>
            <Input 
              required
              value={formData.address} 
              onChange={e => setFormData({ ...formData, address: e.target.value })}
              placeholder="e.g. Addis Ababa, Bole Area"
              className="bg-muted/30"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5" /> Industry Sector
              </label>
              <Input 
                required
                value={formData.industry} 
                onChange={e => setFormData({ ...formData, industry: e.target.value })}
                placeholder="e.g. Finance"
                className="bg-muted/30"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" /> Main Contact Phone
              </label>
              <Input 
                required
                value={formData.contactPhone} 
                onChange={e => setFormData({ ...formData, contactPhone: e.target.value })}
                placeholder="+251..."
                className="bg-muted/30"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" /> Official Billing Email
            </label>
            <Input 
              required
              type="email"
              value={formData.contactEmail} 
              onChange={e => setFormData({ ...formData, contactEmail: e.target.value })}
              className="bg-muted/30"
            />
          </div>

          <Button type="submit" className="w-full mt-4 glow-primary font-mono text-xs" disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            FINALIZE CORPORATE IDENTITY
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

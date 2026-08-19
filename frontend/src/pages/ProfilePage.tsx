import { useState, useEffect } from "react";
import { User, Mail, Phone, Briefcase, FileText, Save, Loader2, Building2, Zap } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();

  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    jobTitle: "",
    bio: ""
  });

  const [isOrgSaving, setIsOrgSaving] = useState(false);
  const [isOrgLoading, setIsOrgLoading] = useState(false);
  const [isLogoUploading, setIsLogoUploading] = useState(false);

  const [orgData, setOrgData] = useState({
    name: "",
    legalName: "", manager: "", licenseNo: "", tinNo: "",
    category: "", industry: "", address: "",
    contactEmail: "", contactPhone: "", website: ""
  });

  const canEditOrg = user?.role === "super_admin" || user?.role === "admin" || user?.role === "tenant_admin";

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || "",
        phone: user.phone || "",
        jobTitle: user.jobTitle || "",
        bio: user.bio || ""
      });
      if (user.tenant) {
        setOrgData(prev => ({
          ...prev,
          name: user.tenant?.name || "",
          legalName: user.tenant?.legalName || "",
          manager: user.tenant?.manager || "",
          licenseNo: user.tenant?.licenseNo || "",
          tinNo: user.tenant?.tinNo || "",
          category: user.tenant?.category || "",
          industry: user.tenant?.industry || "",
          address: user.tenant?.address || "",
          contactEmail: user.tenant?.contactEmail || "",
          contactPhone: user.tenant?.contactPhone || ""
        }));
      }
    }
  }, [user]);

  useEffect(() => {
    if (canEditOrg) {
      loadOrgData();
    }
  }, [canEditOrg]);

  const loadOrgData = async () => {
    setIsOrgLoading(true);
    try {
      const token = (localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token")) || sessionStorage.getItem("auth_token");
      const res = await fetch("/api/company", { headers: { "Authorization": `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setOrgData({
          name: data.name || "",
          legalName: data.legalName || "",
          manager: data.manager || "",
          licenseNo: data.licenseNo || "",
          tinNo: data.tinNo || "",
          category: data.category || "",
          industry: data.industry || "",
          address: data.address || "",
          contactEmail: data.contactEmail || "",
          contactPhone: data.contactPhone || "",
          website: data.website || ""
        });
      }
    } catch (e) {
      console.error(e);
    }
    setIsOrgLoading(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const token = (localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token")) || sessionStorage.getItem("auth_token");
      const res = await fetch("/api/profile/update", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify(formData)
      });
      if (!res.ok) throw new Error("Update failed");
      await refreshUser();
      toast({ title: "Profile Synchronized", description: "Your professional details have been updated." });
    } catch (err: any) {
      toast({ title: "Update Error", description: err.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleOrgSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsOrgSaving(true);
    try {
      const token = (localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token")) || sessionStorage.getItem("auth_token");
      const res = await fetch("/api/company", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify(orgData)
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.details || errData.error || "Organization update failed");
      }
      await refreshUser();
      toast({ title: "Organization Synchronized", description: "Company details have been updated successfully." });
    } catch (err: any) {
      toast({ title: "Update Error", description: err.message, variant: "destructive" });
    } finally {
      setIsOrgSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <User className="h-6 w-6 text-primary" /> Profile Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your identity and organization details.</p>
        </div>

        <Tabs defaultValue="personal" className="w-full">
          <TabsList className="mb-6 w-full justify-start bg-transparent border-b border-border rounded-none h-auto p-0 space-x-6">
            <TabsTrigger
              value="personal"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-2 py-3 data-[state=active]:shadow-none"
            >
              <User className="h-4 w-4 mr-2" /> Personal Identity
            </TabsTrigger>
            {canEditOrg && (
              <TabsTrigger
                value="organization"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-2 py-3 data-[state=active]:shadow-none"
              >
                <Building2 className="h-4 w-4 mr-2" /> Organization Profile
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="personal" className="mt-0">
            <div className="bg-card border border-border rounded-xl p-6 shadow-sm overflow-hidden relative">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 blur-3xl rounded-full -mr-16 -mt-16" />
              <form onSubmit={handleSave} className="space-y-6 relative z-10">
                <div className="flex items-center gap-4 border-b border-border/50 pb-6 mb-6">
                  <div className="h-16 w-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <span className="text-2xl font-mono font-bold text-primary">{user?.name?.substring(0, 2).toUpperCase()}</span>
                  </div>
                  <div>
                    <p className="text-lg font-bold">{user?.name}</p>
                    <p className="text-xs text-muted-foreground font-mono flex items-center gap-1.5"><Mail className="h-3 w-3" /> {user?.email}</p>
                    <div className="mt-1">
                      <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded font-bold uppercase tracking-widest border border-primary/10">{user?.role}</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-muted-foreground uppercase flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5" /> Full Name
                    </label>
                    <Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="bg-muted/30 border-border/60" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-muted-foreground uppercase flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5" /> Contact Phone
                    </label>
                    <Input value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} placeholder="+251..." className="bg-muted/30 border-border/60" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-muted-foreground uppercase flex items-center gap-1.5">
                      <Briefcase className="h-3.5 w-3.5" /> Job Title
                    </label>
                    <Input value={formData.jobTitle} onChange={e => setFormData({ ...formData, jobTitle: e.target.value })} placeholder="e.g., Security Architect" className="bg-muted/30 border-border/60" />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-muted-foreground uppercase flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" /> Professional Bio
                  </label>
                  <Textarea value={formData.bio} onChange={e => setFormData({ ...formData, bio: e.target.value })} placeholder="Briefly describe your role and responsibilities..." className="min-h-[120px] bg-muted/30 border-border/60 resize-none" />
                </div>

                <div className="pt-4 flex justify-end">
                  <Button type="submit" className="glow-primary font-mono text-xs px-8" disabled={isSaving}>
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                    SYNCHRONIZE PROFILE
                  </Button>
                </div>
              </form>
            </div>
          </TabsContent>

          {canEditOrg && (
            <TabsContent value="organization" className="mt-0">
              <div className="bg-card border border-border rounded-xl p-6 shadow-sm overflow-hidden relative">
                {isOrgLoading ? (
                  <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                ) : (
                  <form onSubmit={handleOrgSave} className="space-y-6 relative z-10">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold text-muted-foreground uppercase">Trade Name</label>
                        <Input value={orgData.name} onChange={e => setOrgData({ ...orgData, name: e.target.value })} className="bg-muted/30" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold text-muted-foreground uppercase">Legal Company Name</label>
                        <Input value={orgData.legalName} onChange={e => setOrgData({ ...orgData, legalName: e.target.value })} className="bg-muted/30" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold text-muted-foreground uppercase">General Manager</label>
                        <Input value={orgData.manager} onChange={e => setOrgData({ ...orgData, manager: e.target.value })} className="bg-muted/30" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold text-muted-foreground uppercase">License Number</label>
                        <Input value={orgData.licenseNo} onChange={e => setOrgData({ ...orgData, licenseNo: e.target.value })} className="bg-muted/30" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold text-muted-foreground uppercase">TIN Number</label>
                        <Input value={orgData.tinNo} onChange={e => setOrgData({ ...orgData, tinNo: e.target.value })} className="bg-muted/30" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold text-muted-foreground uppercase">Industry</label>
                        <Input value={orgData.industry} onChange={e => setOrgData({ ...orgData, industry: e.target.value })} placeholder="e.g. Finance" className="bg-muted/30" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold text-muted-foreground uppercase">Company Category</label>
                        <Input value={orgData.category} onChange={e => setOrgData({ ...orgData, category: e.target.value })} placeholder="e.g. Enterprise" className="bg-muted/30" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold text-muted-foreground uppercase">Contact Email</label>
                        <Input type="email" value={orgData.contactEmail} onChange={e => setOrgData({ ...orgData, contactEmail: e.target.value })} className="bg-muted/30" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold text-muted-foreground uppercase">Contact Phone</label>
                        <Input value={orgData.contactPhone} onChange={e => setOrgData({ ...orgData, contactPhone: e.target.value })} className="bg-muted/30" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold text-muted-foreground uppercase">Website</label>
                        <Input value={orgData.website} onChange={e => setOrgData({ ...orgData, website: e.target.value })} placeholder="https://" className="bg-muted/30" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-muted-foreground uppercase">Physical Address</label>
                      <Textarea value={orgData.address} onChange={e => setOrgData({ ...orgData, address: e.target.value })} className="bg-muted/30 min-h-[80px]" />
                    </div>

                    <div className="pt-4 flex justify-end">
                      <Button type="submit" className="glow-primary font-mono text-xs px-8" disabled={isOrgSaving}>
                        {isOrgSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                        SAVE ORGANIZATION
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users, UserPlus, Trash2, Mail, ShieldAlert, Loader2,
  ShieldCheck, Building2, KeyRound, Eye, EyeOff, LogIn, UserCog,
  Globe, Server, ArrowRight, Lock
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/hooks/use-auth";
import { WafPermissions } from "@/lib/permissions";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

interface UserData {
  id: string;
  email: string;
  name: string;
  phone?: string;
  jobTitle?: string;
  role: string;
  tenantId?: string;
  createdAt: string;
  isActive: boolean;
}

interface ClientTenantData {
  id: string;
  tenantId: string;
  name: string;
  legalName: string;
  email: string;
  phone: string;
  jobTitle: string;
  role: string;
  industry: string;
  address: string;
  website: string;
  plan: string;
  isActive: boolean;
  createdAt: string;
}

type TabType = "system" | "clients";

const SYSTEM_FORM = { email: "", name: "", password: "", phone: "", jobTitle: "", role: "security_analyst" };
const TENANT_STAFF_FORM = { email: "", name: "", password: "", phone: "", jobTitle: "", role: "security_analyst" };

// Platform-level roles
const PLATFORM_ROLES = ["super_admin", "support_engineer", "admin"];
// Tenant-level roles
const TENANT_ROLES = ["tenant_admin", "security_engineer", "security_analyst", "billing_admin"];

const ROLE_META: Record<string, { label: string; color: string; platform: boolean }> = {
  super_admin: { label: "Super Admin", color: "bg-rose-500/15 text-rose-400 border border-rose-500/20", platform: true },
  support_engineer: { label: "Support Engineer", color: "bg-orange-500/15 text-orange-400 border border-orange-500/20", platform: true },
  tenant_admin: { label: "Tenant Admin", color: "bg-primary/15 text-primary border border-primary/20", platform: false },
  security_engineer: { label: "Security Engineer", color: "bg-violet-500/15 text-violet-400 border border-violet-500/20", platform: false },
  security_analyst: { label: "Security Analyst", color: "bg-sky-500/15 text-sky-400 border border-sky-500/20", platform: false },
  billing_admin: { label: "Billing Admin", color: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20", platform: false },
};

const CLIENT_FORM = {
  // Company
  legalName: "", name: "", manager: "", licenseNo: "", tinNo: "",
  address: "", category: "", industry: "",
  contactPhone: "", contactEmail: "", contactPerson: "", website: "",
  // Primary user
  userEmail: "", userName: "", password: "", userPhone: "", userTitle: "",
};

const COMPANY_CATEGORIES = ["Private", "Partnership", "Share Company (SC)", "Government", "NGO / Non-Profit", "Foreign Company", "Other"];
const COMPANY_INDUSTRIES = ["Information Technology", "Education", "Healthcare", "Manufacturing", "Finance & Banking", "Retail & Commerce", "Telecommunications", "Agriculture", "Construction", "Transport & Logistics", "Media & Entertainment", "Energy & Utilities", "Other"];

function PasswordField({ value, onChange, placeholder = "Min 6 characters", required = true }: {
  value: string; onChange: (v: string) => void; placeholder?: string; required?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        minLength={6}
        className="pr-10"
      />
      <button type="button" onClick={() => setShow(!show)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

export default function UsersPage() {
  const { user, isLoading: isAuthLoading, impersonateTenant, hasPermission } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isPlatformAdmin = user?.role === "super_admin" || user?.role === "support_engineer" || user?.role === "admin";
  const isTenantAdmin = user?.role === "tenant_admin";
  // Mirrors the backend's users:manage permission (RequireUserAdministrator policy), which is
  // exactly the super_admin/admin/support_engineer/tenant_admin set already computed above —
  // driven from hasPermission so it stays correct if the role -> permission map ever changes.
  const isAdmin = hasPermission(WafPermissions.UsersManage);
  const isCurrentUserSuperAdmin = user?.role === "super_admin";

  const [activeTab, setActiveTab] = useState<TabType>(isPlatformAdmin ? "system" : "clients");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [systemForm, setSystemForm] = useState({ ...SYSTEM_FORM });
  const [clientForm, setClientForm] = useState({ ...CLIENT_FORM });
  const [tenantStaffForm, setTenantStaffForm] = useState({ ...TENANT_STAFF_FORM });
  const [resetTarget, setResetTarget] = useState<UserData | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [editTarget, setEditTarget] = useState<UserData | null>(null);
  const [viewTarget, setViewTarget] = useState<UserData | null>(null);
  const [editForm, setEditForm] = useState({ name: "", phone: "", jobTitle: "", role: "" });

  const headers = {
    "Content-Type": "application/json"
  };

  const { data: allUsers = [], isLoading: isLoadingUsers } = useQuery<UserData[]>({
    queryKey: ["users"],
    queryFn: () => fetch("/api/users", { headers }).then((r) => r.json()),
    enabled: isAdmin,
  });

  const { data: clientTenants = [], isLoading: isLoadingClients } = useQuery<ClientTenantData[]>({
    queryKey: ["clients"],
    queryFn: () => fetch("/api/clients", { headers }).then((r) => r.json()),
    enabled: isPlatformAdmin,
  });


  // MOVED CONDITIONAL RETURNS TO THE BOTTOM AFTER ALL HOOKS

  const safeUsers = Array.isArray(allUsers) ? allUsers : [];
  const systemUsers = safeUsers.filter((u) =>
    PLATFORM_ROLES.some(r => r.toLowerCase() === u.role?.toLowerCase().trim())
  );

  const safeClients = Array.isArray(clientTenants) ? clientTenants : [];
  // For stats badge — clientUsers now from tenant list
  const clientUsers = safeClients;

  const displayUsers: (UserData | ClientTenantData)[] = activeTab === "system"
    ? systemUsers.filter(u =>
      (u.name?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
      (u.email?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
      (u.id?.toLowerCase() || "").includes(searchTerm.toLowerCase())
    )
    : safeClients.filter(u =>
      (u.name?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
      (u.email?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
      ((u as ClientTenantData).tenantId?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
      ((u as ClientTenantData).industry?.toLowerCase() || "").includes(searchTerm.toLowerCase())
    );


  // ── Pagination ─────────────────────────────────────────────────────────────
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchTerm]);

  const totalPages = Math.ceil(displayUsers.length / pageSize);
  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return displayUsers.slice(start, start + pageSize);
  }, [displayUsers, currentPage, pageSize]);

  const renderPagination = (position: "top" | "bottom") => {
    if (totalPages <= 1) return null;
    return (
      <div className={`px-6 py-3 flex items-center justify-between border-border/50 ${position === "top" ? "border-b bg-muted/50" : "border-t bg-muted/50"}`}>
        <span className="text-[11px] text-muted-foreground">
          Showing <span className="font-semibold text-foreground">{Math.min((currentPage - 1) * pageSize + 1, displayUsers.length)}</span> to{" "}
          <span className="font-semibold text-foreground">{Math.min(currentPage * pageSize, displayUsers.length)}</span> of{" "}
          <span className="font-semibold text-foreground">{displayUsers.length}</span> {activeTab === "system" ? "staff" : "clients"}
        </span>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            className="h-7 px-2.5 text-[10px]"
          >
            Previous
          </Button>
          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }).map((_, idx) => {
              const p = idx + 1;
              if (
                totalPages <= 4 ||
                p === 1 ||
                p === totalPages ||
                Math.abs(p - currentPage) <= 1
              ) {
                return (
                  <button
                    key={p}
                    onClick={() => setCurrentPage(p)}
                    className={`h-7 w-7 text-[10px] rounded-lg font-bold border transition-all ${currentPage === p
                      ? activeTab === "system"
                        ? "bg-primary/10 border-primary/30 text-primary"
                        : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                      : "border-border/40 hover:bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                  >
                    {p}
                  </button>
                );
              } else if (p === 2 || p === totalPages - 1) {
                return <span key={p} className="px-0.5 text-muted-foreground text-xs">...</span>;
              }
              return null;
            })}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
            disabled={currentPage === totalPages}
            className="h-7 px-2.5 text-[10px]"
          >
            Next
          </Button>
        </div>
      </div>
    );
  };


  // Add system staff (platform admins only)
  const addStaffMutation = useMutation({
    mutationFn: async (payload: typeof SYSTEM_FORM) => {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast({ title: "Staff account provisioned" });
      setIsAddOpen(false);
      setSystemForm({ ...SYSTEM_FORM });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Add tenant team member (tenant admins only)
  const addTenantStaffMutation = useMutation({
    mutationFn: async (payload: typeof TENANT_STAFF_FORM) => {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast({ title: "Team member added", description: "They can now log in with the provided credentials." });
      setIsAddOpen(false);
      setTenantStaffForm({ ...TENANT_STAFF_FORM });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Add full client organization
  const addClientMutation = useMutation({
    mutationFn: async (payload: typeof CLIENT_FORM) => {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast({ title: "Client organization registered", description: "Tenant provisioned with Free plan." });
      setIsAddOpen(false);
      setClientForm({ ...CLIENT_FORM });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Delete user (actual deletion)
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/users/${id}`, {
        method: "DELETE",
        headers: {}
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to delete user");
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["users"] }); toast({ title: "User permanently deleted" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Update User (Generic)
  const updateUserMutation = useMutation({
    mutationFn: async ({ id, ...payload }: Partial<UserData> & { id: string }) => {
      const res = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to update user");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast({ title: "User updated successfully" });
      setEditTarget(null);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });


  // Reset password (send link)
  const resetMutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const res = await fetch(`/api/users/${id}/reset-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Reset Link Sent", description: data.message || `An email with instructions was dispatched.` });
      setResetTarget(null);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const getRoleColor = (role: string) => ROLE_META[role]?.color ?? "bg-muted/30 text-muted-foreground border border-border";
  const getRoleLabel = (role: string) => ROLE_META[role]?.label ?? role;

  const sf = (k: keyof typeof systemForm) => (e: React.ChangeEvent<HTMLInputElement>) => setSystemForm({ ...systemForm, [k]: e.target.value });
  const cf = (k: keyof typeof clientForm) => (e: React.ChangeEvent<HTMLInputElement>) => setClientForm({ ...clientForm, [k]: e.target.value });
  const tsf = (k: keyof typeof tenantStaffForm) => (e: React.ChangeEvent<HTMLInputElement>) => setTenantStaffForm({ ...tenantStaffForm, [k]: e.target.value });

  // Early returns must be AFTER all hooks (useState, useQuery, useMutation, etc)
  if (isAuthLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!user || !isAdmin) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
          <div className="h-16 w-16 bg-destructive/10 rounded-full flex items-center justify-center">
            <Lock className="h-8 w-8 text-destructive" />
          </div>
          <div className="text-center">
            <h2 className="text-xl font-bold">Access Restricted</h2>
            <p className="text-muted-foreground">User management is reserved for administrative accounts.</p>
          </div>
          <Button variant="outline" onClick={() => navigate("/")}>RETURN TO DASHBOARD</Button>
        </div>
      </DashboardLayout>
    );
  }



  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><Users className="h-5 w-5 text-primary" /> User Management</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage internal staff and registered client organizations.</p>
        </div>

        {/* Stats */}
        <div className={`grid gap-4 ${isPlatformAdmin ? "grid-cols-2" : "grid-cols-1 max-w-xs"}`}>
          {isPlatformAdmin && (
            <div className="bg-card border border-border rounded-lg p-4 flex items-center gap-4">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center"><ShieldCheck className="h-5 w-5 text-primary" /></div>
              <div><p className="text-2xl font-bold">{systemUsers.length}</p><p className="text-xs text-muted-foreground">System Staff</p></div>
            </div>
          )}
          <div className="bg-card border border-border rounded-lg p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center"><Building2 className="h-5 w-5 text-emerald-400" /></div>
            <div><p className="text-2xl font-bold">{clientUsers.length}</p><p className="text-xs text-muted-foreground">{isTenantAdmin ? "Team Members" : "Client Accounts"}</p></div>
          </div>
        </div>

        {/* Tabs + Add */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-[300px] max-w-md">
            <div className="relative w-full">
              <Input
                placeholder={`Search ${activeTab === "system" ? "staff" : "clients"}...`}
                className="h-9 text-xs font-mono pl-9 bg-muted/20"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
              <Users className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            </div>
            <div className="flex gap-1 bg-muted/40 border border-border rounded-lg p-1 shrink-0">
              {(isPlatformAdmin
                ? (["system", "clients"] as TabType[])
                : (["clients"] as TabType[])
              ).map((tab) => (
                <button key={tab} onClick={() => { setActiveTab(tab); setIsAddOpen(false); }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-mono font-medium transition-all ${activeTab === tab
                    ? tab === "system" ? "bg-card text-primary border border-border shadow-sm" : "bg-card text-emerald-400 border border-border shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                    }`}>
                  {tab === "system" ? <ShieldCheck className="h-3.5 w-3.5" /> : <Building2 className="h-3.5 w-3.5" />}
                  <span className="hidden sm:inline">{tab === "system" ? "SYSTEM STAFF" : isTenantAdmin ? "TEAM MEMBERS" : "CLIENT ACCOUNTS"}</span>
                  <span className={`ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded ${tab === "system" ? "bg-primary/10 text-primary" : "bg-emerald-500/10 text-emerald-400"}`}>
                    {tab === "system" ? systemUsers.length : clientUsers.length}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button className="font-mono text-xs">
                <UserPlus className="h-4 w-4 mr-2" />
                {isTenantAdmin ? "ADD TEAM MEMBER" : activeTab === "system" ? "ADD STAFF" : "REGISTER CLIENT"}
              </Button>
            </DialogTrigger>

            {/* ─── ADD SYSTEM STAFF DIALOG (platform admins) ─── */}
            {activeTab === "system" && isPlatformAdmin && (
              <DialogContent className="sm:max-w-[440px]">
                <DialogHeader>
                  <DialogTitle>Provision System Staff</DialogTitle>
                  <DialogDescription>Create an internal admin or analyst account.</DialogDescription>
                </DialogHeader>
                <form onSubmit={(e) => { e.preventDefault(); addStaffMutation.mutate(systemForm); }} className="space-y-3 pt-2">
                  <Field label="Email Address"><Input required type="email" value={systemForm.email} onChange={sf("email")} placeholder="staff@affinisecurity.io" /></Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Full Name"><Input required value={systemForm.name} onChange={sf("name")} placeholder="Full Name" /></Field>
                    <Field label="Job Title"><Input value={systemForm.jobTitle} onChange={sf("jobTitle")} placeholder="Security Analyst" /></Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Phone"><Input value={systemForm.phone} onChange={sf("phone")} placeholder="+251..." /></Field>
                    <Field label="Role">
                      <Select value={systemForm.role} onValueChange={(v) => setSystemForm({ ...systemForm, role: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {isCurrentUserSuperAdmin && <SelectItem value="super_admin">Super Admin (Platform)</SelectItem>}
                          <SelectItem value="support_engineer">Support Engineer (Platform)</SelectItem>
                          <SelectItem value="tenant_admin">Tenant Admin</SelectItem>
                          <SelectItem value="security_engineer">Security Engineer</SelectItem>
                          <SelectItem value="security_analyst">Security Analyst</SelectItem>
                          <SelectItem value="billing_admin">Billing Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                  <Field label="Initial Password"><PasswordField value={systemForm.password} onChange={(v) => setSystemForm({ ...systemForm, password: v })} /></Field>
                  <Button type="submit" className="w-full mt-2" disabled={addStaffMutation.isPending}>
                    {addStaffMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Provision Staff Account
                  </Button>
                </form>
              </DialogContent>
            )}

            {/* ─── ADD CLIENT DIALOG ─── */}
            {activeTab === "clients" && (
              <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Register Client Organization</DialogTitle>
                  <DialogDescription>Provision a new client with full company profile and primary user account.</DialogDescription>
                </DialogHeader>
                <form onSubmit={(e) => { e.preventDefault(); addClientMutation.mutate(clientForm); }} className="space-y-5 pt-2">

                  {/* Company Section */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-xs font-mono font-bold text-primary border-b border-border pb-2">
                      <Building2 className="h-3.5 w-3.5" /> COMPANY INFORMATION
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Company Legal Name *">
                        <Input required value={clientForm.legalName} onChange={cf("legalName")} placeholder="XYZ Trading PLC" />
                      </Field>
                      <Field label="Trading / Display Name">
                        <Input value={clientForm.name} onChange={cf("name")} placeholder="Same as legal if empty" />
                      </Field>
                      <Field label="General Manager / CEO *">
                        <Input required value={clientForm.manager} onChange={cf("manager")} placeholder="Full Name" />
                      </Field>
                      <Field label="Contact Person *">
                        <Input required value={clientForm.contactPerson} onChange={cf("contactPerson")} placeholder="IT Manager Name" />
                      </Field>
                      <Field label="Business License No. *">
                        <Input required value={clientForm.licenseNo} onChange={cf("licenseNo")} placeholder="LIC-XXXXXX" />
                      </Field>
                      <Field label="TIN Number *">
                        <Input required value={clientForm.tinNo} onChange={cf("tinNo")} placeholder="000-000-000" />
                      </Field>
                      <Field label="Company Category *">
                        <Select value={clientForm.category} onValueChange={(v) => setClientForm({ ...clientForm, category: v })}>
                          <SelectTrigger><SelectValue placeholder="Select category..." /></SelectTrigger>
                          <SelectContent>
                            {COMPANY_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Industry / Type *">
                        <Select value={clientForm.industry} onValueChange={(v) => setClientForm({ ...clientForm, industry: v })}>
                          <SelectTrigger><SelectValue placeholder="Select industry..." /></SelectTrigger>
                          <SelectContent>
                            {COMPANY_INDUSTRIES.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Address *">
                        <Input required value={clientForm.address} onChange={cf("address")} placeholder="City, Country" />
                      </Field>
                      <Field label="Company Email *">
                        <Input required type="email" value={clientForm.contactEmail} onChange={cf("contactEmail")} placeholder="info@company.com" />
                      </Field>
                      <Field label="Phone Number *">
                        <Input required value={clientForm.contactPhone} onChange={cf("contactPhone")} placeholder="+251..." />
                      </Field>
                      <Field label="Website (optional)">
                        <Input value={clientForm.website} onChange={cf("website")} placeholder="https://..." />
                      </Field>
                    </div>
                  </div>

                  {/* Primary User Section */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-xs font-mono font-bold text-emerald-400 border-b border-border pb-2">
                      <ShieldCheck className="h-3.5 w-3.5" /> PRIMARY USER ACCOUNT
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Login Email *">
                        <Input required type="email" value={clientForm.userEmail} onChange={cf("userEmail")} placeholder="admin@company.com" />
                      </Field>
                      <Field label="Full Name *">
                        <Input required value={clientForm.userName} onChange={cf("userName")} placeholder="Full Name" />
                      </Field>
                      <Field label="Phone">
                        <Input value={clientForm.userPhone} onChange={cf("userPhone")} placeholder="+251..." />
                      </Field>
                      <Field label="Job Title">
                        <Input value={clientForm.userTitle} onChange={cf("userTitle")} placeholder="IT Manager" />
                      </Field>
                      <div className="col-span-2">
                        <Field label="Initial Password *">
                          <PasswordField value={clientForm.password} onChange={(v) => setClientForm({ ...clientForm, password: v })} />
                        </Field>
                      </div>
                    </div>
                  </div>

                  <Button type="submit" className="w-full glow-primary" disabled={addClientMutation.isPending}>
                    {addClientMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Building2 className="h-4 w-4 mr-2" />}
                    Register Organization & Provision Access
                  </Button>
                </form>
              </DialogContent>
            )}

            {/* ─── ADD TENANT TEAM MEMBER DIALOG (tenant admins) ─── */}
            {isTenantAdmin && (
              <DialogContent className="sm:max-w-[440px]">
                <DialogHeader>
                  <DialogTitle>Provision Team Member</DialogTitle>
                  <DialogDescription>Create a new security or billing account for your organization.</DialogDescription>
                </DialogHeader>
                <form onSubmit={(e) => { e.preventDefault(); addTenantStaffMutation.mutate(tenantStaffForm); }} className="space-y-3 pt-2">
                  <Field label="Work Email Address"><Input required type="email" value={tenantStaffForm.email} onChange={tsf("email")} placeholder="engineer@yourcompany.com" /></Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Full Name"><Input required value={tenantStaffForm.name} onChange={tsf("name")} placeholder="Full Name" /></Field>
                    <Field label="Job Title"><Input value={tenantStaffForm.jobTitle} onChange={tsf("jobTitle")} placeholder="Security Engineer" /></Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Phone"><Input value={tenantStaffForm.phone} onChange={tsf("phone")} placeholder="+251..." /></Field>
                    <Field label="Internal Role">
                      <Select value={tenantStaffForm.role} onValueChange={(v) => setTenantStaffForm({ ...tenantStaffForm, role: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="security_engineer">Security Engineer</SelectItem>
                          <SelectItem value="security_analyst">Security Analyst</SelectItem>
                          <SelectItem value="billing_admin">Billing Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                  <Field label="Initial Password"><PasswordField value={tenantStaffForm.password} onChange={(v) => setTenantStaffForm({ ...tenantStaffForm, password: v })} /></Field>
                  <Button type="submit" className="w-full mt-2 glow-primary" disabled={addTenantStaffMutation.isPending}>
                    {addTenantStaffMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Provision Access
                  </Button>
                </form>
              </DialogContent>
            )}
          </Dialog>
        </div>

        {/* Reset Password Dialog */}
        <Dialog open={!!resetTarget} onOpenChange={(open) => { if (!open) { setResetTarget(null); } }}>
          <DialogContent className="sm:max-w-[380px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-primary" /> Dispatch Reset Link</DialogTitle>
              <DialogDescription>
                Are you sure you want to send a password reset link to <strong>{resetTarget?.name}</strong> ({resetTarget?.email})?
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setResetTarget(null)}>Cancel</Button>
              <Button onClick={() => resetTarget && resetMutation.mutate({ id: resetTarget.id })} disabled={resetMutation.isPending} className="glow-primary">
                {resetMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Send Reset Link
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* View User Dialog */}
        <Dialog open={!!viewTarget} onOpenChange={(open) => { if (!open) setViewTarget(null); }}>
          <DialogContent className="sm:max-w-[440px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Eye className="h-5 w-5 text-primary" /> Account Details</DialogTitle>
              <DialogDescription>Full profile information for {viewTarget?.name}.</DialogDescription>
            </DialogHeader>
            {viewTarget && (
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><p className="text-[10px] font-bold text-muted-foreground uppercase">Full Name</p><p className="text-sm font-medium">{viewTarget.name}</p></div>
                  <div><p className="text-[10px] font-bold text-muted-foreground uppercase">Email Address</p><p className="text-sm font-medium">{viewTarget.email}</p></div>
                  <div><p className="text-[10px] font-bold text-muted-foreground uppercase">Phone</p><p className="text-sm font-medium">{viewTarget.phone || "—"}</p></div>
                  <div><p className="text-[10px] font-bold text-muted-foreground uppercase">Job Title</p><p className="text-sm font-medium">{viewTarget.jobTitle || "—"}</p></div>
                  <div><p className="text-[10px] font-bold text-muted-foreground uppercase">Account Role</p><span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${getRoleColor(viewTarget.role)}`}>{getRoleLabel(viewTarget.role)}</span></div>
                  <div><p className="text-[10px] font-bold text-muted-foreground uppercase">Status</p><span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${viewTarget.isActive ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive"}`}>{viewTarget.isActive ? "ACTIVE" : "SUSPENDED"}</span></div>
                  <div><p className="text-[10px] font-bold text-muted-foreground uppercase">Tenant ID</p><p className="text-xs font-mono">{viewTarget.tenantId || "N/A"}</p></div>
                  <div><p className="text-[10px] font-bold text-muted-foreground uppercase">Joined Date</p><p className="text-sm">{new Date(viewTarget.createdAt).toLocaleDateString()}</p></div>
                </div>
              </div>
            )}
            <div className="flex justify-end">
              <Button onClick={() => setViewTarget(null)}>Close</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit User Dialog */}
        <Dialog open={!!editTarget} onOpenChange={(open) => {
          if (!open) setEditTarget(null);
          else if (editTarget) setEditForm({ name: editTarget.name, phone: editTarget.phone || "", jobTitle: editTarget.jobTitle || "", role: editTarget.role });
        }}>
          <DialogContent className="sm:max-w-[440px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><UserCog className="h-5 w-5 text-primary" /> Modify Profile</DialogTitle>
              <DialogDescription>Update the account properties for {editTarget?.email}.</DialogDescription>
            </DialogHeader>
            <form onSubmit={(e) => {
              e.preventDefault();
              if (editTarget) updateUserMutation.mutate({ id: editTarget.id, ...editForm });
            }} className="space-y-4 pt-4">
              <Field label="Full Name"><Input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} required /></Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Job Title"><Input value={editForm.jobTitle} onChange={e => setEditForm({ ...editForm, jobTitle: e.target.value })} /></Field>
                <Field label="Phone"><Input value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} /></Field>
              </div>
              <Field label="Role">
                <Select value={editForm.role} onValueChange={(v) => setEditForm({ ...editForm, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {activeTab === "system" ? (
                      <>
                        <SelectItem value="super_admin">Super Admin</SelectItem>
                        <SelectItem value="support_engineer">Support Engineer</SelectItem>
                      </>
                    ) : (
                      <>
                        <SelectItem value="tenant_admin">Tenant Admin</SelectItem>
                        <SelectItem value="security_engineer">Security Engineer</SelectItem>
                        <SelectItem value="security_analyst">Security Analyst</SelectItem>
                        <SelectItem value="billing_admin">Billing Admin</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </Field>
              <Button type="submit" className="w-full glow-primary" disabled={updateUserMutation.isPending}>
                {updateUserMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />} SAVE CHANGES
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        {/* User Table */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className={`px-6 py-3 border-b border-border flex items-center gap-2 text-xs font-mono font-bold ${activeTab === "system" ? "text-primary bg-primary/5" : "text-emerald-400 bg-emerald-500/5"
            }`}>
            {activeTab === "system" ? <><ShieldCheck className="h-3.5 w-3.5" /> SYSTEM STAFF — Internal WAF Portal Access</>
              : <><Building2 className="h-3.5 w-3.5" /> CLIENT ACCOUNTS — Registered Organizations</>}
          </div>
          {(isLoadingUsers || (activeTab === "clients" && isLoadingClients)) ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : (
            <>
              {renderPagination("top")}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left bg-muted/20">
                      <th className="px-6 py-4 text-xs text-muted-foreground font-medium">{activeTab === "clients" ? "Organization" : "User"}</th>
                      <th className="px-6 py-4 text-xs text-muted-foreground font-medium">Contact</th>
                      <th className="px-6 py-4 text-xs text-muted-foreground font-medium text-center">Status</th>
                      {activeTab === "clients" ? (
                        <>
                          <th className="px-6 py-4 text-xs text-muted-foreground font-medium">Industry</th>
                          <th className="px-6 py-4 text-xs text-muted-foreground font-medium">Plan</th>
                        </>
                      ) : (
                        <>
                          <th className="px-6 py-4 text-xs text-muted-foreground font-medium">Role</th>
                          <th className="px-6 py-4 text-xs text-muted-foreground font-medium">Joined</th>
                        </>
                      )}
                      <th className="px-6 py-4 text-xs text-muted-foreground font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedUsers.map((u) => {
                      return (
                        <tr key={u.id} className="border-b border-border/50 hover:bg-muted/10 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${activeTab === "system" ? "bg-primary/10 border border-primary/20" : "bg-emerald-500/10 border border-emerald-500/20"}`}>
                                <span className={`font-mono font-bold text-sm ${activeTab === "system" ? "text-primary" : "text-emerald-400"}`}>
                                  {(u.name || "?").substring(0, 2).toUpperCase()}
                                </span>
                              </div>
                              <div>
                                <p className="font-medium text-sm">{u.name || "—"}</p>
                                {activeTab === "clients" && (u as ClientTenantData).legalName && (u as ClientTenantData).legalName !== u.name && (
                                  <p className="text-[11px] text-muted-foreground">{(u as ClientTenantData).legalName}</p>
                                )}
                                {activeTab === "system" && (u as UserData).jobTitle && (
                                  <p className="text-[11px] text-muted-foreground">{(u as UserData).jobTitle}</p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-xs text-muted-foreground font-mono flex items-center gap-1"><Mail className="h-3 w-3 shrink-0" />{u.email || "—"}</p>
                            {u.phone && <p className="text-[11px] text-muted-foreground mt-0.5">{u.phone}</p>}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${u.isActive ? "bg-success/20 text-success border border-success/30" : "bg-destructive/20 text-destructive border border-destructive/30"}`}>
                              {u.isActive ? "Active" : "Suspended"}
                            </span>
                          </td>
                          {activeTab === "clients" ? (
                            <>
                              <td className="px-6 py-4">
                                <span className="text-xs text-muted-foreground">{(u as ClientTenantData).industry || "—"}</span>
                              </td>
                              <td className="px-6 py-4">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase ${(u as ClientTenantData).plan === "Enterprise" ? "bg-violet-500/15 text-violet-400 border border-violet-500/20" :
                                  (u as ClientTenantData).plan === "Professional" ? "bg-primary/15 text-primary border border-primary/20" :
                                    "bg-muted/30 text-muted-foreground border border-border"
                                  }`}>{(u as ClientTenantData).plan || "Free"}</span>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-6 py-4">
                                <span className={`px-2 py-1 rounded font-mono text-[10px] uppercase font-bold ${getRoleColor(u.role)}`}>{getRoleLabel(u.role)}</span>
                              </td>
                              <td className="px-6 py-4">
                                <span className="text-xs text-muted-foreground font-mono">
                                  {u.createdAt ? new Date(u.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                                </span>
                              </td>
                            </>
                          )}
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-end gap-2">
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setViewTarget(u)} title="View Account Details">
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => { setEditTarget(u); setEditForm({ name: u.name, phone: u.phone || "", jobTitle: u.jobTitle || "", role: u.role }); }} title="Edit Account">
                                <UserCog className="h-4 w-4" />
                              </Button>

                              {activeTab === "clients" && isPlatformAdmin && (
                                <Button variant="ghost" size="sm"
                                  className="h-8 text-[10px] font-mono text-primary hover:text-primary hover:bg-primary/10"
                                  onClick={async () => {
                                    const tid = activeTab === "clients" ? (u as ClientTenantData).tenantId : (u as UserData).tenantId || "";
                                    const result = await impersonateTenant(tid);
                                    if (result.error) {
                                      toast({ title: "Impersonation Failed", description: result.error, variant: "destructive" });
                                    } else {
                                      toast({ title: "Masquerade Active", description: "You are now interacting as this organization." });
                                      queryClient.clear();
                                      navigate("/");
                                    }
                                  }}>
                                  <LogIn className="h-3.5 w-3.5 mr-1" /> MASQUERADE
                                </Button>
                              )}

                              {u.isActive ? (
                                <Button variant="ghost" size="sm"
                                  className="h-8 text-[10px] font-mono text-warning hover:text-warning hover:bg-warning/10"
                                  onClick={() => updateUserMutation.mutate({ id: u.id, isActive: false })}>
                                  <EyeOff className="h-3.5 w-3.5 mr-1" /> REVOKE
                                </Button>
                              ) : (
                                <Button variant="ghost" size="sm"
                                  className="h-8 text-[10px] font-mono text-success hover:text-success hover:bg-success/10"
                                  onClick={() => updateUserMutation.mutate({ id: u.id, isActive: true })}>
                                  <ShieldCheck className="h-3.5 w-3.5 mr-1" /> GRANT
                                </Button>
                              )}

                              <Button variant="ghost" size="sm"
                                className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                disabled={u.role === "super_admin" || u.id === user?.id}
                                onClick={() => { if (window.confirm("Permanently delete this user? This cannot be undone.")) deleteMutation.mutate(u.id); }}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {displayUsers.length === 0 && (
                      <tr><td colSpan={6} className="px-6 py-12 text-center">
                        <div className="flex flex-col items-center gap-3">
                          {activeTab === "system" ? <ShieldCheck className="h-8 w-8 text-muted-foreground/30" /> : <Building2 className="h-8 w-8 text-muted-foreground/30" />}
                          <p className="text-sm text-muted-foreground">No {activeTab === "system" ? "system staff" : "client accounts"} found.</p>
                          <p className="text-xs text-muted-foreground/60">Use the button above to {activeTab === "system" ? "add internal staff" : "register a client"}.</p>
                        </div>
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {renderPagination("bottom")}
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

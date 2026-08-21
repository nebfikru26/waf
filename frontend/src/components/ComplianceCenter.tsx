import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Shield, Scale, Gavel, History, CheckCircle2, AlertTriangle, RefreshCw, Lock, Download, Info, Loader2, BadgeCheck, FileJson, MapPin, Search, ShieldAlert, Clock, Timer, ClipboardList, KeyRound, PackageCheck, Plus, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";

interface ComplianceProclamation {
    id: string;
    name: string;
    status: string;
    detail: string;
}

interface ComplianceStatus {
    proclamations: ComplianceProclamation[];
    auditHealth: {
        isIntegrityVerified: boolean;
        lastChecked: string;
        totalAuditEntries: number;
    };
    retentionStatus: {
        storageTier: string;
        ttl: string;
        totalObservedRequests: number;
    };
}

interface SystemConfig {
    ecaCertificationNumber?: string;
    [key: string]: unknown;
}

interface ResidencyZone {
    code: string;
    name: string;
    countryCode: string;
    facilityProvider?: string;
    isInCountry: boolean;
    isDefault: boolean;
    allowedDataClasses: string;
    tenantCount: number;
}

interface ResidencyTenantRow {
    tenantId: string;
    tenantName: string;
    industry?: string;
    zoneCode: string;
    zoneName: string;
    isInCountry: boolean;
    requiresInCountry: boolean;
    isCompliant: boolean;
    lastVerifiedAt?: string;
}

interface DataSovereigntyOverview {
    zones: ResidencyZone[];
    tenants: ResidencyTenantRow[];
    summary: {
        totalTenants: number;
        inCountryCount: number;
        regulatedCount: number;
        nonCompliantCount: number;
    };
}

interface ResidencyHistoryEntry {
    id: string;
    tenantId: string;
    zoneCode: string;
    previousZoneCode?: string;
    reason?: string;
    changedByEmail?: string;
    changedAt: string;
}

interface IncidentClock {
    id: string;
    tenantId: string;
    title: string;
    severity: string;
    status: string;
    detectedAt: string;
    certDeadline: string;
    reportedToCertAt?: string;
    breachDeadline: string;
    reportedAsBreachAt?: string;
    resolvedAt?: string;
    notes?: string;
}

interface ProcessingRecord {
    id: string;
    tenantId: string;
    purpose: string;
    dataCategories: string;
    legalBasis: string;
    retentionPeriod: string;
    subProcessors?: string;
    dpiaRequired: boolean;
    dpiaSummary?: string;
    dpiaCompletedAt?: string;
    updatedAt: string;
}

interface KeyCustodyRecord {
    id: string;
    tenantId?: string;
    scope: string;
    keyManagementSystem: string;
    isInCountry: boolean;
    custodian?: string;
    verifiedAt?: string;
    createdAt: string;
}

const Label = ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <label className={`block font-medium ${className}`}>{children}</label>
);

export const ComplianceCenter = () => {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [isExporting, setIsExporting] = useState(false);
    const headers = { "Content-Type": "application/json" };

    const { data, isLoading, refetch } = useQuery<ComplianceStatus>({
        queryKey: ["compliance-status"],
        queryFn: () => fetch("/api/compliance/status", { headers }).then(r => r.json())
    });

    const { data: sysConfig } = useQuery<SystemConfig>({
        queryKey: ["admin-sys-config"],
        queryFn: () => fetch("/api/platform/config", { headers }).then(r => r.json())
    });

    const updateCertNumber = useMutation({
        mutationFn: async (certNumber: string) => {
            const res = await fetch("/api/platform/config", {
                method: "PUT",
                headers,
                body: JSON.stringify({ ...sysConfig, ecaCertificationNumber: certNumber })
            });
            if (!res.ok) throw new Error("Failed to update config");
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin-sys-config"] });
            toast({ title: "Certification Saved", description: "Your ECA number has been registered on the platform." });
        }
    });

    const verifyIntegrity = useMutation({
        mutationFn: async () => {
            const res = await fetch("/api/compliance/logs/verify", { method: "POST", headers });
            return res.json();
        },
        onSuccess: (result) => {
            if (result.isValid) {
                toast({ title: "Integrity Verified ✓", description: "Cryptographic chain of trust is intact." });
            } else {
                toast({ title: "Integrity Failure!", description: "Audit trail tampering detected!", variant: "destructive" });
            }
            refetch();
        }
    });

    const handleExport = async () => {
        setIsExporting(true);
        try {
            const res = await fetch("/api/compliance/report/export", { headers });
            if (!res.ok) throw new Error("Export failed");
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `Compliance_Evidence_${new Date().toISOString().split("T")[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            toast({ title: "Evidence Exported", description: "Your compliance report is ready for submission." });
        } catch {
            toast({ title: "Export Failed", variant: "destructive" });
        } finally {
            setIsExporting(false);
        }
    };

    // --- Data Sovereignty: management + inspection ---
    const [residencySearch, setResidencySearch] = useState("");
    const [historyTenant, setHistoryTenant] = useState<{ id: string; name: string } | null>(null);

    const { data: sovereignty, isLoading: isSovereigntyLoading } = useQuery<DataSovereigntyOverview>({
        queryKey: ["data-sovereignty"],
        queryFn: () => fetch("/api/compliance/data-sovereignty", { headers }).then(r => r.json())
    });

    const { data: residencyHistory, isLoading: isHistoryLoading } = useQuery<ResidencyHistoryEntry[]>({
        queryKey: ["data-sovereignty-history", historyTenant?.id],
        queryFn: () => fetch(`/api/compliance/data-sovereignty/history?tenantId=${historyTenant?.id}`, { headers }).then(r => r.json()),
        enabled: !!historyTenant
    });

    const reassignZone = useMutation({
        mutationFn: async ({ tenantId, zoneCode, reason }: { tenantId: string; zoneCode: string; reason?: string }) => {
            const res = await fetch(`/api/compliance/data-sovereignty/tenants/${tenantId}`, {
                method: "PUT",
                headers,
                body: JSON.stringify({ zoneCode, reason })
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body?.message ?? "Failed to reassign residency zone");
            return body;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["data-sovereignty"] });
            toast({ title: "Residency Updated", description: "The tenant's data residency zone has been reassigned and logged." });
        },
        onError: (err: Error) => {
            toast({ title: "Reassignment Blocked", description: err.message, variant: "destructive" });
        }
    });

    const filteredTenants = useMemo(() => {
        const rows = sovereignty?.tenants ?? [];
        if (!residencySearch.trim()) return rows;
        const q = residencySearch.toLowerCase();
        return rows.filter(t => t.tenantName?.toLowerCase().includes(q) || t.industry?.toLowerCase().includes(q));
    }, [sovereignty, residencySearch]);

    // --- Incident Reporting Clocks (48h CERT / 72h breach SLAs) ---
    const { data: incidents, isLoading: isIncidentsLoading } = useQuery<IncidentClock[]>({
        queryKey: ["incident-clocks"],
        queryFn: () => fetch("/api/compliance/incidents", { headers }).then(r => r.json()),
        refetchInterval: 60_000
    });

    const reportCert = useMutation({
        mutationFn: async (id: string) => {
            const res = await fetch(`/api/compliance/incidents/${id}/report-cert`, { method: "POST", headers, body: JSON.stringify({}) });
            if (!res.ok) throw new Error("Failed to report to CERT");
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["incident-clocks"] });
            toast({ title: "Reported to National CERT", description: "48-hour deadline satisfied and logged." });
        }
    });

    const reportBreach = useMutation({
        mutationFn: async (id: string) => {
            const res = await fetch(`/api/compliance/incidents/${id}/report-breach`, { method: "POST", headers, body: JSON.stringify({}) });
            if (!res.ok) throw new Error("Failed to report breach");
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["incident-clocks"] });
            toast({ title: "Breach Notification Filed", description: "72-hour deadline satisfied and logged." });
        }
    });

    const resolveIncident = useMutation({
        mutationFn: async (id: string) => {
            const res = await fetch(`/api/compliance/incidents/${id}/resolve`, { method: "POST", headers, body: JSON.stringify({}) });
            if (!res.ok) throw new Error("Failed to resolve incident");
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["incident-clocks"] });
            toast({ title: "Incident Resolved" });
        }
    });

    const openIncidents = useMemo(() => (incidents ?? []).filter(i => i.status !== "Resolved"), [incidents]);

    const deadlineBadge = (deadline: string, reportedAt?: string) => {
        if (reportedAt) return <Badge variant="outline" className="text-[10px] gap-1 border-green-500/30 text-green-500 bg-green-500/10"><CheckCircle2 className="h-3 w-3" /> Reported</Badge>;
        const msLeft = new Date(deadline).getTime() - Date.now();
        const hoursLeft = msLeft / 3_600_000;
        if (msLeft <= 0) return <Badge variant="outline" className="text-[10px] gap-1 border-destructive/30 text-destructive bg-destructive/10"><AlertTriangle className="h-3 w-3" /> Overdue</Badge>;
        const urgent = hoursLeft < 6;
        return (
            <Badge variant="outline" className={`text-[10px] gap-1 ${urgent ? "border-amber-500/30 text-amber-500 bg-amber-500/10" : "border-border text-muted-foreground"}`}>
                <Timer className="h-3 w-3" /> {hoursLeft.toFixed(1)}h left
            </Badge>
        );
    };

    // --- Data Processing Register + DPIA ---
    const [registerTenantId, setRegisterTenantId] = useState("");
    const [showRegisterForm, setShowRegisterForm] = useState(false);
    const { data: processingRegister, isLoading: isRegisterLoading } = useQuery<ProcessingRecord[]>({
        queryKey: ["processing-register"],
        queryFn: () => fetch("/api/compliance/processing-register", { headers }).then(r => r.json())
    });

    const createRecord = useMutation({
        mutationFn: async (payload: Record<string, unknown>) => {
            const res = await fetch("/api/compliance/processing-register", { method: "POST", headers, body: JSON.stringify(payload) });
            if (!res.ok) throw new Error("Failed to create processing record");
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["processing-register"] });
            setShowRegisterForm(false);
            toast({ title: "Processing Record Added", description: "Entry recorded in the Article 30-style register." });
        }
    });

    // --- Key Custody ---
    const { data: keyCustody, isLoading: isKeyCustodyLoading } = useQuery<KeyCustodyRecord[]>({
        queryKey: ["key-custody"],
        queryFn: () => fetch("/api/compliance/key-custody", { headers }).then(r => r.json())
    });

    const verifyKeyCustody = useMutation({
        mutationFn: async (id: string) => {
            const res = await fetch(`/api/compliance/key-custody/${id}/verify`, { method: "POST", headers });
            if (!res.ok) throw new Error("Verification failed");
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["key-custody"] });
            toast({ title: "Key Custody Verified" });
        }
    });

    // --- Certified Audit Package Export ---
    const [isExportingPackage, setIsExportingPackage] = useState(false);
    const handleAuditPackageExport = async () => {
        setIsExportingPackage(true);
        try {
            const res = await fetch("/api/compliance/audit-package/export", { headers });
            if (!res.ok) throw new Error("Export failed");
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `INSA_Audit_Package_${new Date().toISOString().split("T")[0]}.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            toast({ title: "Audit Package Ready", description: "Bundle exported for a certified third-party auditor." });
        } catch {
            toast({ title: "Export Failed", variant: "destructive" });
        } finally {
            setIsExportingPackage(false);
        }
    };

    if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

    const isRegistered = !!sysConfig?.ecaCertificationNumber;

    return (
        <div className="space-y-6">
            {/* Header + ECA Badge */}
            <div className="flex flex-col md:flex-row justify-between gap-4">
                <div className="space-y-1">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <Scale className="h-5 w-5 text-primary" /> Regulatory Compliance Center
                    </h2>
                    <p className="text-sm text-muted-foreground italic">Technical oversight of Ethiopian Federal SECaaS Requirements</p>
                </div>
                <div className="flex flex-wrap gap-2 h-fit">
                    <div className={`px-3 py-1.5 rounded-full flex items-center gap-2 text-[10px] font-bold uppercase font-mono border ${isRegistered ? "bg-green-500/10 border-green-500/30 text-green-500" : "bg-amber-500/10 border-amber-500/30 text-amber-500"}`}>
                        {isRegistered ? <BadgeCheck className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                        {isRegistered ? `ECA-REG: ${sysConfig.ecaCertificationNumber}` : "ECA: Unregistered"}
                    </div>
                    <div className="px-3 py-1.5 bg-primary/10 border border-primary/20 rounded-full flex items-center gap-2 text-[10px] font-bold text-primary uppercase font-mono">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Certified Data Processor
                    </div>
                </div>
            </div>

            {/* ECA Registration Control */}
            <div className="bg-card border border-amber-500/20 rounded-xl p-5 space-y-4">
                <div className="flex items-center gap-2">
                    <BadgeCheck className="h-4 w-4 text-amber-500" />
                    <h3 className="text-sm font-bold">ECA Data Processor Registration</h3>
                    <span className="text-[10px] bg-amber-500/10 text-amber-500 px-2 py-0.5 rounded border border-amber-500/20 font-mono uppercase">Proclamation 1321/2024</span>
                </div>
                <p className="text-[11px] text-muted-foreground">Enter the official certification number issued by the Ethiopian Communications Authority (ECA) upon successful registration as a data processor.</p>
                <div className="flex gap-3">
                    <Input
                        className="font-mono text-sm bg-muted/20 max-w-xs"
                        placeholder="e.g. ECA-DP-2026-0042"
                        defaultValue={sysConfig?.ecaCertificationNumber ?? ""}
                        id="eca-cert-input"
                    />
                    <Button
                        variant="outline"
                        className="border-amber-500/30 hover:bg-amber-500/5 text-amber-500 font-bold text-[10px]"
                        onClick={() => {
                            const v = (document.getElementById("eca-cert-input") as HTMLInputElement)?.value;
                            if (v) updateCertNumber.mutate(v);
                        }}
                        disabled={updateCertNumber.isPending}
                    >
                        {updateCertNumber.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "REGISTER"}
                    </Button>
                </div>
            </div>

            {/* Proclamation Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {data?.proclamations.map((proc) => (
                    <div key={proc.id} className="bg-card border border-border p-5 rounded-xl space-y-3 shadow-sm hover:border-primary/30 transition-all group">
                        <div className="flex justify-between items-start">
                            <div className="h-10 w-10 bg-muted/30 rounded-lg flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                                <Gavel className="h-5 w-5 text-muted-foreground group-hover:text-primary" />
                            </div>
                            <span className="text-[10px] font-bold px-2 py-0.5 bg-green-500/10 text-green-500 rounded border border-green-500/20 uppercase">{proc.status}</span>
                        </div>
                        <div>
                            <h4 className="text-xs font-bold text-muted-foreground uppercase">{proc.id}</h4>
                            <h3 className="text-sm font-bold">{proc.name}</h3>
                            <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{proc.detail}</p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Audit Integrity */}
                <div className="lg:col-span-2 bg-[#0a192f] border-2 border-primary/40 rounded-2xl overflow-hidden shadow-[0_0_30px_rgba(59,130,246,0.15)] relative group">
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent pointer-events-none group-hover:from-primary/20 transition-all duration-500" />
                    <div className="p-6 space-y-6 relative">
                        <div className="flex justify-between items-center border-b border-border/50 pb-4">
                            <h3 className="text-lg font-bold flex items-center gap-2 font-mono uppercase tracking-tighter">
                                <History className="h-5 w-5 text-primary" /> Immutable Audit Chain
                            </h3>
                            <div className="flex items-center gap-3">
                                {data?.auditHealth.isIntegrityVerified ? (
                                    <span className="flex items-center gap-1.5 text-xs text-green-500 font-bold px-3 py-1 bg-green-500/10 rounded-full border border-green-500/20">
                                        <Shield className="h-3.5 w-3.5" /> SECURE
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-1.5 text-xs text-destructive font-bold px-3 py-1 bg-destructive/10 rounded-full border border-destructive/20">
                                        <AlertTriangle className="h-3.5 w-3.5" /> TAMPERED
                                    </span>
                                )}
                                <Button
                                    size="sm"
                                    className="h-8 text-[10px] font-bold px-4 bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all"
                                    onClick={() => verifyIntegrity.mutate()}
                                    disabled={verifyIntegrity.isPending}
                                >
                                    {verifyIntegrity.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                                    VERIFY CHAIN
                                </Button>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-6">
                            <div className="space-y-1">
                                <Label className="text-[10px] text-muted-foreground uppercase font-mono tracking-widest">Total Entries</Label>
                                <div className="text-2xl font-bold font-mono">{data?.auditHealth.totalAuditEntries?.toLocaleString() ?? "—"}</div>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-[10px] text-muted-foreground uppercase font-mono tracking-widest">Hash Algorithm</Label>
                                <div className="text-xs font-mono text-primary/70 bg-primary/5 p-1 rounded">HMAC-SHA256</div>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-[10px] text-muted-foreground uppercase font-mono tracking-widest">Legal Basis</Label>
                                <div className="text-xs font-bold">Proc. 1321/2024 Art.19</div>
                            </div>
                        </div>

                        <div className="p-4 bg-muted/5 border border-border/50 rounded-xl space-y-2">
                            <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground"><Info className="h-3.5 w-3.5 text-primary" /> Technical Intelligence</div>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                                Every administrative action is cryptographically linked to the previous entry via HMAC-SHA256 chaining. Any attempt to delete or modify audit history is immediately detectable during verification.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Retention + Export */}
                <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
                    <h3 className="text-lg font-bold flex items-center gap-2 font-mono uppercase tracking-tighter">
                        <Lock className="h-5 w-5 text-primary" /> Data Retention
                    </h3>

                    <div className="p-4 rounded-xl bg-muted/20 space-y-3 border border-border/50">
                        <div className="flex justify-between items-center">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Retention Policy</span>
                            <span className="text-xs font-mono text-primary">365 DAYS</span>
                        </div>
                        <div className="h-2 w-full bg-border/30 rounded-full overflow-hidden">
                            <div className="h-full bg-primary w-[90%] shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
                        </div>
                        <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                            <span>START</span><span>329 DAYS</span><span>365</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 bg-muted/10 border border-border/50 rounded-lg text-center">
                            <div className="text-[9px] font-bold text-muted-foreground uppercase">Storage Tier</div>
                            <div className="text-xs font-bold mt-1">{data?.retentionStatus?.storageTier ?? "ClickHouse"}</div>
                        </div>
                        <div className="p-3 bg-primary/5 border border-primary/10 rounded-lg text-center">
                            <div className="text-[9px] font-bold text-primary uppercase">TTL State</div>
                            <div className="text-xs font-bold text-primary mt-1">PURGE ACTIVE</div>
                        </div>
                    </div>

                    <div className="text-[10px] text-muted-foreground italic leading-tight border-t border-border/50 pt-4">
                        "Service providers must retain traffic data for at least one year."<br />
                        — Computer Crime Proclamation 958/2016
                    </div>

                    <Button
                        className="w-full text-[10px] font-bold uppercase tracking-widest"
                        variant="outline"
                        onClick={handleExport}
                        disabled={isExporting}
                    >
                        {isExporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileJson className="h-4 w-4 mr-2 text-primary" />}
                        Export Evidence for INSA
                    </Button>
                </div>
            </div>

            {/* Data Sovereignty: management + inspection */}
            <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
                <div className="flex flex-col md:flex-row justify-between gap-4">
                    <div className="space-y-1">
                        <h3 className="text-lg font-bold flex items-center gap-2 font-mono uppercase tracking-tighter">
                            <MapPin className="h-5 w-5 text-primary" /> Data Sovereignty & Residency
                        </h3>
                        <p className="text-[11px] text-muted-foreground">
                            Where each tenant's logs, PII, and audit trail physically reside — required for in-country
                            residency of regulated sectors (Banking, Government, Telecom, Insurance, Healthcare).
                        </p>
                    </div>
                    <div className="relative w-full md:w-64">
                        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                            className="pl-8 h-9 text-xs"
                            placeholder="Search tenant or industry..."
                            value={residencySearch}
                            onChange={(e) => setResidencySearch(e.target.value)}
                        />
                    </div>
                </div>

                {/* Summary counters */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="p-3 bg-muted/10 border border-border/50 rounded-lg text-center">
                        <div className="text-[9px] font-bold text-muted-foreground uppercase">Total Tenants</div>
                        <div className="text-lg font-bold mt-1">{sovereignty?.summary.totalTenants ?? "—"}</div>
                    </div>
                    <div className="p-3 bg-green-500/5 border border-green-500/10 rounded-lg text-center">
                        <div className="text-[9px] font-bold text-green-500 uppercase">In-Country</div>
                        <div className="text-lg font-bold text-green-500 mt-1">{sovereignty?.summary.inCountryCount ?? "—"}</div>
                    </div>
                    <div className="p-3 bg-primary/5 border border-primary/10 rounded-lg text-center">
                        <div className="text-[9px] font-bold text-primary uppercase">Regulated Sector</div>
                        <div className="text-lg font-bold text-primary mt-1">{sovereignty?.summary.regulatedCount ?? "—"}</div>
                    </div>
                    <div className={`p-3 rounded-lg text-center border ${(sovereignty?.summary.nonCompliantCount ?? 0) > 0 ? "bg-destructive/5 border-destructive/20" : "bg-muted/10 border-border/50"}`}>
                        <div className={`text-[9px] font-bold uppercase ${(sovereignty?.summary.nonCompliantCount ?? 0) > 0 ? "text-destructive" : "text-muted-foreground"}`}>Non-Compliant</div>
                        <div className={`text-lg font-bold mt-1 ${(sovereignty?.summary.nonCompliantCount ?? 0) > 0 ? "text-destructive" : ""}`}>{sovereignty?.summary.nonCompliantCount ?? "—"}</div>
                    </div>
                </div>

                {/* Zone catalog */}
                <div className="flex flex-wrap gap-2">
                    {sovereignty?.zones.map(z => (
                        <div key={z.code} className={`px-3 py-1.5 rounded-full flex flex-col gap-0.5 text-[10px] font-bold uppercase font-mono border ${z.isInCountry ? "bg-green-500/10 border-green-500/30 text-green-500" : "bg-amber-500/10 border-amber-500/30 text-amber-500"}`}>
                            <span className="flex items-center gap-2"><MapPin className="h-3 w-3" /> {z.name} · {z.tenantCount}</span>
                            <span className="font-normal normal-case text-[9px] opacity-70">{z.allowedDataClasses}</span>
                        </div>
                    ))}
                </div>

                {/* Tenant residency table */}
                <div className="border border-border/50 rounded-xl overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="text-[10px] uppercase">Tenant</TableHead>
                                <TableHead className="text-[10px] uppercase">Industry</TableHead>
                                <TableHead className="text-[10px] uppercase">Residency Zone</TableHead>
                                <TableHead className="text-[10px] uppercase">Status</TableHead>
                                <TableHead className="text-[10px] uppercase text-right">Inspect</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isSovereigntyLoading && (
                                <TableRow><TableCell colSpan={5} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto text-primary" /></TableCell></TableRow>
                            )}
                            {!isSovereigntyLoading && filteredTenants.length === 0 && (
                                <TableRow><TableCell colSpan={5} className="text-center py-8 text-xs text-muted-foreground">No tenants match your search.</TableCell></TableRow>
                            )}
                            {filteredTenants.map(t => (
                                <TableRow key={t.tenantId}>
                                    <TableCell className="text-xs font-medium">{t.tenantName}</TableCell>
                                    <TableCell className="text-xs text-muted-foreground">{t.industry || "—"}</TableCell>
                                    <TableCell>
                                        <Select
                                            value={t.zoneCode}
                                            onValueChange={(zoneCode) => {
                                                const targetZone = sovereignty?.zones.find(z => z.code === zoneCode);
                                                const needsReason = t.requiresInCountry && targetZone && !targetZone.isInCountry;
                                                const reason = needsReason
                                                    ? window.prompt(`"${t.tenantName}" is in a regulated sector requiring in-country residency. Enter a documented exception reason to move it to "${targetZone?.name}":`) ?? undefined
                                                    : undefined;
                                                if (needsReason && !reason) return; // user cancelled
                                                reassignZone.mutate({ tenantId: t.tenantId, zoneCode, reason });
                                            }}
                                        >
                                            <SelectTrigger className="h-8 text-xs w-56">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {sovereignty?.zones.map(z => (
                                                    <SelectItem key={z.code} value={z.code} className="text-xs">
                                                        {z.name} {z.isInCountry ? "🇪🇹" : "🌐"}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </TableCell>
                                    <TableCell>
                                        {t.isCompliant ? (
                                            <Badge variant="outline" className="text-[10px] gap-1 border-green-500/30 text-green-500 bg-green-500/10">
                                                <CheckCircle2 className="h-3 w-3" /> Compliant
                                            </Badge>
                                        ) : (
                                            <Badge variant="outline" className="text-[10px] gap-1 border-destructive/30 text-destructive bg-destructive/10">
                                                <ShieldAlert className="h-3 w-3" /> Review Needed
                                            </Badge>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-7 text-[10px] gap-1"
                                            onClick={() => setHistoryTenant({ id: t.tenantId, name: t.tenantName })}
                                        >
                                            <History className="h-3.5 w-3.5" /> History
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </div>

            {/* Incident Reporting Clocks: 48h CERT / 72h Breach SLAs */}
            <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
                <div className="space-y-1">
                    <h3 className="text-lg font-bold flex items-center gap-2 font-mono uppercase tracking-tighter">
                        <Timer className="h-5 w-5 text-primary" /> Incident Reporting Clocks
                    </h3>
                    <p className="text-[11px] text-muted-foreground">
                        Auto-opened for every CRITICAL alert. National CERT notification is due within 48 hours
                        (Critical Infrastructure Cybersecurity Proclamation 1426/2026); personal-data breach
                        notification is due within 72 hours (Data Protection Proclamation 1321/2024).
                    </p>
                </div>

                <div className="border border-border/50 rounded-xl overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="text-[10px] uppercase">Incident</TableHead>
                                <TableHead className="text-[10px] uppercase">Tenant</TableHead>
                                <TableHead className="text-[10px] uppercase">CERT (48h)</TableHead>
                                <TableHead className="text-[10px] uppercase">Breach (72h)</TableHead>
                                <TableHead className="text-[10px] uppercase text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isIncidentsLoading && (
                                <TableRow><TableCell colSpan={5} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto text-primary" /></TableCell></TableRow>
                            )}
                            {!isIncidentsLoading && openIncidents.length === 0 && (
                                <TableRow><TableCell colSpan={5} className="text-center py-8 text-xs text-muted-foreground">No open incidents. All reporting clocks are clear.</TableCell></TableRow>
                            )}
                            {openIncidents.map(i => (
                                <TableRow key={i.id}>
                                    <TableCell className="text-xs font-medium max-w-xs truncate">{i.title}</TableCell>
                                    <TableCell className="text-xs text-muted-foreground">{i.tenantId}</TableCell>
                                    <TableCell>{deadlineBadge(i.certDeadline, i.reportedToCertAt)}</TableCell>
                                    <TableCell>{deadlineBadge(i.breachDeadline, i.reportedAsBreachAt)}</TableCell>
                                    <TableCell className="text-right space-x-1">
                                        {!i.reportedToCertAt && (
                                            <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={() => reportCert.mutate(i.id)} disabled={reportCert.isPending}>Report CERT</Button>
                                        )}
                                        {!i.reportedAsBreachAt && (
                                            <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={() => reportBreach.mutate(i.id)} disabled={reportBreach.isPending}>Report Breach</Button>
                                        )}
                                        <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={() => resolveIncident.mutate(i.id)} disabled={resolveIncident.isPending}>
                                            <CheckCheck className="h-3 w-3" /> Resolve
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </div>

            {/* Data Processing Register + DPIA */}
            <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
                <div className="flex flex-col md:flex-row justify-between gap-4">
                    <div className="space-y-1">
                        <h3 className="text-lg font-bold flex items-center gap-2 font-mono uppercase tracking-tighter">
                            <ClipboardList className="h-5 w-5 text-primary" /> Data Processing Register
                        </h3>
                        <p className="text-[11px] text-muted-foreground">
                            Per-tenant record of processing purpose, legal basis, retention, and DPIA status —
                            satisfies the processing-register obligation of Proclamation 1321/2024.
                        </p>
                    </div>
                    <Button size="sm" variant="outline" className="h-8 text-[10px] gap-1 w-fit" onClick={() => setShowRegisterForm(v => !v)}>
                        <Plus className="h-3.5 w-3.5" /> Add Record
                    </Button>
                </div>

                {showRegisterForm && (
                    <form
                        className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4 bg-muted/10 border border-border/50 rounded-xl"
                        onSubmit={(e) => {
                            e.preventDefault();
                            const form = e.currentTarget;
                            const data = new FormData(form);
                            createRecord.mutate({
                                tenantId: data.get("tenantId"),
                                purpose: data.get("purpose"),
                                dataCategories: data.get("dataCategories"),
                                legalBasis: data.get("legalBasis"),
                                retentionPeriod: data.get("retentionPeriod"),
                                subProcessors: data.get("subProcessors"),
                                dpiaRequired: data.get("dpiaRequired") === "on",
                                dpiaSummary: data.get("dpiaSummary")
                            });
                            form.reset();
                        }}
                    >
                        <Input name="tenantId" placeholder="Tenant ID" required className="text-xs" value={registerTenantId} onChange={e => setRegisterTenantId(e.target.value)} />
                        <Input name="purpose" placeholder="Processing purpose (e.g. Fraud detection)" required className="text-xs" />
                        <Input name="dataCategories" placeholder="Data categories (PII,Financial,...)" className="text-xs" />
                        <Select name="legalBasis" defaultValue="Contract">
                            <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Consent" className="text-xs">Consent</SelectItem>
                                <SelectItem value="Contract" className="text-xs">Contract</SelectItem>
                                <SelectItem value="Legal Obligation" className="text-xs">Legal Obligation</SelectItem>
                                <SelectItem value="Legitimate Interest" className="text-xs">Legitimate Interest</SelectItem>
                            </SelectContent>
                        </Select>
                        <Input name="retentionPeriod" placeholder="Retention (e.g. 365 Days)" defaultValue="365 Days" className="text-xs" />
                        <Input name="subProcessors" placeholder="Sub-processors (optional)" className="text-xs" />
                        <div className="flex items-center gap-2 md:col-span-2">
                            <Checkbox id="dpiaRequired" name="dpiaRequired" />
                            <label htmlFor="dpiaRequired" className="text-xs">DPIA required for this processing activity</label>
                        </div>
                        <Textarea name="dpiaSummary" placeholder="DPIA summary / risk mitigation notes (optional)" className="text-xs md:col-span-2" rows={2} />
                        <div className="md:col-span-2 flex justify-end gap-2">
                            <Button type="button" size="sm" variant="ghost" className="h-8 text-[10px]" onClick={() => setShowRegisterForm(false)}>Cancel</Button>
                            <Button type="submit" size="sm" className="h-8 text-[10px]" disabled={createRecord.isPending}>
                                {createRecord.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save Record"}
                            </Button>
                        </div>
                    </form>
                )}

                <div className="border border-border/50 rounded-xl overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="text-[10px] uppercase">Tenant</TableHead>
                                <TableHead className="text-[10px] uppercase">Purpose</TableHead>
                                <TableHead className="text-[10px] uppercase">Legal Basis</TableHead>
                                <TableHead className="text-[10px] uppercase">Retention</TableHead>
                                <TableHead className="text-[10px] uppercase">DPIA</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isRegisterLoading && (
                                <TableRow><TableCell colSpan={5} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto text-primary" /></TableCell></TableRow>
                            )}
                            {!isRegisterLoading && (processingRegister?.length ?? 0) === 0 && (
                                <TableRow><TableCell colSpan={5} className="text-center py-8 text-xs text-muted-foreground">No processing records yet. Add one to start the register.</TableCell></TableRow>
                            )}
                            {processingRegister?.map(r => (
                                <TableRow key={r.id}>
                                    <TableCell className="text-xs font-medium">{r.tenantId}</TableCell>
                                    <TableCell className="text-xs text-muted-foreground max-w-xs truncate">{r.purpose}</TableCell>
                                    <TableCell className="text-xs">{r.legalBasis}</TableCell>
                                    <TableCell className="text-xs">{r.retentionPeriod}</TableCell>
                                    <TableCell>
                                        {!r.dpiaRequired ? (
                                            <span className="text-[10px] text-muted-foreground">N/A</span>
                                        ) : r.dpiaCompletedAt ? (
                                            <Badge variant="outline" className="text-[10px] gap-1 border-green-500/30 text-green-500 bg-green-500/10"><CheckCircle2 className="h-3 w-3" /> Complete</Badge>
                                        ) : (
                                            <Badge variant="outline" className="text-[10px] gap-1 border-amber-500/30 text-amber-500 bg-amber-500/10"><AlertTriangle className="h-3 w-3" /> Pending</Badge>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </div>

            {/* Key Custody + Certified Audit Package Export */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-card border border-border rounded-2xl p-6 space-y-5">
                    <div className="space-y-1">
                        <h3 className="text-lg font-bold flex items-center gap-2 font-mono uppercase tracking-tighter">
                            <KeyRound className="h-5 w-5 text-primary" /> Encryption Key Custody
                        </h3>
                        <p className="text-[11px] text-muted-foreground">
                            Data residing in-country still fails a sovereignty review if its decryption key is
                            held by a foreign KMS. This tracks where every key actually lives.
                        </p>
                    </div>
                    <div className="border border-border/50 rounded-xl overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="text-[10px] uppercase">Scope</TableHead>
                                    <TableHead className="text-[10px] uppercase">Key Management System</TableHead>
                                    <TableHead className="text-[10px] uppercase">Custody</TableHead>
                                    <TableHead className="text-[10px] uppercase text-right">Verify</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isKeyCustodyLoading && (
                                    <TableRow><TableCell colSpan={4} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto text-primary" /></TableCell></TableRow>
                                )}
                                {keyCustody?.map(k => (
                                    <TableRow key={k.id}>
                                        <TableCell className="text-xs font-medium">{k.scope}</TableCell>
                                        <TableCell className="text-xs text-muted-foreground">{k.keyManagementSystem}</TableCell>
                                        <TableCell>
                                            {k.isInCountry ? (
                                                <Badge variant="outline" className="text-[10px] gap-1 border-green-500/30 text-green-500 bg-green-500/10">🇪🇹 In-Country</Badge>
                                            ) : (
                                                <Badge variant="outline" className="text-[10px] gap-1 border-amber-500/30 text-amber-500 bg-amber-500/10">🌐 Foreign</Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button size="sm" variant="ghost" className="h-7 text-[10px] gap-1" onClick={() => verifyKeyCustody.mutate(k.id)} disabled={verifyKeyCustody.isPending}>
                                                <RefreshCw className="h-3 w-3" /> {k.verifiedAt ? new Date(k.verifiedAt).toLocaleDateString() : "Verify"}
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </div>

                <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
                    <h3 className="text-lg font-bold flex items-center gap-2 font-mono uppercase tracking-tighter">
                        <PackageCheck className="h-5 w-5 text-primary" /> Certified Audit Package
                    </h3>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Bundles data residency overview, change history, incident reporting clocks, the
                        processing register, key custody records, and audit-chain integrity proof into one
                        ZIP — ready for an INSA-certified third-party auditor.
                    </p>
                    <Button
                        className="w-full text-[10px] font-bold uppercase tracking-widest"
                        variant="outline"
                        onClick={handleAuditPackageExport}
                        disabled={isExportingPackage}
                    >
                        {isExportingPackage ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2 text-primary" />}
                        Export Audit Package
                    </Button>
                </div>
            </div>

            <Dialog open={!!historyTenant} onOpenChange={(open) => !open && setHistoryTenant(null)}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-base">
                            <History className="h-4 w-4 text-primary" /> Residency History — {historyTenant?.name}
                        </DialogTitle>
                        <DialogDescription>Full audit trail of data residency zone changes for this tenant.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                        {isHistoryLoading && <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>}
                        {!isHistoryLoading && (residencyHistory?.length ?? 0) === 0 && (
                            <p className="text-xs text-muted-foreground text-center py-6">No residency changes recorded yet — tenant is on its default zone.</p>
                        )}
                        {residencyHistory?.map(h => (
                            <div key={h.id} className="p-3 border border-border/50 rounded-lg space-y-1">
                                <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
                                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {new Date(h.changedAt).toLocaleString()}</span>
                                    <span>{h.changedByEmail ?? "system"}</span>
                                </div>
                                <div className="text-xs">
                                    <span className="text-muted-foreground">{h.previousZoneCode ?? "—"}</span>
                                    <span className="mx-1.5">→</span>
                                    <span className="font-bold">{h.zoneCode}</span>
                                </div>
                                {h.reason && <div className="text-[11px] text-muted-foreground italic">Reason: {h.reason}</div>}
                            </div>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};

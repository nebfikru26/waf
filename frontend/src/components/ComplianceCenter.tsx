import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Shield, Scale, Gavel, History, CheckCircle2, AlertTriangle, RefreshCw, Lock, Download, Info, Loader2, BadgeCheck, FileJson, MapPin, Search, ShieldAlert, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
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
                        <div key={z.code} className={`px-3 py-1.5 rounded-full flex items-center gap-2 text-[10px] font-bold uppercase font-mono border ${z.isInCountry ? "bg-green-500/10 border-green-500/30 text-green-500" : "bg-amber-500/10 border-amber-500/30 text-amber-500"}`}>
                            <MapPin className="h-3 w-3" /> {z.name} · {z.tenantCount}
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

            {/* Residency change history dialog */}
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

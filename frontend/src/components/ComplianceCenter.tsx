import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Shield, Scale, Gavel, History, CheckCircle2, AlertTriangle, RefreshCw, Lock, Download, Info, Loader2, BadgeCheck, FileJson } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

const Label = ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <label className={`block font-medium ${className}`}>{children}</label>
);

export const ComplianceCenter = () => {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [isExporting, setIsExporting] = useState(false);
    const headers = { "Authorization": `Bearer ${localStorage.getItem("auth_token")}`, "Content-Type": "application/json" };

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
        </div>
    );
};

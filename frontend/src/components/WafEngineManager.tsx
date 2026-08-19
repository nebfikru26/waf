import { useState, useEffect } from "react";
import { Loader2, RefreshCw, Server, Eye, History, CheckCircle2, AlertTriangle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface PreviewRule {
    id: string;
    name: string;
    category: string;
    severity: string;
}

interface SyncBatch {
    tag: string;
    count: number;
    importedAt: string;
}

export function WafEngineManager() {
    const { toast } = useToast();
    const headers = {
      "Content-Type": "application/json"
    };

    const [isCrsSyncing, setIsCrsSyncing] = useState(false);
    const [isGitHubSyncing, setIsGitHubSyncing] = useState(false);
    const [isPreviewing, setIsPreviewing] = useState(false);
    const [previewRules, setPreviewRules] = useState<PreviewRule[]>([]);
    const [batches, setBatches] = useState<SyncBatch[]>([]);

    const fetchBatches = async () => {
        try {
            const res = await fetch("/api/firewall/crs/batches", { headers });
            if (res.ok) setBatches(await res.json());
        } catch (e) {
            console.error("Failed to fetch batches", e);
        }
    };

    useEffect(() => {
        fetchBatches();
    }, []);

    const previewCrsRules = async () => {
        setIsPreviewing(true);
        setPreviewRules([]);
        try {
            const res = await fetch("/api/firewall/crs/sync/preview", { headers });
            if (!res.ok) throw new Error("Failed to fetch preview.");
            const data = await res.json();
            setPreviewRules(data);
            if (data.length === 0) {
                toast({ title: "Rules Up to Date", description: "No new rules discovered in /opt/coraza." });
            }
        } catch (e: any) {
            toast({ title: "Preview Failed", description: e.message, variant: "destructive" });
        } finally {
            setIsPreviewing(false);
        }
    };

    const syncFromGitHub = async () => {
        if (!confirm("This will overwrite local rule files with the latest version from the official OWASP GitHub repository. Proceed?")) return;

        setIsGitHubSyncing(true);
        try {
            const res = await fetch("/api/firewall/crs/github-sync", {
                method: "POST", headers
            });
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.message || errorData.error || "GitHub Sync Failed.");
            }
            const data = await res.json();
            toast({ title: "GitHub Sync Complete", description: `Successfully updated rules files and discovered ${data.newRulesAdded} new items.` });
            fetchBatches();
        } catch (e: any) {
            toast({ title: "GitHub Sync Error", description: e.message, variant: "destructive" });
        } finally {
            setIsGitHubSyncing(false);
        }
    };

    const syncCrsRules = async () => {
        if (isCrsSyncing) return;
        setIsCrsSyncing(true);
        try {
            const res = await fetch("/api/firewall/crs/sync", {
                method: "POST", headers
            });
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.message || errorData.error || "Failed to sync CRS engine.");
            }
            const data = await res.json();
            toast({ title: "Engine Synced", description: `${data.newRulesAdded} rules added.` });
            setPreviewRules([]); // Clear preview after sync
            fetchBatches(); // Refresh history
        } catch (e: any) {
            toast({ title: "Sync Failed", description: e.message, variant: "destructive" });
        } finally {
            setIsCrsSyncing(false);
        }
    };

    return (
        <div className="space-y-8 pt-4 pb-12">
            {/* 1. Core Engine Management */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
                <div className="p-8 space-y-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                                <RefreshCw className={`h-6 w-6 text-primary ${isCrsSyncing || isGitHubSyncing ? 'animate-spin' : ''}`} />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold font-mono tracking-tight">CRS ORCHESTRATION</h3>
                                <p className="text-sm text-muted-foreground">Identify and merge new OWASP rules into the platform baseline.</p>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <Button variant="outline" onClick={syncFromGitHub} disabled={isGitHubSyncing || isCrsSyncing}>
                                {isGitHubSyncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2 text-primary" />}
                                FETCH FROM GITHUB
                            </Button>
                            <div className="w-[1px] bg-border mx-1" />
                            <Button variant="outline" onClick={previewCrsRules} disabled={isPreviewing || isCrsSyncing || isGitHubSyncing}>
                                {isPreviewing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Eye className="h-4 w-4 mr-2" />}
                                PREVIEW LOCAL
                            </Button>
                            <Button
                                variant="outline"
                                onClick={syncCrsRules}
                                disabled={isCrsSyncing || isPreviewing || isGitHubSyncing}
                                className="bg-primary/5 border-primary/40 text-primary shadow-[0_0_15px_rgba(59,130,246,0.1)] hover:bg-primary/10 transition-all font-bold"
                            >
                                {isCrsSyncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                                COMMIT SYNC
                            </Button>
                        </div>
                    </div>

                    <div className="bg-blue-500/5 border border-blue-500/20 p-4 rounded-xl flex gap-4">
                        <ShieldCheck className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-blue-700/80 leading-relaxed font-medium">
                            <strong>Safe-Sync Active:</strong> All discovered rules are tagged with the current sync batch and initialized in LOG mode.
                            This allows for observability before enforcing production blocks.
                        </p>
                    </div>
                </div>

                {/* 2. Preview Table */}
                {previewRules.length > 0 && (
                    <div className="border-t border-border bg-muted/20">
                        <div className="p-4 border-b border-border flex items-center justify-between bg-card">
                            <h4 className="text-xs font-bold uppercase tracking-widest text-primary flex items-center gap-2">
                                <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" /> Pending Import List ({previewRules.length} rules)
                            </h4>
                        </div>
                        <div className="max-h-[400px] overflow-y-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/30">
                                        <TableHead className="w-[100px]">ID</TableHead>
                                        <TableHead>Rule Name</TableHead>
                                        <TableHead>Category</TableHead>
                                        <TableHead>Severity</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {previewRules.map((rule) => (
                                        <TableRow key={rule.id}>
                                            <TableCell className="font-mono text-xs font-bold">{rule.id}</TableCell>
                                            <TableCell className="text-xs max-w-md truncate">{rule.name}</TableCell>
                                            <TableCell><Badge variant="outline" className="text-[10px] uppercase font-mono">{rule.category}</Badge></TableCell>
                                            <TableCell>
                                                <Badge className={`text-[10px] ${rule.severity === 'CRITICAL' ? 'bg-destructive/10 text-destructive border-destructive/20' : 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20'}`}>
                                                    {rule.severity}
                                                </Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                )}
            </div>

            {/* 3. Sync History */}
            <div className="space-y-4">
                <h3 className="text-lg font-bold flex items-center gap-2">
                    <History className="h-5 w-5 text-muted-foreground" /> Synchronization History
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {batches.map((batch) => (
                        <div key={batch.tag} className="bg-card border border-border rounded-xl p-5 space-y-4 shadow-sm hover:border-primary/40 transition-all group">
                            <div className="flex justify-between items-start">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">BATCH TAG</p>
                                    <p className="text-sm font-mono font-bold text-primary group-hover:text-primary transition-colors">{batch.tag}</p>
                                </div>
                                <div className="h-8 w-8 rounded-full bg-green-500/10 flex items-center justify-center text-green-600">
                                    <CheckCircle2 className="h-5 w-5" />
                                </div>
                            </div>

                            <div className="flex justify-between items-end pt-2 border-t border-border/50">
                                <div>
                                    <p className="text-[10px] font-bold text-muted-foreground uppercase">DATE</p>
                                    <p className="text-xs">{new Date(batch.importedAt).toLocaleString()}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-bold text-muted-foreground uppercase">RULES</p>
                                    <p className="text-xs font-bold font-mono">+{batch.count}</p>
                                </div>
                            </div>
                        </div>
                    ))}

                    {batches.length === 0 && (
                        <div className="lg:col-span-3 py-12 text-center border-2 border-dashed border-border rounded-2xl">
                            <p className="text-sm text-muted-foreground">No historical sync data available.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

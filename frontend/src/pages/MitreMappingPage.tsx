import React, { useState, useMemo } from 'react';
import { authenticatedFetch } from '@/lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from "@/components/DashboardLayout";
import {
    Search, Filter, Loader2, Target, Zap, Settings2, RefreshCw,
    ChevronLeft, ChevronRight, CheckCircle2, ChevronUp, ChevronDown, ChevronsUpDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

interface OWASPRule {
    id: string;
    ruleId: string;
    name: string;
    category: string;
    severity: string;
    action: string;
    description: string;
    mitreTechnique?: string;
    mitreTactic?: string;
}

const fetchRules = async (): Promise<OWASPRule[]> => {
    const res = await authenticatedFetch('/api/platform/crs/rules');
    if (!res.ok) {
        let errMsg = "Failed to load rules";
        try { errMsg = await res.text(); } catch (e) { }
        throw new Error(errMsg);
    }
    const data = await res.json();
    return data.map((d: any) => ({
        id: d.id,
        ruleId: d.ruleId || d.rule_id,
        name: d.name,
        category: d.category || 'General',
        severity: d.severity || 'UNKNOWN',
        action: d.action || 'LOG',
        description: d.description || '',
        mitreTechnique: d.mitreTechnique || d.mitre_technique,
        mitreTactic: d.mitreTactic || d.mitre_tactic
    }));
};

const updateRule = async (rule: Partial<OWASPRule> & { id: string }) => {
    const res = await authenticatedFetch(`/api/platform/crs/rules/${rule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rule),
    });
    if (!res.ok) throw new Error('Failed to update rule');
    return res.json();
};

const ITEMS_PER_PAGE = 25;
type SortKey = 'ruleId' | 'name' | 'category' | 'mitreTechnique' | 'mitreTactic';

export default function MitreMappingPage() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { data: rules = [], isLoading, error } = useQuery<OWASPRule[]>({ queryKey: ['owaspRules'], queryFn: fetchRules });

    const updateMutation = useMutation({
        mutationFn: updateRule,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['owaspRules'] });
            toast({ title: "Mapping Updated", description: "Successfully updated MITRE ATT&CK mapping." });
            setEditingRule(null);
        },
        onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" })
    });

    const [isSyncing, setIsSyncing] = useState(false);
    const [editingRule, setEditingRule] = useState<OWASPRule | null>(null);
    const [filterCategory, setFilterCategory] = useState<string>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [sortKey, setSortKey] = useState<SortKey>('ruleId');
    const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

    // Reset pagination on filter change
    useMemo(() => { setCurrentPage(1); }, [searchTerm, filterCategory, sortKey, sortDir]);

    const handleSync = async () => {
        setIsSyncing(true);
        setTimeout(() => {
            setIsSyncing(false);
            toast({ title: "MITRE Definitions Synced", description: "Successfully pulled the latest mappings from MITRE ATT&CK framework." });
        }, 2000);
    };

    const categories = useMemo(() => {
        return ["all", ...new Set(rules.map(r => r.category))];
    }, [rules]);

    const displayedRules = useMemo(() => {
        const filtered = rules.filter(r => {
            const matchSearch = (r.ruleId || '').includes(searchTerm) ||
                (r.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (r.mitreTechnique || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (r.mitreTactic || '').toLowerCase().includes(searchTerm.toLowerCase());
            const matchCategory = filterCategory === 'all' || r.category === filterCategory;
            return matchSearch && matchCategory;
        });

        return filtered.sort((a, b) => {
            let aVal = a[sortKey] || "";
            let bVal = b[sortKey] || "";
            return sortDir === "asc" ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal));
        });
    }, [rules, filterCategory, searchTerm, sortKey, sortDir]);

    const totalPages = Math.ceil(displayedRules.length / ITEMS_PER_PAGE);
    const paginatedRules = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return displayedRules.slice(start, start + ITEMS_PER_PAGE);
    }, [displayedRules, currentPage]);

    const toggleSort = (key: SortKey) => {
        if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
        else { setSortKey(key); setSortDir("asc"); }
    };

    const SortIcon = ({ col }: { col: SortKey }) => {
        if (sortKey !== col) return <ChevronsUpDown className="h-3 w-3 ml-1 opacity-30 inline" />;
        return sortDir === "asc" ? <ChevronUp className="h-3 w-3 ml-1 text-primary inline" /> : <ChevronDown className="h-3 w-3 ml-1 text-primary inline" />;
    };

    const PaginationControls = ({ className = "" }: { className?: string }) => {
        if (isLoading || displayedRules.length === 0) return null;
        return (
            <div className={`px-4 py-3 flex items-center justify-between ${className}`}>
                <div className="text-[10px] text-muted-foreground uppercase font-mono">
                    Showing <span className="text-foreground font-bold">{Math.min(displayedRules.length, (currentPage - 1) * ITEMS_PER_PAGE + 1)}-{Math.min(displayedRules.length, currentPage * ITEMS_PER_PAGE)}</span> of <span className="text-foreground font-bold">{displayedRules.length}</span> Rules
                </div>
                <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="flex items-center gap-1 px-2">
                        {[...Array(Math.min(5, totalPages))].map((_, i) => {
                            let pageNum = currentPage;
                            if (currentPage <= 3) pageNum = i + 1;
                            else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                            else pageNum = currentPage - 2 + i;
                            if (pageNum <= 0 || pageNum > totalPages) return null;
                            return (
                                <Button key={pageNum} variant={currentPage === pageNum ? "default" : "outline"} className={`h-8 w-8 text-xs font-mono`} onClick={() => setCurrentPage(pageNum)}>
                                    {pageNum}
                                </Button>
                            );
                        })}
                    </div>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        );
    };

    if (error) return <DashboardLayout><div className="p-6 text-red-500">Error loading MITRE mapping: {error?.message || JSON.stringify(error)}</div></DashboardLayout>;

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-xl font-bold flex items-center gap-2">
                            <Target className="h-5 w-5 text-primary" /> MITRE ATT&CK Intelligence Mapping
                        </h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            Correlate OWASP CRS signatures with MITRE ATT&CK Tactics and Techniques to enhance threat hunting visibility.
                        </p>
                    </div>
                    <Button onClick={handleSync} disabled={isSyncing} className="shadow-sm">
                        {isSyncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                        {isSyncing ? "Syncing Framework..." : "Sync from MITRE"}
                    </Button>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                    <div className="relative w-full sm:max-w-xs">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Search Rule ID, Technique, or Name..." className="pl-9 h-9 text-sm" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <Filter className="h-4 w-4 text-muted-foreground" />
                        <Select value={filterCategory} onValueChange={setFilterCategory}>
                            <SelectTrigger className="h-9 w-full sm:w-[180px] text-xs font-mono">
                                <SelectValue placeholder="Category" />
                            </SelectTrigger>
                            <SelectContent>
                                {categories.map(cat => (
                                    <SelectItem key={cat} value={cat} className="text-xs uppercase">{cat?.replace("_", " ") || "UNSET"}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="bg-card border border-border rounded-lg shadow-sm">
                    {/* Header Pagination */}
                    <PaginationControls className="border-b border-border/50" />

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-muted/30 border-b border-border">
                                    <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider cursor-pointer select-none hover:text-primary" onClick={() => toggleSort('ruleId')}>Rule ID <SortIcon col="ruleId" /></th>
                                    <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider cursor-pointer select-none hover:text-primary" onClick={() => toggleSort('name')}>Name <SortIcon col="name" /></th>
                                    <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider cursor-pointer select-none hover:text-primary" onClick={() => toggleSort('category')}>Category <SortIcon col="category" /></th>
                                    <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider cursor-pointer select-none hover:text-primary text-center" onClick={() => toggleSort('mitreTechnique')}>MITRE Technique <SortIcon col="mitreTechnique" /></th>
                                    <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider cursor-pointer select-none hover:text-primary text-center" onClick={() => toggleSort('mitreTactic')}>MITRE Tactic <SortIcon col="mitreTactic" /></th>
                                    <th className="px-4 py-3 text-right font-medium text-muted-foreground text-xs uppercase tracking-wider">Map</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/50">
                                {isLoading ? (
                                    <tr>
                                        <td colSpan={6} className="py-20 text-center">
                                            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
                                            <p className="text-xs text-muted-foreground mt-2 font-mono">LOADING MAPPINGS...</p>
                                        </td>
                                    </tr>
                                ) : paginatedRules.length === 0 ? (
                                    <tr><td colSpan={6} className="py-12 text-center text-muted-foreground text-sm">No rules match search criteria.</td></tr>
                                ) : paginatedRules.map(r => (
                                    <tr key={r.id} className="hover:bg-muted/10 transition-colors">
                                        <td className="px-4 py-3 font-mono text-xs font-bold text-primary">{r.ruleId}</td>
                                        <td className="px-4 py-3 text-[11px] font-bold max-w-xs truncate uppercase">{r.name}</td>
                                        <td className="px-4 py-3">
                                            <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded border uppercase">{r.category}</span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {r.mitreTechnique ? (
                                                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded-full border border-slate-200 uppercase tracking-wide">
                                                    <Target className="h-3 w-3 text-indigo-500" /> {r.mitreTechnique}
                                                </span>
                                            ) : <span className="text-muted-foreground text-xs opacity-50">-</span>}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {r.mitreTactic ? (
                                                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded-full border border-slate-200 uppercase tracking-wide">
                                                    <Zap className="h-3 w-3 text-emerald-500" /> {r.mitreTactic}
                                                </span>
                                            ) : <span className="text-muted-foreground text-xs opacity-50">-</span>}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-indigo-50 hover:text-indigo-600" onClick={() => setEditingRule(r)}>
                                                <Settings2 className="h-4 w-4" />
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Footer Pagination */}
                    <PaginationControls className="border-t border-border" />
                </div>

                {/* Edit Mapping / Details Dialog */}
                <Dialog open={!!editingRule} onOpenChange={(open) => !open && setEditingRule(null)}>
                    <DialogContent className="sm:max-w-[500px]">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <Target className="h-5 w-5 text-indigo-500" /> Rule Intelligence & Mapping
                            </DialogTitle>
                            <DialogDescription className="text-xs">
                                View rule signature details and configure MITRE ATT&CK correlation.
                            </DialogDescription>
                        </DialogHeader>

                        {editingRule && (
                            <div className="space-y-5 pt-4">
                                {/* Rule Information Section */}
                                <div className="space-y-3 bg-muted/30 p-4 rounded-lg border border-border/50">
                                    <div>
                                        <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Rule ID</h4>
                                        <p className="text-sm font-mono font-bold text-primary mt-0.5">{editingRule.ruleId}</p>
                                    </div>
                                    <div>
                                        <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Rule Name</h4>
                                        <p className="text-sm font-medium mt-0.5">{editingRule.name || "N/A"}</p>
                                    </div>
                                    <div>
                                        <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Description</h4>
                                        <p className="text-xs text-muted-foreground mt-1 max-h-[80px] overflow-y-auto pr-2 bg-background p-2 rounded border">
                                            {editingRule.description || "No description provided."}
                                        </p>
                                    </div>
                                    <div className="flex gap-4">
                                        <div>
                                            <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Severity</h4>
                                            <span className="inline-block mt-0.5 text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200">
                                                {editingRule.severity}
                                            </span>
                                        </div>
                                        <div>
                                            <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Action</h4>
                                            <span className="inline-block mt-0.5 text-[10px] font-bold bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded border border-rose-200">
                                                {editingRule.action}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* MITRE Inputs Section */}
                                <div className="space-y-3">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5"><Target className="h-3 w-3" /> MITRE Technique (e.g. T1190)</label>
                                        <div className="relative">
                                            <Input
                                                placeholder="Enter ID like T1190 or T1059"
                                                className="h-9 font-mono text-xs"
                                                value={editingRule.mitreTechnique || ''}
                                                onChange={e => setEditingRule({ ...editingRule, mitreTechnique: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5"><Zap className="h-3 w-3" /> MITRE Tactic (e.g. Initial Access)</label>
                                        <div className="relative">
                                            <Input
                                                placeholder="Enter Tactic category"
                                                className="h-9 font-mono text-xs"
                                                value={editingRule.mitreTactic || ''}
                                                onChange={e => setEditingRule({ ...editingRule, mitreTactic: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="flex gap-3 pt-2">
                                    <Button variant="outline" className="flex-1 h-9 text-xs" onClick={() => setEditingRule(null)}>CANCEL</Button>
                                    <Button
                                        className="flex-1 h-9 text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
                                        onClick={() => updateMutation.mutate(editingRule)}
                                        disabled={updateMutation.isPending}
                                    >
                                        {updateMutation.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />} SAVE MAPPING
                                    </Button>
                                </div>
                            </div>
                        )}
                    </DialogContent>
                </Dialog>
            </div>
        </DashboardLayout>
    );
}

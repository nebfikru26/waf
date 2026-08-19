import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import {
  ShieldCheck,
  Search,
  Settings2,
  AlertCircle,
  Info,
  Loader2,
  Filter,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  History,
  Clock
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

interface CrsRule {
  id: string;
  rule_id?: string;
  ruleId?: string;
  name: string;
  category: string;
  severity: string;
  action: string;
  description: string;
  version_tag?: string;
  imported_at?: string;
}

type SortKey = "ruleId" | "name" | "category" | "version_tag" | "severity" | "action";
const SEVERITY_ORDER: Record<string, number> = { CRITICAL: 0, ERROR: 1, WARNING: 2, MEDIUM: 3, LOW: 4 };
const ITEMS_PER_PAGE = 50;

export default function CrsRulesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [selectedRule, setSelectedRule] = useState<CrsRule | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("ruleId");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [currentPage, setCurrentPage] = useState(1);

  // Reset to first page when search or filters change
  useMemo(() => {
    setCurrentPage(1);
  }, [searchTerm, filterCategory, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronsUpDown className="h-3 w-3 ml-1 opacity-30 inline" />;
    return sortDir === "asc"
      ? <ChevronUp className="h-3 w-3 ml-1 text-primary inline" />
      : <ChevronDown className="h-3 w-3 ml-1 text-primary inline" />;
  };

  const { data: rules = [], isLoading } = useQuery<CrsRule[]>({
    queryKey: ["crs-rules"],
    queryFn: async () => {
      const res = await fetch("/api/platform/crs/rules", {
        headers: {}
      });
      if (!res.ok) throw new Error(`Failed to fetch CRS rules: ${res.status}`);
      return res.json();
    }
  });

  const updateRuleMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string, action: string }) => {
      const res = await fetch(`/api/platform/crs/rules/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ action })
      });
      if (!res.ok) throw new Error("Failed to update rule");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crs-rules"] });
      toast({ title: "Rule Updated", description: "The CRS rule configuration has been saved." });
      setSelectedRule(null);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const categories = ["all", ...new Set((Array.isArray(rules) ? rules : []).map(r => r.category))];

  const lastSync = useMemo(() => {
    if (!rules || !Array.isArray(rules) || !rules.length) return null;
    const dates = rules.map(r => r.imported_at ? new Date(r.imported_at).getTime() : 0).filter(d => d > 0);
    if (!dates.length) return null;
    return new Date(Math.max(...dates));
  }, [rules]);

  const isNew = (dateStr?: string) => {
    if (!dateStr) return false;
    const date = new Date(dateStr);
    const diff = new Date().getTime() - date.getTime();
    return diff < 7 * 24 * 60 * 60 * 1000; // 7 days
  };

  const filteredRules = useMemo(() => {
    const filtered = rules.filter(r => {
      const rId = r.ruleId || r.rule_id || r.id || "";
      const sTerm = searchTerm.toLowerCase();
      const matchesSearch =
        rId.toLowerCase().includes(sTerm) ||
        (r.name || "").toLowerCase().includes(sTerm) ||
        (r.description || "").toLowerCase().includes(sTerm) ||
        (r.version_tag || "").toLowerCase().includes(sTerm) ||
        (r.severity || "").toLowerCase().includes(sTerm) ||
        (r.action || "").toLowerCase().includes(sTerm);
      const matchesCategory = filterCategory === "all" || r.category === filterCategory;
      return matchesSearch && matchesCategory;
    });

    return [...filtered].sort((a, b) => {
      let aVal: string | number = "";
      let bVal: string | number = "";
      if (sortKey === "ruleId") { aVal = a.ruleId || a.rule_id || a.id || ""; bVal = b.ruleId || b.rule_id || b.id || ""; }
      else if (sortKey === "name") { aVal = a.name || ""; bVal = b.name || ""; }
      else if (sortKey === "category") { aVal = a.category || ""; bVal = b.category || ""; }
      else if (sortKey === "version_tag") { aVal = a.version_tag || ""; bVal = b.version_tag || ""; }
      else if (sortKey === "severity") { aVal = SEVERITY_ORDER[a.severity] ?? 99; bVal = SEVERITY_ORDER[b.severity] ?? 99; }
      else if (sortKey === "action") { aVal = a.action || ""; bVal = b.action || ""; }
      if (typeof aVal === "number" && typeof bVal === "number") return sortDir === "asc" ? aVal - bVal : bVal - aVal;
      return sortDir === "asc" ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal));
    });
  }, [rules, searchTerm, filterCategory, sortKey, sortDir]);

  const totalPages = Math.ceil(filteredRules.length / ITEMS_PER_PAGE);
  const paginatedRules = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredRules.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredRules, currentPage]);

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case "CRITICAL": return <AlertCircle className="h-3.5 w-3.5 text-rose-500" />;
      case "ERROR": return <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />;
      case "WARNING": return <Info className="h-3.5 w-3.5 text-amber-500" />;
      default: return <Info className="h-3.5 w-3.5 text-sky-500" />;
    }
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case "BLOCK": return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-500 border border-rose-500/20 flex items-center gap-1 w-fit"><XCircle className="h-2.5 w-2.5" /> BLOCK</span>;
      case "LOG": return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center gap-1 w-fit"><Info className="h-2.5 w-2.5" /> LOG ONLY</span>;
      case "DISABLED": return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-muted text-muted-foreground border border-border flex items-center gap-1 w-fit"><CheckCircle2 className="h-2.5 w-2.5" /> DISABLED</span>;
      default: return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-muted text-muted-foreground border border-border flex items-center gap-1 w-fit">{action}</span>;
    }
  };

  const PaginationControls = ({ className = "" }: { className?: string }) => {
    if (isLoading || filteredRules.length === 0) return null;

    return (
      <div className={`px-4 py-3 flex items-center justify-between ${className}`}>
        <div className="text-[10px] text-muted-foreground uppercase font-mono">
          Showing <span className="text-foreground font-bold">{Math.min(filteredRules.length, (currentPage - 1) * ITEMS_PER_PAGE + 1)}-{Math.min(filteredRules.length, currentPage * ITEMS_PER_PAGE)}</span> of <span className="text-foreground font-bold">{filteredRules.length}</span> Rules
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
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
                <Button
                  key={pageNum}
                  variant={currentPage === pageNum ? "default" : "outline"}
                  className={`h-8 w-8 text-xs font-mono ${currentPage === pageNum ? 'glow-primary' : ''}`}
                  onClick={() => setCurrentPage(pageNum)}
                >
                  {pageNum}
                </Button>
              );
            })}
          </div>

          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Sync Info Banner - Prominent Positioning */}
        {lastSync && (
          <div className="bg-primary/10 border-2 border-primary/20 rounded-xl p-4 flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="flex items-center gap-3">
              <div className="bg-primary text-white p-2 rounded-lg shadow-md">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-black text-foreground uppercase tracking-tight">Ruleset Synchronized</p>
                <p className="text-[11px] text-muted-foreground font-medium">The platform-wide OWASP CRS ruleset was last updated on {lastSync.toLocaleString()}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[10px] bg-emerald-500 text-white px-3 py-1.5 rounded-full font-black uppercase tracking-widest shadow-sm">
              <CheckCircle2 className="h-3.5 w-3.5" /> Live & Protected
            </div>
          </div>
        )}

        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" /> OWASP CRS v3.3 Policy Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Global Core Rule Set configuration for the platform. These rules protect all tenants against common vulnerabilities.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by ID, Name, Batch or Severity..."
              className="pl-9 bg-muted/20 h-9 text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="h-9 w-full sm:w-[180px] text-xs font-mono">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map(cat => (
                  <SelectItem key={cat} value={cat} className="text-xs uppercase">
                    {cat?.replace("_", " ") || "UNSET"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <PaginationControls className="bg-card border border-border rounded-lg shadow-sm" />

        <div className="bg-card border border-border rounded-lg overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/30 border-b border-border">
                  {([
                    { label: "Rule ID", col: "ruleId" as SortKey },
                    { label: "Name & Description", col: "name" as SortKey },
                    { label: "Category", col: "category" as SortKey },
                    { label: "Batch ID", col: "version_tag" as SortKey },
                    { label: "Severity", col: "severity" as SortKey },
                    { label: "Policy Action", col: "action" as SortKey },
                  ] as { label: string; col: SortKey }[]).map(({ label, col }) => (
                    <th
                      key={col}
                      className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider cursor-pointer select-none hover:text-primary transition-colors"
                      onClick={() => toggleSort(col)}
                    >
                      {label}<SortIcon col={col} />
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground text-xs uppercase tracking-wider">Settings</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="py-20 text-center">
                      <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
                      <p className="text-xs text-muted-foreground mt-2 font-mono">LOADING CRS REGISTRY...</p>
                    </td>
                  </tr>
                ) : filteredRules.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-20 text-center">
                      <p className="text-sm text-muted-foreground">No rules found matching your criteria.</p>
                    </td>
                  </tr>
                ) : (
                  paginatedRules.map((rule) => (
                    <tr key={rule.id} className="hover:bg-muted/10 transition-colors group">
                      <td className="px-4 py-4 align-top">
                        <span className="font-mono text-xs font-bold text-primary">{rule.ruleId || rule.rule_id || rule.id || 'N/A'}</span>
                      </td>
                      <td className="px-4 py-4 align-top max-w-sm">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-bold text-[11px] uppercase truncate">{rule.name}</p>
                          {isNew(rule.imported_at) && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0 rounded-full bg-blue-500/10 text-blue-500 text-[9px] font-bold border border-blue-500/20 animate-pulse">
                              <Sparkles className="h-2.5 w-2.5" /> NEW
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-2">{rule.description}</p>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border/40 uppercase">
                          {rule.category || 'GENERAL'}
                        </span>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <span className="text-[10px] font-mono text-primary/70 bg-primary/5 px-1.5 py-0.5 rounded border border-primary/10">
                          {rule.version_tag || 'INITIAL'}
                        </span>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold">
                          {getSeverityIcon(rule.severity)}
                          {rule.severity || 'UNKNOWN'}
                        </div>
                      </td>
                      <td className="px-4 py-4 align-top">
                        {getActionBadge(rule.action)}
                      </td>
                      <td className="px-4 py-4 align-top text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 hover:bg-primary/10 hover:text-primary"
                          onClick={() => setSelectedRule(rule)}
                        >
                          <Settings2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <PaginationControls className="bg-muted/20 border-t border-border" />
        </div>

        {/* Edit Rule Dialog */}
        <Dialog open={!!selectedRule} onOpenChange={(open) => !open && setSelectedRule(null)}>
          <DialogContent className="sm:max-w-[420px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-primary" /> Edit Policy Action
              </DialogTitle>
              <DialogDescription className="text-xs font-mono">
                Updating Rule ID: {selectedRule?.ruleId || selectedRule?.rule_id || 'N/A'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6 pt-4 pb-2">
              <div className="p-3 bg-muted/30 border border-border rounded-lg space-y-2">
                <p className="text-xs font-bold uppercase">{selectedRule?.name}</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">{selectedRule?.description}</p>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Enforcement Action</label>
                <div className="grid grid-cols-1 gap-2">
                  <button
                    className={`flex items-center justify-between p-3 rounded-lg border transition-all text-left ${selectedRule?.action === "BLOCK" ? "bg-rose-500/5 border-rose-500/50" : "bg-muted/10 border-border hover:border-border/80"
                      }`}
                    onClick={() => selectedRule && setSelectedRule({ ...selectedRule, action: "BLOCK" })}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`h-8 w-8 rounded flex items-center justify-center ${selectedRule?.action === "BLOCK" ? 'bg-rose-500 text-white' : 'bg-muted text-muted-foreground'}`}>
                        <XCircle className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold">BLOCK REQUEST</p>
                        <p className="text-[10px] text-muted-foreground">Terminate malicious request immediately.</p>
                      </div>
                    </div>
                    {selectedRule?.action === "BLOCK" && <div className="h-2 w-2 rounded-full bg-rose-500" />}
                  </button>

                  <button
                    className={`flex items-center justify-between p-3 rounded-lg border transition-all text-left ${selectedRule?.action === "LOG" ? "bg-amber-500/5 border-amber-500/50" : "bg-muted/10 border-border hover:border-border/80"
                      }`}
                    onClick={() => selectedRule && setSelectedRule({ ...selectedRule, action: "LOG" })}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`h-8 w-8 rounded flex items-center justify-center ${selectedRule?.action === "LOG" ? 'bg-amber-500 text-white' : 'bg-muted text-muted-foreground'}`}>
                        <Info className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold">LOG ONLY (DETECTION)</p>
                        <p className="text-[10px] text-muted-foreground">Monitor traffic without blocking.</p>
                      </div>
                    </div>
                    {selectedRule?.action === "LOG" && <div className="h-2 w-2 rounded-full bg-amber-500" />}
                  </button>

                  <button
                    className={`flex items-center justify-between p-3 rounded-lg border transition-all text-left ${selectedRule?.action === "DISABLED" ? "bg-muted border-border/80" : "bg-muted/10 border-border hover:border-border/80"
                      }`}
                    onClick={() => selectedRule && setSelectedRule({ ...selectedRule, action: "DISABLED" })}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`h-8 w-8 rounded flex items-center justify-center ${selectedRule?.action === "DISABLED" ? 'bg-muted-foreground text-white' : 'bg-muted text-muted-foreground'}`}>
                        <CheckCircle2 className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold">DISABLE RULE</p>
                        <p className="text-[10px] text-muted-foreground">Turn off protection for this specific rule.</p>
                      </div>
                    </div>
                    {selectedRule?.action === "DISABLED" && <div className="h-2 w-2 rounded-full bg-muted-foreground" />}
                  </button>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1 h-9 text-xs" onClick={() => setSelectedRule(null)}>CANCEL</Button>
                <Button
                  className="flex-1 h-9 text-xs glow-primary"
                  disabled={updateRuleMutation.isPending}
                  onClick={() => selectedRule && updateRuleMutation.mutate({ id: selectedRule.id, action: selectedRule.action })}
                >
                  {updateRuleMutation.isPending && <Loader2 className="h-3 w-3 animate-spin mr-2" />} SAVE POLICY
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}

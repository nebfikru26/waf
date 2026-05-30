import { useState } from "react";
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
  AlertTriangle
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
}

export default function CrsRulesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [selectedRule, setSelectedRule] = useState<CrsRule | null>(null);

  const { data: rules = [], isLoading } = useQuery<CrsRule[]>({
    queryKey: ["crs-rules"],
    queryFn: async () => {
      const token = (localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token")) || sessionStorage.getItem("auth_token");
      const res = await fetch("/api/platform/crs/rules", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(`Failed to fetch CRS rules: ${res.status}`);
      return res.json();
    }
  });

  const updateRuleMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string, action: string }) => {
      const token = (localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token")) || sessionStorage.getItem("auth_token");
      const res = await fetch(`/api/platform/crs/rules/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
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

  const filteredRules = rules.filter(r => {
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

  return (
    <DashboardLayout>
      <div className="space-y-6">
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

        <div className="bg-card border border-border rounded-lg overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/30 border-b border-border">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Rule ID</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Name & Description</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Category</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Batch ID</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Severity</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Policy Action</th>
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
                  filteredRules.map((rule) => (
                    <tr key={rule.id} className="hover:bg-muted/10 transition-colors group">
                      <td className="px-4 py-4 align-top">
                        <span className="font-mono text-xs font-bold text-primary">{rule.ruleId || rule.rule_id || rule.id || 'N/A'}</span>
                      </td>
                      <td className="px-4 py-4 align-top max-w-sm">
                        <p className="font-bold text-[11px] mb-1 uppercase">{rule.name}</p>
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

import { useState } from "react";
import {
  Shield, Key, AlertTriangle, BarChart3, Settings2, Plus, Trash2, Lock,
  ChevronDown, ChevronRight, CheckCircle2, XCircle, Zap, FileJson,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { UpgradeOverlay } from "@/components/UpgradeOverlay";

interface APIEndpoint {
  id: string;
  path: string;
  method: string;
  allowed_methods: string;
  rateLimit: number;
  authRequired: boolean;
  schemaValidation: boolean;
  schema_mode: "monitor" | "enforce";
  required_params: string;
  max_body_kb: number;
  description: string;
  status: string;
}

const HTTP_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"];

const apiStats = [
  { label: "Protected Endpoints", value: "–", subtext: "Active schema rules", icon: Shield },
  { label: "Schema Violations", value: "–", subtext: "Last 24h", icon: AlertTriangle },
  { label: "Auth Failures", value: "–", subtext: "Unauthorized attempts", icon: Key },
  { label: "Oversized Bodies", value: "–", subtext: "Blocked payloads", icon: BarChart3 },
];

// ── Per-endpoint schema editor ────────────────────────────────────────────────
function EndpointSchemaEditor({
  ep, onSave, onClose, canEdit,
}: {
  ep: APIEndpoint;
  onSave: (updates: Partial<APIEndpoint>) => void;
  onClose: () => void;
  canEdit: boolean;
}) {
  const [allowedMethods, setAllowedMethods] = useState<string[]>(
    ep.allowed_methods ? ep.allowed_methods.split(",").map(s => s.trim()).filter(Boolean) : [ep.method]
  );
  const [requiredParams, setRequiredParams] = useState(ep.required_params || "");
  const [maxBodyKb, setMaxBodyKb] = useState(ep.max_body_kb?.toString() || "0");
  const [schemaMode, setSchemaMode] = useState<"monitor" | "enforce">(ep.schema_mode || "monitor");
  const [authRequired, setAuthRequired] = useState(ep.authRequired);
  const [schemaValidation, setSchemaValidation] = useState(ep.schemaValidation);
  const [description, setDescription] = useState(ep.description || "");

  const toggleMethod = (m: string) => {
    setAllowedMethods(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);
  };

  const handleSave = () => {
    onSave({
      allowed_methods: allowedMethods.join(","),
      required_params: requiredParams,
      max_body_kb: parseInt(maxBodyKb) || 0,
      schema_mode: schemaMode,
      authRequired,
      schemaValidation,
      description,
    });
  };

  const methodColors: Record<string, string> = {
    GET: "border-emerald-500 bg-emerald-500/15 text-emerald-400",
    POST: "border-primary bg-primary/15 text-primary",
    PUT: "border-amber-500 bg-amber-500/15 text-amber-400",
    DELETE: "border-red-500 bg-red-500/15 text-red-400",
    PATCH: "border-purple-500 bg-purple-500/15 text-purple-400",
    OPTIONS: "border-sky-500 bg-sky-500/15 text-sky-400",
    HEAD: "border-zinc-500 bg-zinc-500/15 text-zinc-400",
  };

  return (
    <div className="mt-2 border border-primary/30 bg-primary/5 rounded-xl p-5 space-y-5 animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <FileJson className="h-4 w-4 text-primary" /> Schema Rules for <span className="font-mono">{ep.path}</span>
        </h4>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xs font-mono">✕ close</button>
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground uppercase tracking-wider">Description</Label>
        <Input value={description} onChange={e => setDescription(e.target.value)} disabled={!canEdit}
          placeholder="e.g. User login endpoint" className="bg-muted/50 text-xs" />
      </div>

      {/* Allowed Methods */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground uppercase tracking-wider">Allowed HTTP Methods</Label>
        <div className="flex flex-wrap gap-1.5">
          {HTTP_METHODS.map(m => (
            <button
              key={m}
              disabled={!canEdit}
              onClick={() => toggleMethod(m)}
              className={`px-2.5 py-1 rounded border text-[10px] font-mono font-bold transition-all ${
                allowedMethods.includes(m)
                  ? methodColors[m]
                  : "border-border text-muted-foreground hover:border-muted-foreground bg-muted/10"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        {allowedMethods.length === 0 && (
          <p className="text-[10px] text-amber-400">⚠ No methods selected — all methods will be allowed</p>
        )}
      </div>

      {/* Required Params */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground uppercase tracking-wider">Required Body / Query Parameters</Label>
        <Input
          value={requiredParams}
          onChange={e => setRequiredParams(e.target.value)}
          disabled={!canEdit || !schemaValidation}
          placeholder="e.g. email,password,token (comma-separated)"
          className="bg-muted/50 text-xs font-mono"
        />
        <p className="text-[10px] text-muted-foreground">
          Leave empty to skip parameter validation. Requires Schema Validation to be ON.
        </p>
      </div>

      {/* Max Body Size */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground uppercase tracking-wider">Max Body Size (KB) — 0 = unlimited</Label>
        <Input
          type="number"
          value={maxBodyKb}
          onChange={e => setMaxBodyKb(e.target.value)}
          disabled={!canEdit}
          className="bg-muted/50 text-xs font-mono w-32"
          min={0}
        />
      </div>

      {/* Toggles Row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
          <div>
            <p className="text-xs font-medium">Auth Required</p>
            <p className="text-[10px] text-muted-foreground">Reject missing Auth/Cookie</p>
          </div>
          <Switch checked={authRequired} onCheckedChange={setAuthRequired} disabled={!canEdit} />
        </div>
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
          <div>
            <p className="text-xs font-medium">Schema Validation</p>
            <p className="text-[10px] text-muted-foreground">Enforce required params</p>
          </div>
          <Switch checked={schemaValidation} onCheckedChange={setSchemaValidation} disabled={!canEdit} />
        </div>
      </div>

      {/* Monitor vs Enforce Mode */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground uppercase tracking-wider">Enforcement Mode</Label>
        <div className="grid grid-cols-2 gap-2">
          <button
            disabled={!canEdit}
            onClick={() => setSchemaMode("monitor")}
            className={`p-3 rounded-xl border text-left transition-all ${
              schemaMode === "monitor"
                ? "border-amber-500/50 bg-amber-500/8 ring-1 ring-amber-500/20"
                : "border-border bg-muted/10 hover:border-amber-500/30"
            }`}
          >
            <p className="text-xs font-semibold text-amber-400 mb-0.5">🟡 Monitor / Log-Only</p>
            <p className="text-[10px] text-muted-foreground">Violations are logged but traffic passes through. Safe for testing.</p>
          </button>
          <button
            disabled={!canEdit}
            onClick={() => setSchemaMode("enforce")}
            className={`p-3 rounded-xl border text-left transition-all ${
              schemaMode === "enforce"
                ? "border-red-500/50 bg-red-500/8 ring-1 ring-red-500/20"
                : "border-border bg-muted/10 hover:border-red-500/30"
            }`}
          >
            <p className="text-xs font-semibold text-red-400 mb-0.5">🔴 Enforce / Block</p>
            <p className="text-[10px] text-muted-foreground">Violations are immediately rejected with 4xx. Review in Monitor first.</p>
          </button>
        </div>
      </div>

      {canEdit && (
        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button size="sm" variant="ghost" className="text-xs font-mono" onClick={onClose}>Cancel</Button>
          <Button size="sm" className="text-xs font-mono" onClick={handleSave}>
            <Shield className="h-3 w-3 mr-1" /> Save Schema Rules
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function APIProtectionPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isPlatformAdmin = user?.role === "super_admin" || user?.role === "admin" || user?.role === "support_engineer";
  const canEdit = (isPlatformAdmin || user?.role === "analyst") && (isPlatformAdmin || user?.entitlements?.hasApiProtection);
  const isLocked = user && !isPlatformAdmin && !user.entitlements?.hasApiProtection;

  const [newPath, setNewPath] = useState("");
  const [newMethod, setNewMethod] = useState("GET");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const headers = {
    "Content-Type": "application/json"
  };

  const { data: endpoints = [], isLoading } = useQuery<APIEndpoint[]>({
    queryKey: ["api-endpoints", user?.tenantId],
    queryFn: () => fetch("/api/modules/api-endpoints", { headers }).then(r => r.json()),
  });

  const addMutation = useMutation({
    mutationFn: (newEp: Partial<APIEndpoint>) =>
      fetch("/api/modules/api-endpoints", { method: "POST", headers, body: JSON.stringify(newEp) }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-endpoints"] });
      toast({ title: "Endpoint added" });
      setNewPath("");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/modules/api-endpoints/${id}`, { method: "DELETE", headers }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-endpoints"] });
      toast({ title: "Endpoint removed" });
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<APIEndpoint> }) =>
      fetch(`/api/modules/api-endpoints/${id}`, { method: "PATCH", headers, body: JSON.stringify(updates) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-endpoints"] });
      toast({ title: "Schema rules saved" });
      setExpandedId(null);
    }
  });

  const addEndpoint = () => {
    if (!newPath.trim()) return;
    addMutation.mutate({
      path: newPath.trim(),
      method: newMethod,
      allowed_methods: newMethod,
      rateLimit: 100,
      authRequired: true,
      schemaValidation: false,
      schema_mode: "monitor",
      required_params: "",
      max_body_kb: 0,
      status: "protected",
    });
  };

  const safeEndpoints = Array.isArray(endpoints) ? endpoints : [];
  const protected_count = safeEndpoints.filter(e => e?.status === "protected").length;
  const enforced_count = safeEndpoints.filter(e => e?.schema_mode === "enforce").length;
  const schema_count = safeEndpoints.filter(e => e?.schemaValidation).length;

  const methodColor = (m: string) => {
    const map: Record<string, string> = {
      GET: "text-emerald-400 border-emerald-400/30",
      POST: "text-primary border-primary/30",
      PUT: "text-amber-400 border-amber-400/30",
      DELETE: "text-red-400 border-red-400/30",
      PATCH: "text-purple-400 border-purple-400/30",
    };
    return map[m] || "text-muted-foreground border-border";
  };

  return (
    <DashboardLayout>
      <div className={`space-y-6 relative transition-all duration-500 ${isLocked ? "blur-sm pointer-events-none select-none opacity-40" : ""}`}>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" /> API Protection
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Schema enforcement, method allowlists, parameter validation and auth requirements
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Badge variant="outline" className="font-mono text-xs border-primary/30 text-primary">{protected_count} ENDPOINTS</Badge>
            <Badge variant="outline" className={`font-mono text-xs ${enforced_count > 0 ? "border-red-500/40 text-red-400" : "border-amber-500/40 text-amber-400"}`}>
              {enforced_count > 0 ? `${enforced_count} ENFORCING` : "MONITOR MODE"}
            </Badge>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total Endpoints", value: safeEndpoints.length.toString(), subtext: "Registered paths", icon: Shield },
            { label: "Schema Validated", value: schema_count.toString(), subtext: "With param rules", icon: FileJson },
            { label: "Enforcing", value: enforced_count.toString(), subtext: "Hard block mode", icon: AlertTriangle },
            { label: "Monitoring", value: (safeEndpoints.length - enforced_count).toString(), subtext: "Log-only mode", icon: BarChart3 },
          ].map((stat) => (
            <div key={stat.label} className="stat-card">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-muted text-primary">
                  <stat.icon className="h-4 w-4" />
                </div>
                <span className="text-sm text-muted-foreground">{stat.label}</span>
              </div>
              <p className="text-2xl font-bold font-mono">{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{stat.subtext}</p>
            </div>
          ))}
        </div>

        {/* Schema Enforcer Info Banner */}
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex gap-3">
          <Zap className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-primary mb-1">How API Schema Enforcement Works</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              The WAF edge evaluates every incoming request against your endpoint schema rules in real-time, before it reaches your origin server.
              In <span className="text-amber-400 font-mono font-bold">MONITOR</span> mode, violations are logged to your alerts dashboard but traffic passes through — ideal for testing.
              In <span className="text-red-400 font-mono font-bold">ENFORCE</span> mode, violating requests are rejected with the appropriate 4xx status code.
            </p>
          </div>
        </div>

        {/* Endpoint List */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-primary" /> Protected API Endpoints
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">Click any endpoint to configure its schema rules</p>
            </div>
            {isLoading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
          </div>

          {/* Add endpoint form */}
          {canEdit && (
            <div className="flex gap-2 mb-4 p-3 bg-muted/20 border border-border/60 rounded-lg">
              <Select value={newMethod} onValueChange={setNewMethod}>
                <SelectTrigger className="w-24 text-xs font-mono bg-muted/50 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HTTP_METHODS.map(m => (
                    <SelectItem key={m} value={m} className={`text-xs font-mono ${methodColor(m)}`}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="/api/v1/your-endpoint"
                value={newPath}
                onChange={e => setNewPath(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addEndpoint()}
                className="bg-muted/50 text-xs font-mono flex-1 h-8"
              />
              <Button size="sm" className="h-8 text-xs font-mono" onClick={addEndpoint} disabled={addMutation.isPending}>
                {addMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3 mr-1" />}
                Add
              </Button>
            </div>
          )}

          {/* Endpoint rows */}
          <div className="space-y-2">
            {safeEndpoints.length === 0 && !isLoading && (
              <div className="py-10 text-center text-muted-foreground text-sm border border-dashed border-border rounded-xl">
                No endpoints registered yet. Add one above to start enforcing API schemas.
              </div>
            )}

            {safeEndpoints.map((ep) => {
              const isExpanded = expandedId === ep.id;
              const methods = ep.allowed_methods ? ep.allowed_methods.split(",").map(s => s.trim()) : [ep.method];
              const hasSchema = ep.schemaValidation && ep.required_params;
              const modeColor = ep.schema_mode === "enforce"
                ? "text-red-400 border-red-400/30 bg-red-400/8"
                : "text-amber-400 border-amber-400/30 bg-amber-400/8";

              return (
                <div key={ep.id} className="rounded-lg border border-border/60 overflow-hidden">
                  {/* Row header */}
                  <div
                    className="flex items-center justify-between py-2.5 px-3 bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : ep.id)}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {/* Expand chevron */}
                      {isExpanded
                        ? <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                        : <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                      }
                      {/* Path & method badges */}
                      <span className="font-mono text-sm font-medium truncate">{ep.path}</span>
                      <div className="flex gap-1 shrink-0">
                        {methods.slice(0, 4).map(m => (
                          <Badge key={m} variant="outline" className={`font-mono text-[9px] px-1.5 ${methodColor(m)}`}>{m}</Badge>
                        ))}
                        {methods.length > 4 && (
                          <span className="text-[9px] text-muted-foreground">+{methods.length - 4}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {/* Mode badge */}
                      <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border ${modeColor}`}>
                        {ep.schema_mode === "enforce" ? "ENFORCE" : "MONITOR"}
                      </span>
                      {/* Feature indicators */}
                      <div className="flex gap-1">
                        {ep.authRequired
                          ? <span title="Auth required"><Key className="h-3 w-3 text-primary" /></span>
                          : <span title="No auth"><Key className="h-3 w-3 text-muted-foreground/30" /></span>
                        }
                        {hasSchema
                          ? <span title="Schema validated"><CheckCircle2 className="h-3 w-3 text-emerald-400" /></span>
                          : <span title="No schema"><XCircle className="h-3 w-3 text-muted-foreground/30" /></span>
                        }
                        {ep.max_body_kb > 0 && (
                          <span className="text-[9px] font-mono text-muted-foreground">{ep.max_body_kb}KB</span>
                        )}
                      </div>
                      {canEdit && (
                        <button
                          onClick={e => { e.stopPropagation(); deleteMutation.mutate(ep.id); }}
                          className="text-muted-foreground hover:text-destructive ml-1"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded schema editor */}
                  {isExpanded && (
                    <div className="px-3 pb-3">
                      <EndpointSchemaEditor
                        ep={ep}
                        canEdit={canEdit}
                        onClose={() => setExpandedId(null)}
                        onSave={(updates) => updateMutation.mutate({ id: ep.id, updates })}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {isLocked && (
        <UpgradeOverlay 
          title="API Shield Protection" 
          description="Enforce strict API schemas, validate JSON parameters, and reject unauthorized methods at the edge. This advanced module requires the Professional plan."
          feature="API Protection"
        />
      )}
    </DashboardLayout>
  );
}

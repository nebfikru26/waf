import React, { useState, useEffect } from "react";
import {
  ShieldCheck, Plus, Trash2, MapPin, Loader2, Check, Copy,
  Zap, Filter, ChevronDown, ChevronRight, X, Save, Ban, Search, Download, Upload, History, Beaker, Pencil, RotateCcw, Play, ShieldAlert,
  RefreshCw, ChevronLeft, ChevronsUpDown, ChevronUp, Sparkles, Clock, CheckCircle2, Globe, Activity, Settings, Lock, Server, Shield
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { WafPermissions } from "@/lib/permissions";
import { useToast } from "@/hooks/use-toast";
import { UpgradeOverlay } from "@/components/UpgradeOverlay";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";

// ─── Types ────────────────────────────────────────────
interface OWASPRule {
  id: string;
  rule_id: string; // The ModSecurity numerical ID e.g., 942100
  name: string;
  category: string;
  description: string;
  action: string;
  severity?: string;
  imported_at?: string;
}

const OWASPRuleRow = React.memo(({
  rule,
  isExpanded,
  onToggleExpand,
  ruleExclusions,
  canEdit,
  onToggleRule,
  onAddExclusion,
  onUpdateExclusion,
  onRemoveExclusion,
  onCloneRule
}: {
  rule: OWASPRule,
  isExpanded: boolean,
  onToggleExpand: (id: string) => void,
  ruleExclusions: OWASPRuleExclusion[],
  canEdit: boolean,
  onToggleRule: (id: string, action: string, severity?: string) => void,
  onAddExclusion: (ruleId: string, uri: string, desc: string) => Promise<void>,
  onUpdateExclusion: (id: string, uri: string, desc: string) => Promise<void>,
  onRemoveExclusion: (id: string) => Promise<void>,
  onCloneRule: (rule: OWASPRule) => void
}) => {
  const [localUri, setLocalUri] = useState("");
  const [localDesc, setLocalDesc] = useState("");
  const [editingExclusionId, setEditingExclusionId] = useState<string | null>(null);
  const [editUri, setEditUri] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const rId = rule.rule_id || (rule as any).ruleId || (rule.id?.includes('-') ? rule.id.split('-')[0] : rule.id);

  const actionBadge = (action: string) => {
    const map: Record<string, string> = {
      BLOCK: "text-red-400 border-red-400/30 bg-red-400/8",
      LOG: "text-amber-400 border-amber-400/30 bg-amber-400/8",
      CHALLENGE: "text-blue-400 border-blue-400/30 bg-blue-400/8",
      ALLOW: "text-emerald-400 border-emerald-400/30 bg-emerald-400/8",
      DISABLED: "text-muted-foreground border-border bg-muted/20",
    };
    const label = action === "LOG" ? "SIMULATE" : action;
    return <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border ${map[action] || map.DISABLED}`}>{label}</span>;
  };

  return (
    <div className={`flex flex-col rounded-lg border transition-colors ${rule.action !== "DISABLED" ? "bg-muted/20 border-border/60" : "bg-muted/10 border-border/30 opacity-60"}`}>
      <div className="flex items-center justify-between py-2.5 px-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => onToggleExpand(rId)}
            className="text-muted-foreground hover:text-foreground shrink-0 p-1"
            title={isExpanded ? "Hide Exclusions" : "Show Exclusions"}
          >
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          <span className="text-[10px] font-mono font-bold text-primary w-14 shrink-0 bg-primary/5 px-1 rounded border border-primary/10">{rId}</span>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate flex items-center gap-2">
              {rule.name}
              <span className="text-[9px] font-mono font-bold px-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-500">
                {rule.category || "OWASP CRS"}
              </span>
              {ruleExclusions.length > 0 && (
                <span className="text-[9px] font-bold px-1.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  {ruleExclusions.length} target exclusions
                </span>
              )}
            </p>
            <p className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate max-w-2xl" title={rule.description}>
              {rule.description}
            </p>
          </div>
          {rule.imported_at && new Date().getTime() - new Date(rule.imported_at).getTime() < 7 * 24 * 60 * 60 * 1000 && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-500 text-[9px] font-bold border border-blue-500/20 animate-pulse ml-1">
              <Sparkles className="h-2.5 w-2.5" /> NEW
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex gap-1.5 items-center">
            {actionBadge(rule.action)}
          </div>
          {canEdit && (
            <div className="flex items-center gap-1 ml-2">
              <Select value={rule.action} onValueChange={(v) => onToggleRule(rule.id, v, rule.severity)}>
                <SelectTrigger className="h-7 text-xs w-[110px] bg-muted/50 border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="BLOCK" className="text-xs text-red-500 font-medium">Block</SelectItem>
                  <SelectItem value="LOG" className="text-xs text-amber-500 font-medium">Simulate</SelectItem>
                  <SelectItem value="DISABLED" className="text-xs text-muted-foreground">Disabled</SelectItem>
                </SelectContent>
              </Select>
              {rule.action !== "DISABLED" && (
                <Select value={rule.severity || "NOTICE"} onValueChange={(s) => onToggleRule(rule.id, rule.action, s)}>
                  <SelectTrigger className="h-7 text-xs w-[100px] bg-muted/50 border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CRITICAL" className="text-xs text-red-500 font-medium">Critical</SelectItem>
                    <SelectItem value="ERROR" className="text-xs text-orange-500 font-medium">Error</SelectItem>
                    <SelectItem value="WARNING" className="text-xs text-amber-500 font-medium">Warning</SelectItem>
                    <SelectItem value="NOTICE" className="text-xs text-sky-500 font-medium">Notice</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="px-10 pb-3 pt-1 border-t border-border/30 bg-muted/5 animate-in slide-in-from-top-2 duration-200">
          <p className="text-xs text-muted-foreground mb-3 flex items-center gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5" /> Stop this rule from being evaluated on specific URI paths.
          </p>

          <div className="flex flex-wrap gap-2 mb-3">
            {ruleExclusions.length === 0 ? (
              <span className="text-xs text-muted-foreground italic">No exclusions configured for this rule.</span>
            ) : ruleExclusions.map(exc => (
              <div key={exc.id} className="group relative">
                {editingExclusionId === exc.id ? (
                  <div className="flex items-center gap-1.5 rounded-md border border-blue-500 bg-background px-2 py-1 text-xs">
                    <input
                      autoFocus
                      className="bg-transparent border-none outline-none font-mono text-blue-400 w-32"
                      value={editUri}
                      onChange={e => setEditUri(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && (onUpdateExclusion(exc.id, editUri, editDesc), setEditingExclusionId(null))}
                    />
                    <input
                      className="bg-transparent border-none outline-none text-muted-foreground w-32"
                      placeholder="Desc..."
                      value={editDesc}
                      onChange={e => setEditDesc(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && (onUpdateExclusion(exc.id, editUri, editDesc), setEditingExclusionId(null))}
                    />
                    <button onClick={() => { onUpdateExclusion(exc.id, editUri, editDesc); setEditingExclusionId(null); }} className="text-emerald-500 hover:text-emerald-400"><Check className="h-3 w-3" /></button>
                    <button onClick={() => setEditingExclusionId(null)} className="text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 rounded-md border border-blue-500/30 bg-blue-500/10 px-2 py-1 text-xs">
                    <span className="text-blue-400 font-mono font-semibold">{exc.uri_pattern || (exc as any).uriPattern}</span>
                    {exc.description && <span className="text-muted-foreground text-[10px] truncate max-w-[120px]">- {exc.description}</span>}
                    {canEdit && (
                      <div className="flex items-center ml-1">
                        <button
                          onClick={() => { setEditingExclusionId(exc.id); setEditUri(exc.uri_pattern || (exc as any).uriPattern || ""); setEditDesc(exc.description || ""); }}
                          className="p-0.5 text-blue-400/50 hover:text-blue-400"
                          title="Edit Exclusion"
                        >
                          <Pencil className="h-2.5 w-2.5" />
                        </button>
                        <button onClick={() => onRemoveExclusion(exc.id)} className="p-0.5 text-blue-400/50 hover:text-red-400 ml-0.5">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex justify-between items-center bg-card p-1.5 rounded-md border border-border/50">
            {canEdit && (
              <div className="flex gap-2 items-center flex-1 max-w-xl">
                <input
                  className="flex-1 bg-transparent border-none text-xs px-2 py-1 outline-none font-mono"
                  placeholder="e.g. /api/v1/search (Pattern to allow)"
                  value={localUri}
                  onChange={e => setLocalUri(e.target.value)}
                />
                <input
                  className="flex-1 bg-transparent border-none text-xs px-2 py-1 outline-none hidden sm:block"
                  placeholder="Description..."
                  value={localDesc}
                  onChange={e => setLocalDesc(e.target.value)}
                />
                <button
                  onClick={async () => {
                    if (localUri.trim()) {
                      await onAddExclusion(rId, localUri, localDesc);
                      setLocalUri("");
                      setLocalDesc("");
                    }
                  }}
                  className="bg-primary/10 hover:bg-primary/20 text-primary text-xs px-3 py-1 rounded"
                >
                  Add Exemption
                </button>
              </div>
            )}
            <div className="flex items-center gap-2">
              <div className="w-px h-6 bg-border mx-2"></div>
              <button
                onClick={() => onCloneRule(rule)}
                className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold uppercase tracking-tighter bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 rounded transition-all"
                title="Deep Customization: Clone this rule to a Custom Rule"
              >
                <Copy className="h-3 w-3" /> Customize Logic
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

interface OWASPRuleExclusion {
  id: string;
  rule_id: string;
  uri_pattern: string;
  description: string;
}

interface IPRule { id: string; ip_address: string; note: string; rule_type: string; }
interface URIExclusion { id: string; uri_pattern: string; description: string; enabled: boolean; }
interface CustomRule {
  id: string; name: string; description: string;
  condition_field: string; condition_operator: string; condition_value: string;
  condition2_field: string; condition2_operator: string; condition2_value: string;
  logic_operator: string;
  category: string;
  action: string; priority: number; enabled: boolean;
  is_raw: boolean;
  raw_content: string;
}

// ─── Constants ───────────────────────────────────────
const COUNTRIES = ["AF", "AL", "DZ", "AO", "AR", "AU", "AT", "AZ", "BD", "BE", "BJ", "BR", "BF", "BI", "CM", "CN", "CF", "CD", "CO", "CR", "CI", "HR", "CU", "CY", "CZ", "DK", "DJ", "DO", "EG", "SV", "ET", "FI", "FR", "GA", "DE", "GH", "GR", "GT", "GN", "HT", "HN", "HK", "HU", "IN", "ID", "IR", "IQ", "IE", "IL", "IT", "JM", "JP", "JO", "KZ", "KE", "KP", "KR", "KW", "LB", "LY", "LT", "LU", "MY", "ML", "MX", "MA", "MZ", "MM", "NA", "NP", "NL", "NZ", "NE", "NG", "NO", "PK", "PH", "PL", "PT", "QA", "RO", "RU", "RW", "SA", "SN", "SO", "ZA", "SS", "ES", "LK", "SD", "SE", "CH", "SY", "TW", "TT", "TN", "TR", "UG", "UA", "AE", "GB", "US", "UY", "VE", "VN", "YE", "ZM", "ZW"];

const CONDITION_FIELDS = [
  { value: "ip", label: "Source IP" },
  { value: "url", label: "URL Path" },
  { value: "country", label: "Country Code" },
  { value: "user_agent", label: "User-Agent" },
  { value: "method", label: "HTTP Method" },
  { value: "header", label: "Request Header" },
  { value: "body", label: "Request Body" },
];
const CONDITION_OPERATORS = [
  { value: "equals", label: "equals" },
  { value: "not_equals", label: "does not equal" },
  { value: "contains", label: "contains" },
  { value: "starts_with", label: "starts with" },
  { value: "ends_with", label: "ends with" },
  { value: "matches_regex", label: "matches regex" },
];
const RULE_ACTIONS = [
  { value: "BLOCK", label: "Block", color: "text-red-400", bg: "bg-red-500/10 border-red-500/30" },
  { value: "LOG", label: "Simulate", color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/30" },
  { value: "CHALLENGE", label: "Challenge", color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/30" },
  { value: "ALLOW", label: "Allow", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30" },
];

const ETHIOPIAN_NEIGHBORS = ["ET", "ER", "DJ", "SO", "KE", "SS", "SD"];



// ─── Custom Rule Builder ──────────────────────────────
const EMPTY_RULE = {
  name: "", description: "", category: "Custom",
  condition_field: "ip", condition_operator: "equals", condition_value: "",
  condition2_field: "", condition2_operator: "equals", condition2_value: "",
  logic_operator: "", action: "BLOCK",
  is_raw: false,
  raw_content: "",
};

function CustomRuleBuilder({ initialRule, onSave, onCancel, token }: {
  initialRule?: CustomRule;
  onSave: (rule: typeof EMPTY_RULE) => void;
  onCancel: () => void;
  token: string | null;
}) {
  const [form, setForm] = useState(initialRule ? { ...initialRule } : { ...EMPTY_RULE });
  const [showSecond, setShowSecond] = useState(!!form.logic_operator);
  // Global state for WAF
  const [activeTab, setActiveTab] = useState<"visual" | "raw" | "sandbox">(form.is_raw ? "raw" : "visual");
  // Expanded OWASP Rule IDs mapping to true
  const [expandedOwaspRules, setExpandedOwaspRules] = useState<Record<string, boolean>>({});
  const [newOwaspUri, setNewOwaspUri] = useState("");
  const [newOwaspDesc, setNewOwaspDesc] = useState("");

  const [sandboxReq, setSandboxReq] = useState({
    Method: "GET", Uri: "/", Body: "", Headers: "", IpAddress: "127.0.0.1"
  });
  const [sandboxRes, setSandboxRes] = useState<any>(null);
  const [testing, setTesting] = useState(false);

  const runTest = async () => {
    setTesting(true);
    try {
      const headersMap: Record<string, string> = {};
      sandboxReq.Headers.split('\n').forEach(line => {
        if (line.includes(':')) {
          const [k, v] = line.split(':');
          headersMap[k.trim()] = v.trim();
        }
      });
      const res = await fetch("/api/firewall/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({
          Rule: form,
          Request: { ...sandboxReq, Headers: headersMap }
        })
      });
      setSandboxRes(await res.json());
    } catch {
      setSandboxRes({ Message: "Request failed." });
    }
    setTesting(false);
  };

  const sf = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  const actionColors: Record<string, string> = {
    BLOCK: "border-red-500 bg-red-500/10 text-red-400",
    LOG: "border-amber-500 bg-amber-500/10 text-amber-400",
    CHALLENGE: "border-blue-500 bg-blue-500/10 text-blue-400",
    ALLOW: "border-emerald-500 bg-emerald-500/10 text-emerald-400",
  };

  return (
    <div className="border border-primary/30 bg-primary/5 rounded-xl p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <Filter className="h-4 w-4 text-primary" /> New Custom Rule
        </h4>
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex bg-muted/20 p-1 rounded-lg">
        <button
          onClick={() => { setActiveTab("visual"); sf("is_raw", false); }}
          className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${activeTab === "visual" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          Visual Builder
        </button>
        <button
          onClick={() => { setActiveTab("raw"); sf("is_raw", true); }}
          className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${activeTab === "raw" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          Raw ModSecurity
        </button>
        <button
          onClick={() => setActiveTab("sandbox")}
          className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1 ${activeTab === "sandbox" ? "bg-background shadow text-blue-500" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Beaker className="h-3 w-3" /> Test Sandbox
        </button>
      </div>

      {/* Name & Description */}
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-1 space-y-1.5">
          <Label className="text-xs">Category</Label>
          <Select value={form.category || "Custom"} onValueChange={v => sf("category", v)}>
            <SelectTrigger className="bg-muted/50 text-xs h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["SQLi", "XSS", "RCE", "LFI", "SSRF", "Bot", "Rate Limit", "Custom"].map(c => (
                <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-1 space-y-1.5">
          <Label className="text-xs">Rule Name *</Label>
          <Input value={form.name} onChange={e => sf("name", e.target.value)} placeholder="Block bad bot UA" className="bg-muted/50 text-xs h-9" />
        </div>
        <div className="col-span-1 space-y-1.5">
          <Label className="text-xs">Description</Label>
          <Input value={form.description} onChange={e => sf("description", e.target.value)} placeholder="Optional notes" className="bg-muted/50 text-xs h-9" />
        </div>
      </div>

      {activeTab === "sandbox" ? (
        <div className="space-y-4">
          <div className="bg-muted/10 border border-border p-3 rounded-lg space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-1 space-y-1">
                <Label className="text-xs">Method</Label>
                <Select value={sandboxReq.Method} onValueChange={v => setSandboxReq(p => ({ ...p, Method: v }))}>
                  <SelectTrigger className="h-8 text-xs bg-muted/50"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GET" className="text-xs">GET</SelectItem>
                    <SelectItem value="POST" className="text-xs">POST</SelectItem>
                    <SelectItem value="PUT" className="text-xs">PUT</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1">
                <Label className="text-xs">URI Path</Label>
                <Input className="h-8 text-xs bg-muted/50" value={sandboxReq.Uri} onChange={e => setSandboxReq(p => ({ ...p, Uri: e.target.value }))} placeholder="/login" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Headers (Line separated Key: Value)</Label>
              <textarea
                className="w-full h-16 bg-muted/50 text-xs font-mono p-2 border border-border rounded-md"
                value={sandboxReq.Headers} onChange={e => setSandboxReq(p => ({ ...p, Headers: e.target.value }))}
                placeholder={"User-Agent: curl/7.68.0\nX-Forwarded-For: 192.168.1.1"}
              />
            </div>
            <Button size="sm" onClick={runTest} disabled={testing} className="w-full h-8 text-xs font-bold gap-2 dark:text-blue-200 dark:bg-blue-900">
              {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
              Run Simulation against Current Logic
            </Button>
          </div>

          {sandboxRes && (
            <div className={`p-3 rounded-lg border ${sandboxRes.isMatch ? "bg-red-500/10 border-red-500/30 text-red-400" : (sandboxRes.simulated ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-muted/30 border-border text-muted-foreground")}`}>
              <h5 className="text-xs font-bold font-mono tracking-tight flex items-center gap-2">
                {sandboxRes.isMatch ? <Ban className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
                Simulation Result
              </h5>
              <p className="text-xs mt-1">
                {sandboxRes.message || (sandboxRes.isMatch ? `Rule TRIGGERED. Action would be: ${sandboxRes.action}` : `Rule PASSED. Traffic allowed.`)}
              </p>
            </div>
          )}
        </div>
      ) : activeTab === "visual" ? (
        <>
          {/* Condition 1 */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">IF</Label>
            <div className="grid grid-cols-3 gap-2">
              <Select value={form.condition_field} onValueChange={v => sf("condition_field", v)}>
                <SelectTrigger className="bg-muted/50 text-xs h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONDITION_FIELDS.map(f => <SelectItem key={f.value} value={f.value} className="text-xs">{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={form.condition_operator} onValueChange={v => sf("condition_operator", v)}>
                <SelectTrigger className="bg-muted/50 text-xs h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONDITION_OPERATORS.map(o => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input
                value={form.condition_value}
                onChange={e => sf("condition_value", e.target.value)}
                placeholder={
                  form.condition_field === "header" ? "e.g. X-Bypass: Test" :
                    form.condition_field === "body" ? `e.g. {"key":"malicious"}` :
                      "Value..."
                }
                className="bg-muted/50 text-xs h-9 font-mono"
                title={
                  form.condition_field === "header" ? "Format as 'Header-Name: Value' to match specifically" :
                    form.condition_field === "body" ? "Matches against the raw decoded request body content" :
                      ""
                }
              />
            </div>

            {/* Add second condition */}
            {!showSecond ? (
              <button
                onClick={() => setShowSecond(true)}
                className="text-[10px] font-mono text-muted-foreground hover:text-primary flex items-center gap-1 mt-1"
              >
                <Plus className="h-3 w-3" /> Add second condition
              </button>
            ) : (
              <div className="space-y-2 pl-4 border-l-2 border-border mt-2">
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">Logic:</Label>
                  {["AND", "OR"].map(l => (
                    <button
                      key={l}
                      onClick={() => sf("logic_operator", l)}
                      className={`px-2 py-0.5 text-[10px] font-mono rounded border transition-all ${form.logic_operator === l ? "bg-primary/15 border-primary text-primary" : "border-border text-muted-foreground hover:border-muted-foreground"
                        }`}
                    >
                      {l}
                    </button>
                  ))}
                  <button onClick={() => { setShowSecond(false); sf("logic_operator", ""); }} className="ml-auto text-muted-foreground hover:text-foreground">
                    <X className="h-3 w-3" />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Select value={form.condition2_field} onValueChange={v => sf("condition2_field", v)}>
                    <SelectTrigger className="bg-muted/50 text-xs h-9"><SelectValue placeholder="Field..." /></SelectTrigger>
                    <SelectContent>
                      {CONDITION_FIELDS.map(f => <SelectItem key={f.value} value={f.value} className="text-xs">{f.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={form.condition2_operator} onValueChange={v => sf("condition2_operator", v)}>
                    <SelectTrigger className="bg-muted/50 text-xs h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CONDITION_OPERATORS.map(o => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input
                    value={form.condition2_value}
                    onChange={e => sf("condition2_value", e.target.value)}
                    placeholder={form.condition2_field === "header" ? "e.g. X-Bypass: Test" : "Value..."}
                    className="bg-muted/50 text-xs h-9 font-mono"
                    title={form.condition2_field === "header" ? "Format as 'Header-Name: Value' to match specifically" : ""}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Action */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">THEN</Label>
            <div className="grid grid-cols-4 gap-2">
              {RULE_ACTIONS.map(a => (
                <button
                  key={a.value}
                  onClick={() => sf("action", a.value)}
                  className={`py-2 rounded-lg border text-xs font-mono font-bold transition-all ${form.action === a.value ? actionColors[a.value] : "border-border text-muted-foreground hover:border-muted-foreground bg-muted/20"
                    }`}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground uppercase tracking-wider">RAW MODSECURITY DIRECTIVES</Label>
          <CodeMirror
            value={form.raw_content}
            height="160px"
            extensions={[javascript()]}
            theme="dark"
            onChange={(value) => sf("raw_content", value)}
            className="w-full text-xs font-mono border border-border rounded-lg overflow-hidden"
            placeholder={`SecRule REQUEST_HEADERS:User-Agent "@contains badbot" \\\n  "id:1001,phase:1,deny,status:403,msg:'Bad Bot User Agent Blocked'"`}
          />
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" className="text-xs font-mono" onClick={onCancel}>Cancel</Button>
        <Button
          size="sm"
          className="text-xs font-mono glow-primary"
          disabled={!form.name.trim() || (!form.is_raw && !form.condition_value.trim()) || (form.is_raw && !form.raw_content?.trim())}
          onClick={() => onSave(form)}
        >
          <Save className="h-3 w-3 mr-1" /> Save Rule
        </Button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────
export default function PoliciesPage() {
  const { user, isLoading: authLoading, hasPermission } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  // General view/edit for standard rules, and management of sensitive tenant policies
  // (WAF mode, geo rules, ML detection, IP allow/block lists) — both map to the backend's
  // firewall:edit permission (WafPermissions.FirewallEdit), which is the actual policy
  // enforced on PUT /api/firewall/settings and the IP-rule endpoints below. Previously this
  // was hardcoded per-role (including "analyst", which the backend does NOT grant
  // firewall:edit to), so that role saw edit controls that would 403 on click.
  const canEdit = hasPermission(WafPermissions.FirewallEdit);
  const canManageSecurityPolicies = hasPermission(WafPermissions.FirewallEdit);

  const isPlatformAdmin = user?.role === "super_admin" || user?.role === "admin" || user?.role === "support_engineer";
  const isLocked = !isPlatformAdmin && user && !user.entitlements.hasWafDetection;

  const [wafMode, setWafMode] = useState<"SIMULATE" | "BLOCK">("SIMULATE");
  const [modeLoading, setModeLoading] = useState(false);
  const [newWhiteIp, setNewWhiteIp] = useState("");
  const [newBlackIp, setNewBlackIp] = useState("");
  const [newUri, setNewUri] = useState("");
  const [newUriDesc, setNewUriDesc] = useState("");
  const [showRuleBuilder, setShowRuleBuilder] = useState(false);
  const [editingRule, setEditingRule] = useState<CustomRule | null>(null);
  const [historyRuleId, setHistoryRuleId] = useState<string | null>(null);
  const [historyVersions, setHistoryVersions] = useState<any[]>([]);
  const [geoEnabled, setGeoEnabled] = useState(false);
  const [geoMode, setGeoMode] = useState<"allowlist" | "blocklist">("allowlist");
  const [geoAllowlist, setGeoAllowlist] = useState<string[]>(ETHIOPIAN_NEIGHBORS);
  const [geoBlocklist, setGeoBlocklist] = useState<string[]>(["RU", "CN", "KP", "IR"]);
  const [rateLimit, setRateLimit] = useState("100");
  const [mlDetectionEnabled, setMlDetectionEnabled] = useState(true);
  const [rateSaving, setRateSaving] = useState(false);
  const [customRulesOpen, setCustomRulesOpen] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [catFilter, setCatFilter] = useState("all");
  const [showHistory, setShowHistory] = useState(false);
  const [selectedHistoryRule, setSelectedHistoryRule] = useState<CustomRule | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  // OWASP Rules Sorting & Pagination State
  const [sortKeyOwasp, setSortKeyOwasp] = useState<"rule_id" | "name" | "category" | "severity" | "action">("rule_id");
  const [sortDirOwasp, setSortDirOwasp] = useState<"asc" | "desc">("asc");
  const [currentOwaspPage, setCurrentOwaspPage] = useState(1);

  // Persistent UI State to survive reloads/HMR
  const [libraryTab, setLibraryTab] = useState<"custom" | "owasp">(() => {
    return (sessionStorage.getItem("waf_policies_tab") as "custom" | "owasp") || "owasp";
  });
  const [searchQuery, setSearchQuery] = useState(() => {
    return sessionStorage.getItem("waf_policies_search") || "";
  });
  const [expandedOwaspRules, setExpandedOwaspRules] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(sessionStorage.getItem("waf_policies_expanded") || "{}");
    } catch { return {}; }
  });

  // Sync state to sessionStorage
  useEffect(() => { sessionStorage.setItem("waf_policies_tab", libraryTab); }, [libraryTab]);
  useEffect(() => {
    sessionStorage.setItem("waf_policies_search", searchQuery);
    setCurrentOwaspPage(1); // Reset page on search
  }, [searchQuery]);
  useEffect(() => { sessionStorage.setItem("waf_policies_expanded", JSON.stringify(expandedOwaspRules)); }, [expandedOwaspRules]);

  // Reset page when other filters change
  useEffect(() => { setCurrentOwaspPage(1); }, [statusFilter, catFilter, sortKeyOwasp, sortDirOwasp]);

  // Scroll Persistence
  useEffect(() => {
    const handleScroll = () => {
      sessionStorage.setItem("waf_policies_scroll", window.scrollY.toString());
    };
    window.addEventListener("scroll", handleScroll);

    // Restore scroll
    const savedScroll = sessionStorage.getItem("waf_policies_scroll");
    if (savedScroll) {
      window.scrollTo(0, parseInt(savedScroll));
    }

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const toggleExpanded = (rId: string) => {
    setExpandedOwaspRules(prev => ({ ...prev, [rId]: !prev[rId] }));
  };

  const token = (localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token")) || "";
  const headers = React.useMemo(() => ({
    "Content-Type": "application/json",
    "Authorization": `Bearer ${localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token") || ""}`
  }), [user]);

  // Queries


  const { data: ipRules = [] } = useQuery<IPRule[]>({
    queryKey: ["ip-rules"],
    queryFn: () => fetch("/api/firewall/rules", { headers }).then(r => r.json()),
    enabled: !authLoading && !!user
  });

  const { data: uriExclusions = [] } = useQuery<any[]>({
    queryKey: ["uri-exclusions"],
    queryFn: async () => {
      const res = await fetch("/api/firewall/uri-exclusions", { headers });
      if (!res.ok) throw new Error("Failed to load exclusions");
      return res.json();
    },
    enabled: !authLoading && !!user
  });

  const { data: owaspExclusions = [] } = useQuery<OWASPRuleExclusion[]>({
    queryKey: ["owasp-exclusions"],
    queryFn: async () => {
      const res = await fetch("/api/firewall/owasp-exclusions", { headers });
      if (!res.ok) throw new Error("Failed to load owasp exclusions");
      return res.json();
    },
    enabled: !authLoading && !!user,
    staleTime: 300000 // 5 minutes
  });

  const { data: customRules = [] } = useQuery<CustomRule[]>({
    queryKey: ["custom-rules"],
    queryFn: () => fetch("/api/firewall/custom-rules", { headers }).then(r => {
      if (!r.ok) throw new Error(`Failed to fetch custom rules: ${r.status}`);
      return r.json();
    }),
    enabled: !authLoading && !!user
  });

  const { data: owaspRules = [], refetch: refetchOwasp } = useQuery<OWASPRule[]>({
    queryKey: ["owasp-rules"],
    queryFn: () => fetch("/api/firewall/owasp-rules", { headers }).then(r => {
      if (!r.ok) throw new Error(`Failed to fetch OWASP rules: ${r.status}`);
      return r.json();
    }),
    staleTime: 60000, // 1 minute (reduced to allow more frequent refetch)
    enabled: !authLoading && !!user
  });

  const fetchHistory = async (ruleId: string) => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/firewall/custom-rules/${ruleId}/versions`, { headers });
      if (res.ok) setHistoryVersions(await res.json());
      else toast({ title: "Error", description: "Failed to load history", variant: "destructive" });
    } catch (e) {
      toast({ title: "Error", description: "Network error", variant: "destructive" });
    }
    setHistoryLoading(false);
  };

  const rollbackVersion = async (ruleId: string, versionId: string) => {
    try {
      const res = await fetch(`/api/firewall/custom-rules/${ruleId}/rollback/${versionId}`, {
        method: "POST", headers
      });
      if (res.ok) {
        toast({ title: "Rollback successful", description: "Rule restored to selected version" });
        qc.invalidateQueries({ queryKey: ["custom-rules"] });
        setShowHistory(false);
      } else {
        toast({ title: "Rollback failed", variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Network error", variant: "destructive" });
    }
  };

  const handleExport = async () => {
    window.location.href = `/api/firewall/custom-rules/export`;
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const rules = JSON.parse(event.target?.result as string);
        const res = await fetch("/api/firewall/custom-rules/import", {
          method: "POST", headers, body: JSON.stringify(rules)
        });
        if (res.ok) {
          toast({ title: "Import successful", description: "Rules have been added" });
          qc.invalidateQueries({ queryKey: ["custom-rules"] });
        } else {
          toast({ title: "Import failed", variant: "destructive" });
        }
      } catch (e) {
        toast({ title: "Invalid JSON file", variant: "destructive" });
      }
    };
    reader.readAsText(file);
  };

  const { data: settings } = useQuery({
    queryKey: ["firewall-settings"],
    enabled: !authLoading && !!user,
    queryFn: () => fetch("/api/firewall/settings", { headers }).then(r => {
      if (!r.ok) throw new Error(`Failed to fetch firewall settings: ${r.status}`);
      return r.json();
    }),
  });



  // Sync settings to local state
  useEffect(() => {
    if (settings && typeof settings === 'object' && !Array.isArray(settings)) {
      setGeoEnabled(!!settings.geo_enabled);
      setGeoMode(settings.geo_mode === "blocklist" ? "blocklist" : "allowlist");
      setGeoAllowlist(settings.geo_allowlist?.split(",") || ETHIOPIAN_NEIGHBORS);
      setGeoBlocklist(settings.geo_blocklist?.split(",") || ["RU", "CN", "KP", "IR"]);
      setRateLimit(String(settings.rate_limit_rps || "100"));
      setMlDetectionEnabled(!!settings.ml_detection_enabled);
      // Only sync from backend if we're not in the middle of a manual toggle
      if (!modeLoading) {
        setWafMode(settings.waf_mode === "prevention" ? "BLOCK" : "SIMULATE");
      }
    }
  }, [settings, modeLoading]);

  // Handlers


  const saveSettings = async () => {
    setRateSaving(true);
    try {
      const res = await fetch("/api/firewall/settings", {
        method: "PUT", headers,
        body: JSON.stringify({
          ...settings,
          tenant_id: user?.tenantId,
          geo_enabled: geoEnabled,
          geo_mode: geoMode,
          geo_allowlist: geoAllowlist.join(","),
          geo_blocklist: geoBlocklist.join(","),
          rate_limit_rps: parseInt(rateLimit) || 100,
          ml_detection_enabled: mlDetectionEnabled
        }),
      });
      if (res.ok) {
        qc.invalidateQueries({ queryKey: ["firewall-settings"] });
        toast({ title: "Firewall policies applied" });
      } else {
        const d = await res.json();
        throw new Error(d.error || "Failed to apply settings");
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setRateSaving(false);
  };

  const addIPRule = async (type: "whitelist" | "blacklist") => {
    const ip = type === "whitelist" ? newWhiteIp : newBlackIp;
    if (!ip.trim()) return;
    const res = await fetch("/api/firewall/rules", {
      method: "POST", headers,
      body: JSON.stringify({ ip_address: ip.trim(), rule_type: type, note: "Added from UI" }),
    });
    if (res.ok) {
      qc.invalidateQueries({ queryKey: ["ip-rules"] });
      type === "whitelist" ? setNewWhiteIp("") : setNewBlackIp("");
      toast({ title: `IP added to ${type}` });
    }
  };

  const removeIPRule = async (id: string) => {
    await fetch(`/api/firewall/rules/${id}`, { method: "DELETE", headers });
    qc.invalidateQueries({ queryKey: ["ip-rules"] });
  };

  const addURI = async () => {
    if (!newUri.trim()) return;
    const res = await fetch("/api/firewall/uri-exclusions", {
      method: "POST", headers,
      body: JSON.stringify({ uri_pattern: newUri.trim(), description: newUriDesc.trim() }),
    });
    if (res.ok) {
      qc.invalidateQueries({ queryKey: ["uri-exclusions"] });
      setNewUri(""); setNewUriDesc("");
      toast({ title: "URI exclusion added" });
    }
  };

  const toggleURI = async (id: string, enabled: boolean) => {
    await fetch(`/api/firewall/uri-exclusions/${id}`, {
      method: "PATCH", headers, body: JSON.stringify({ enabled: !enabled }),
    });
    qc.invalidateQueries({ queryKey: ["uri-exclusions"] });
  };

  const deleteURI = async (id: string) => {
    await fetch(`/api/firewall/uri-exclusions/${id}`, { method: "DELETE", headers });
    qc.invalidateQueries({ queryKey: ["uri-exclusions"] });
    toast({ title: "URI exclusion removed" });
  };

  const saveCustomRule = async (form: typeof EMPTY_RULE & { id?: string }) => {
    const isUpdate = !!form.id;
    const url = isUpdate ? `/api/firewall/custom-rules/${form.id}` : "/api/firewall/custom-rules";
    const method = isUpdate ? "PUT" : "POST";

    const res = await fetch(url, {
      method, headers, body: JSON.stringify(form),
    });
    if (res.ok) {
      qc.invalidateQueries({ queryKey: ["custom-rules"] });
      setShowRuleBuilder(false);
      setEditingRule(null);
      toast({ title: isUpdate ? "Rule updated successfully" : "Custom rule created" });
    }
  };

  const deleteCustomRule = async (id: string) => {
    await fetch(`/api/firewall/custom-rules/${id}`, { method: "DELETE", headers });
    qc.invalidateQueries({ queryKey: ["custom-rules"] });
    toast({ title: "Rule deleted" });
  };

  const toggleCustomRule = async (id: string, enabled: boolean) => {
    await fetch(`/api/firewall/custom-rules/${id}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ ...customRules.find(r => r.id === id), enabled }),
    });
    qc.invalidateQueries({ queryKey: ["custom-rules"] });
  };

  const changeCustomRuleState = async (id: string, newState: string) => {
    const rule = customRules.find(r => r.id === id);
    if (!rule) return;

    let enabled = rule.enabled;
    let action = rule.action;

    if (newState === "DISABLED") {
      enabled = false;
    } else {
      enabled = true;
      action = newState;
    }

    await fetch(`/api/firewall/custom-rules/${id}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ ...rule, enabled, action }),
    });
    qc.invalidateQueries({ queryKey: ["custom-rules"] });
  };

  const toggleOwaspRule = async (id: string, action: string, severity?: string) => {
    // Optimistically update the UI immediately
    qc.setQueryData<OWASPRule[]>(["owasp-rules"], (old) =>
      (old || []).map((r) => r.id === id ? { ...r, action, severity: severity || r.severity } : r)
    );

    try {
      const res = await fetch(`/api/firewall/owasp-rules/${id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ action, severity }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        toast({ title: "Failed to update rule", description: err.error || err.details || `Status ${res.status}`, variant: "destructive" });
        // Revert optimistic update
        refetchOwasp();
      } else {
        toast({ title: "Rule updated", description: `Action set to ${action}`, duration: 2000 });
      }
    } catch (e: any) {
      toast({ title: "Network error", description: e.message, variant: "destructive" });
      refetchOwasp();
    }
  };

  const addOwaspExclusion = async (ruleId: string, uriPattern: string, desc: string) => {
    if (!uriPattern.trim()) return;

    // Create a temporary exclusion for optimistic UI
    const tempExclusion: OWASPRuleExclusion = {
      id: `temp-${Date.now()}`,
      rule_id: ruleId,
      uri_pattern: uriPattern.trim(),
      description: desc.trim()
    };

    // Optimistically update the cache
    qc.setQueryData<OWASPRuleExclusion[]>(["owasp-exclusions"], (old) => [...(old || []), tempExclusion]);

    try {
      const res = await fetch("/api/firewall/owasp-exclusions", {
        method: "POST", headers,
        body: JSON.stringify({ ruleId: ruleId, uriPattern: uriPattern.trim(), description: desc.trim() }),
      });
      if (res.ok) {
        const saved = await res.json();
        // Replace temp with real data from server (to get real ID)
        qc.setQueryData<OWASPRuleExclusion[]>(["owasp-exclusions"], (old) =>
          (old || []).map(e => e.id === tempExclusion.id ? saved : e)
        );
        toast({ title: `Exclusion added for rule ${ruleId}`, duration: 2000 });
      } else {
        throw new Error("Failed to add exclusion");
      }
    } catch (e: any) {
      // Revert on error
      qc.invalidateQueries({ queryKey: ["owasp-exclusions"] });
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const updateOwaspExclusion = async (id: string, uriPattern: string, desc: string) => {
    // Optimistic update
    qc.setQueryData<OWASPRuleExclusion[]>(["owasp-exclusions"], (old) =>
      (old || []).map(e => e.id === id ? { ...e, uri_pattern: uriPattern, description: desc } : e)
    );

    try {
      const res = await fetch(`/api/firewall/owasp-exclusions/${id}`, {
        method: "PUT", headers,
        body: JSON.stringify({ uriPattern: uriPattern.trim(), description: desc.trim() }),
      });
      if (!res.ok) throw new Error("Update failed");
      toast({ title: "Exclusion updated", duration: 1500 });
    } catch (e: any) {
      qc.invalidateQueries({ queryKey: ["owasp-exclusions"] });
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const removeOwaspExclusion = async (id: string) => {
    // Optimistic remove
    qc.setQueryData<OWASPRuleExclusion[]>(["owasp-exclusions"], (old) =>
      (old || []).filter(e => e.id !== id)
    );

    try {
      const res = await fetch(`/api/firewall/owasp-exclusions/${id}`, { method: "DELETE", headers });
      if (!res.ok) throw new Error("Delete failed");
      toast({ title: "Exclusion removed", duration: 1500 });
    } catch (e: any) {
      qc.invalidateQueries({ queryKey: ["owasp-exclusions"] });
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const OwaspPagination = ({ className = "" }: { className?: string }) => {
    if (totalOwaspPages <= 1) return null;

    return (
      <div className={`px-4 py-3 flex items-center justify-between border rounded-lg bg-muted/10 ${className}`}>
        <div className="text-[10px] text-muted-foreground uppercase font-mono">
          Showing <span className="text-foreground font-bold">{Math.min(filteredOwaspRules.length, (currentOwaspPage - 1) * OWASP_ITEMS_PER_PAGE + 1)}-{Math.min(filteredOwaspRules.length, currentOwaspPage * OWASP_ITEMS_PER_PAGE)}</span> of <span className="text-foreground font-bold">{filteredOwaspRules.length}</span> Rules
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            onClick={() => setCurrentOwaspPage(p => Math.max(1, p - 1))}
            disabled={currentOwaspPage === 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="flex items-center gap-1 px-2">
            {[...Array(Math.min(5, totalOwaspPages))].map((_, i) => {
              let pageNum = currentOwaspPage;
              if (currentOwaspPage <= 3) pageNum = i + 1;
              else if (currentOwaspPage >= totalOwaspPages - 2) pageNum = totalOwaspPages - 4 + i;
              else pageNum = currentOwaspPage - 2 + i;

              if (pageNum <= 0 || pageNum > totalOwaspPages) return null;

              return (
                <Button
                  key={pageNum}
                  variant={currentOwaspPage === pageNum ? "default" : "outline"}
                  className={`h-7 w-7 text-[10px] font-mono ${currentOwaspPage === pageNum ? 'glow-primary' : ''}`}
                  onClick={() => setCurrentOwaspPage(pageNum)}
                >
                  {pageNum}
                </Button>
              );
            })}
          </div>

          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            onClick={() => setCurrentOwaspPage(p => Math.min(totalOwaspPages, p + 1))}
            disabled={currentOwaspPage === totalOwaspPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  };

  const actionBadge = (action: string) => {
    const map: Record<string, string> = {
      BLOCK: "text-red-400 border-red-400/30 bg-red-400/8",
      LOG: "text-amber-400 border-amber-400/30 bg-amber-400/8",
      CHALLENGE: "text-blue-400 border-blue-400/30 bg-blue-400/8",
      ALLOW: "text-emerald-400 border-emerald-400/30 bg-emerald-400/8",
      DISABLED: "text-muted-foreground border-border bg-muted/20",
    };
    const label = action === "LOG" ? "SIMULATE" : action;
    return <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border ${map[action] || map.DISABLED}`}>{label}</span>;
  };

  const exportRules = () => {
    const data = JSON.stringify(customRules, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "custom-rules-export.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importRules = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const rules = JSON.parse(event.target?.result as string);
        if (!Array.isArray(rules)) throw new Error("Invalid format");
        for (const rule of rules) {
          await fetch("/api/firewall/custom-rules", {
            method: "POST", headers, body: JSON.stringify({ ...rule, id: undefined, tenant_id: undefined })
          });
        }
        qc.invalidateQueries({ queryKey: ["custom-rules"] });
        toast({ title: "Rules imported successfully" });
      } catch (err: any) {
        toast({ title: "Import failed", description: err.message, variant: "destructive" });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const safeCustomRules = Array.isArray(customRules) ? customRules : [];
  const filteredRules = React.useMemo(() => safeCustomRules.filter(r => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matches = r.name.toLowerCase().includes(q) ||
        (r.description || "").toLowerCase().includes(q) ||
        (r.condition_value || "").toLowerCase().includes(q) ||
        (r.raw_content || "").toLowerCase().includes(q);
      if (!matches) return false;
    }
    if (statusFilter !== "all") {
      if (statusFilter === "enabled" && !r.enabled) return false;
      if (statusFilter === "disabled" && r.enabled) return false;
      if (["BLOCK", "LOG", "CHALLENGE", "ALLOW"].includes(statusFilter) && r.action !== statusFilter) return false;
    }
    if (catFilter !== "all") {
      if ((r.category || "Custom") !== catFilter) return false;
    }
    return true;
  }), [safeCustomRules, searchQuery, statusFilter, catFilter]);

  const safeOwaspRules = Array.isArray(owaspRules) ? owaspRules : [];

  const latestOwaspSync = React.useMemo(() => {
    if (!safeOwaspRules.length) return null;
    const dates = safeOwaspRules.map(r => r.imported_at ? new Date(r.imported_at).getTime() : 0).filter(d => d > 0);
    if (!dates.length) return null;
    return new Date(Math.max(...dates));
  }, [safeOwaspRules]);

  const SortIcon = ({ col }: { col: typeof sortKeyOwasp }) => {
    if (sortKeyOwasp !== col) return <ChevronsUpDown className="h-3 w-3 ml-1 opacity-30 inline" />;
    return sortDirOwasp === "asc"
      ? <ChevronUp className="h-3 w-3 ml-1 text-primary inline" />
      : <ChevronDown className="h-3 w-3 ml-1 text-primary inline" />;
  };

  const toggleSortOwasp = (key: typeof sortKeyOwasp) => {
    if (sortKeyOwasp === key) {
      setSortDirOwasp(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKeyOwasp(key);
      setSortDirOwasp("asc");
    }
  };

  const OwaspSortHeader = () => (
    <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border border-border/50 rounded-lg mb-2 text-[10px] uppercase font-bold tracking-wider text-muted-foreground select-none">
      <div className="flex items-center gap-3 flex-1 overflow-hidden">
        <div className="w-8 shrink-0" /> {/* Chevron placeholder */}
        <div onClick={() => toggleSortOwasp("rule_id")} className="w-14 shrink-0 cursor-pointer hover:text-primary transition-colors flex items-center">
          ID <SortIcon col="rule_id" />
        </div>
        <div onClick={() => toggleSortOwasp("name")} className="flex-1 cursor-pointer hover:text-primary transition-colors flex items-center min-w-0">
          Name & Description <SortIcon col="name" />
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div onClick={() => toggleSortOwasp("category")} className="w-[80px] cursor-pointer hover:text-primary transition-colors flex items-center">
          Category <SortIcon col="category" />
        </div>
        <div onClick={() => toggleSortOwasp("severity")} className="w-[80px] cursor-pointer hover:text-primary transition-colors flex items-center">
          Severity <SortIcon col="severity" />
        </div>
        <div onClick={() => toggleSortOwasp("action")} className="w-[110px] cursor-pointer hover:text-primary transition-colors flex items-center">
          Action <SortIcon col="action" />
        </div>
      </div>
    </div>
  );

  const filteredOwaspRules = React.useMemo(() => {
    const filtered = safeOwaspRules.filter(r => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!r.name.toLowerCase().includes(q) &&
          !(r.description || "").toLowerCase().includes(q) &&
          !(r.id || "").toLowerCase().includes(q) &&
          !(r.rule_id || "").toLowerCase().includes(q)) return false;
      }
      if (statusFilter !== "all") {
        if (statusFilter === "enabled" && r.action === "DISABLED") return false;
        if (statusFilter === "disabled" && r.action !== "DISABLED") return false;
        if (["BLOCK", "LOG", "CHALLENGE", "ALLOW"].includes(statusFilter) && r.action !== statusFilter) return false;
      }
      if (catFilter !== "all") {
        if ((r.category || "OWASP").toLowerCase() !== catFilter.toLowerCase()) return false;
      }
      return true;
    });

    const SEVERITY_ORDER: Record<string, number> = { CRITICAL: 0, ERROR: 1, WARNING: 2, MEDIUM: 3, LOW: 4, NOTICE: 5 };

    return [...filtered].sort((a, b) => {
      let aVal: string | number = "";
      let bVal: string | number = "";

      const key = sortKeyOwasp;
      if (key === "rule_id") {
        aVal = a.rule_id || (a as any).ruleId || a.id.split('-')[0];
        bVal = b.rule_id || (b as any).ruleId || b.id.split('-')[0];
      } else if (key === "name") {
        aVal = a.name;
        bVal = b.name;
      } else if (key === "category") {
        aVal = a.category || "OWASP";
        bVal = b.category || "OWASP";
      } else if (key === "severity") {
        aVal = SEVERITY_ORDER[a.severity || "NOTICE"] ?? 99;
        bVal = SEVERITY_ORDER[b.severity || "NOTICE"] ?? 99;
      } else if (key === "action") {
        aVal = a.action;
        bVal = b.action;
      }

      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDirOwasp === "asc" ? aVal - bVal : bVal - aVal;
      }
      return sortDirOwasp === "asc"
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });
  }, [safeOwaspRules, searchQuery, statusFilter, catFilter, sortKeyOwasp, sortDirOwasp]);

  const OWASP_ITEMS_PER_PAGE = 50;
  const totalOwaspPages = Math.ceil(filteredOwaspRules.length / OWASP_ITEMS_PER_PAGE);
  const paginatedOwaspRules = React.useMemo(() => {
    const start = (currentOwaspPage - 1) * OWASP_ITEMS_PER_PAGE;
    return filteredOwaspRules.slice(start, start + OWASP_ITEMS_PER_PAGE);
  }, [filteredOwaspRules, currentOwaspPage]);

  const safeIpRules = Array.isArray(ipRules) ? ipRules : [];
  const whitelist = React.useMemo(() => safeIpRules.filter((r) => r.rule_type === "whitelist"), [safeIpRules]);
  const blacklist = React.useMemo(() => safeIpRules.filter((r) => r.rule_type === "blacklist"), [safeIpRules]);

  return (
    <DashboardLayout>
      <div className={`space-y-6 relative transition-all duration-500 ${isLocked ? 'blur-sm pointer-events-none select-none opacity-40' : ''}`}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" /> WAF Policies
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Configure WAF rules, IP access controls, and custom firewall logic
              {!canEdit && <span className="ml-2 text-amber-400 text-xs">(view only — contact an admin)</span>}
            </p>
          </div>
          <span className="text-[10px] font-mono uppercase bg-muted/40 border border-border px-2.5 py-1 rounded-full">
            {user?.role}
          </span>
        </div>

        <Tabs defaultValue="shield" className="space-y-6">
          <TabsList className="bg-muted/40 border border-border p-1 h-12 w-full md:w-auto overflow-x-auto justify-start flex-nowrap scrollbar-none">
            <TabsTrigger value="shield" className="gap-2 px-4 py-2 data-[state=active]:glow-primary">
              <Shield className="h-4 w-4" /> Shield
            </TabsTrigger>
            <TabsTrigger value="network" className="gap-2 px-4 py-2 data-[state=active]:glow-primary">
              <Globe className="h-4 w-4" /> Network
            </TabsTrigger>
            <TabsTrigger value="application" className="gap-2 px-4 py-2 data-[state=active]:glow-primary">
              <Lock className="h-4 w-4" /> Application
            </TabsTrigger>
            <TabsTrigger value="tooling" className="gap-2 px-4 py-2 data-[state=active]:glow-primary">
              <Settings className="h-4 w-4" /> Tooling
            </TabsTrigger>
          </TabsList>

          <TabsContent value="shield" className="space-y-6 mt-0">
            {/* Global Enforcement Mode */}
            <div className="bg-card border border-border rounded-xl p-6 shadow-md relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 bg-primary/5 rounded-bl-full pointer-events-none" />
              <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
                <div className="flex items-center gap-4">
                  <div className={`h-12 w-12 rounded-full flex items-center justify-center border-4 border-background shadow-lg transition-all duration-500 ${wafMode === "BLOCK" ? "bg-red-500 text-white animate-pulse" : "bg-amber-500 text-white"}`}>
                    <ShieldCheck className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold flex items-center gap-2">
                      Global Enforcement Mode: <span className={wafMode === "BLOCK" ? "text-red-500" : "text-amber-500"}>{wafMode === "BLOCK" ? "PREVENTION" : "DETECTION"}</span>
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {wafMode === "BLOCK"
                        ? "Malicious requests are actively blocked and dropped at the edge."
                        : "Malicious requests are logged and tagged but allowed to pass for analysis."}
                    </p>
                  </div>
                </div>

                <div className="flex bg-muted/50 p-1 rounded-xl border border-border">
                  <button
                    disabled={!canManageSecurityPolicies || modeLoading}
                    onClick={async () => {
                      setModeLoading(true);
                      try {
                        const res = await fetch("/api/firewall/mode", {
                          method: "POST", headers, body: JSON.stringify({ mode: "SIMULATE" })
                        });
                        if (res.ok) {
                          setWafMode("SIMULATE");
                          await qc.invalidateQueries({ queryKey: ["firewall-settings"] });
                          toast({ title: "WAF set to DETECTION mode" });
                        }
                      } catch (e) {
                        toast({ title: "Failed to update mode", variant: "destructive" });
                      } finally { setModeLoading(false); }
                    }}
                    className={`px-6 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${wafMode === "SIMULATE" ? "bg-card shadow-sm text-amber-500 border border-amber-500/20" : "text-muted-foreground hover:text-foreground border border-transparent"}`}
                  >
                    {modeLoading && wafMode === "SIMULATE" && <Loader2 className="h-3 w-3 animate-spin" />}
                    SIMULATE (LOG ONLY)
                  </button>
                  <button
                    disabled={!canManageSecurityPolicies || modeLoading}
                    onClick={async () => {
                      setModeLoading(true);
                      try {
                        const res = await fetch("/api/firewall/mode", {
                          method: "POST", headers, body: JSON.stringify({ mode: "BLOCK" })
                        });
                        if (res.ok) {
                          setWafMode("BLOCK");
                          await qc.invalidateQueries({ queryKey: ["firewall-settings"] });
                          toast({ title: "WAF set to PREVENTION mode" });
                        }
                      } catch (e) {
                        toast({ title: "Failed to update mode", variant: "destructive" });
                      } finally { setModeLoading(false); }
                    }}
                    className={`px-6 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${wafMode === "BLOCK" ? "bg-red-500 text-white shadow-lg shadow-red-500/20 border border-red-400" : "text-muted-foreground hover:text-foreground border border-transparent"}`}
                  >
                    {modeLoading && wafMode === "BLOCK" && <Loader2 className="h-3 w-3 animate-spin" />}
                    BLOCK (PREVENT)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Geo-Filtering Section */}
                <div className="bg-card border border-border rounded-xl p-5 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-5 w-5 text-primary" />
                        <div>
                          <h3 className="text-sm font-bold">Regional Geo-Filtering</h3>
                          <p className="text-[11px] text-muted-foreground">Enforce regional access policies</p>
                        </div>
                      </div>
                      <Switch checked={geoEnabled} onCheckedChange={setGeoEnabled} disabled={!canManageSecurityPolicies} />
                    </div>
                  </div>
                  {geoEnabled && (
                    <div className="flex justify-between items-center gap-2 mt-4">
                      <Select onValueChange={(c) => c && !geoAllowlist.includes(c) && setGeoAllowlist(p => [...p, c])}>
                        <SelectTrigger className="h-8 text-[10px] w-full"><SelectValue placeholder="Add Country..." /></SelectTrigger>
                        <SelectContent className="max-h-48">
                          {COUNTRIES.map(c => <SelectItem key={c} value={c} className="text-[10px]">{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Button size="sm" variant="outline" className="h-8 text-[10px]" onClick={saveSettings}>Apply</Button>
                    </div>
                  )}
                </div>

                {/* AI Semantic Engine */}
                <div className="bg-card border border-border rounded-xl p-5 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Zap className="h-5 w-5 text-indigo-500 animate-pulse" />
                        <div>
                          <h3 className="text-sm font-bold flex items-center gap-1.5">
                            AI Semantic Engine
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase ${mlDetectionEnabled ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : 'bg-muted text-muted-foreground'}`}>
                              {mlDetectionEnabled ? 'Active' : 'Disabled'}
                            </span>
                          </h3>
                          <p className="text-[11px] text-muted-foreground">Heuristic & anomaly detection shielding</p>
                        </div>
                      </div>
                      <Switch checked={mlDetectionEnabled} onCheckedChange={setMlDetectionEnabled} disabled={!canManageSecurityPolicies} />
                    </div>
                  </div>
                  <div className="flex justify-end mt-4">
                    <Button size="sm" variant="outline" className="h-8 text-[10px] border-indigo-500/30 hover:border-indigo-500 text-indigo-400 hover:text-indigo-300" onClick={saveSettings}>Apply</Button>
                  </div>
                </div>

                {/* Rate Limiting */}
                <div className="bg-card border border-border rounded-xl p-5 flex flex-col justify-between">
                  <div>
                    <h3 className="text-sm font-semibold mb-2">Rate Limiting</h3>
                    <p className="text-[11px] text-muted-foreground mb-4">Request count threshold per second</p>
                    <div className="flex items-center gap-2">
                      <Input type="number" value={rateLimit} onChange={e => setRateLimit(e.target.value)} className="h-8 font-mono text-xs w-20" />
                      <Button size="sm" className="h-8 text-xs underline decoration-primary/30" variant="ghost" onClick={saveSettings}>Update</Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="network" className="space-y-6 mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Allowlist */}
              <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
                <h3 className="text-sm font-bold mb-3 text-emerald-400 flex items-center gap-2 uppercase tracking-tight">
                  <Zap className="h-4 w-4" /> IP Allowlist
                </h3>
                <p className="text-[11px] text-muted-foreground mb-4 leading-relaxed">
                  Traffic from these IPs will bypass all security checks. Use this for trusted partners, office IPs, or automated testing services.
                </p>
                {canManageSecurityPolicies && (
                  <div className="flex gap-2 mb-4">
                    <Input placeholder="e.g. 196.188.1.1" value={newWhiteIp} onChange={e => setNewWhiteIp(e.target.value)}
                      className="bg-muted/50 text-xs font-mono h-9" onKeyDown={e => e.key === "Enter" && addIPRule("whitelist")} />
                    <Button size="sm" className="shrink-0 bg-emerald-600 hover:bg-emerald-700 h-9 px-3" onClick={() => addIPRule("whitelist")}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                )}
                <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
                  {whitelist.map(ip => (
                    <div key={ip.id} className="flex items-center justify-between py-2 px-3 rounded-lg text-xs font-mono bg-emerald-500/5 border border-emerald-500/10 hover:bg-emerald-500/10 transition-colors">
                      <span className="text-emerald-400">{ip.ip_address}</span>
                      {canManageSecurityPolicies && <button onClick={() => removeIPRule(ip.id)} className="text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>}
                    </div>
                  ))}
                  {whitelist.length === 0 && <div className="text-xs text-muted-foreground py-8 text-center bg-muted/5 rounded-lg border border-dashed border-border">No allowed IPs configured</div>}
                </div>
              </div>

              {/* Blocklist */}
              <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
                <h3 className="text-sm font-bold mb-3 text-red-400 flex items-center gap-2 uppercase tracking-tight">
                  <Ban className="h-4 w-4" /> IP Blocklist
                </h3>
                <p className="text-[11px] text-muted-foreground mb-4 leading-relaxed">
                  Explicitly block malicious IPs or ranges. These IPs are dropped immediately at the edge before any further processing.
                </p>
                {canManageSecurityPolicies && (
                  <div className="flex gap-2 mb-4">
                    <Input placeholder="e.g. 203.0.113.5" value={newBlackIp} onChange={e => setNewBlackIp(e.target.value)}
                      className="bg-muted/50 text-xs font-mono h-9" onKeyDown={e => e.key === "Enter" && addIPRule("blacklist")} />
                    <Button size="sm" variant="destructive" className="shrink-0 h-9 px-3" onClick={() => addIPRule("blacklist")}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                )}
                <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
                  {blacklist.map(ip => (
                    <div key={ip.id} className="flex items-center justify-between py-2 px-3 rounded-lg text-xs font-mono bg-red-500/5 border border-red-500/10 hover:bg-red-500/10 transition-colors">
                      <span className="text-red-400">{ip.ip_address}</span>
                      {canManageSecurityPolicies && <button onClick={() => removeIPRule(ip.id)} className="text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>}
                    </div>
                  ))}
                  {blacklist.length === 0 && <div className="text-xs text-muted-foreground py-8 text-center bg-muted/5 rounded-lg border border-dashed border-border">No blocked IPs configured</div>}
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="application" className="space-y-6 mt-0">
            {/* Rule Library Panel */}
            <div className="border border-border/80 bg-card rounded-xl p-5 shadow-sm space-y-4 relative">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-primary" /> Rule Library
                  </h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Central repository of all WAF rules (OWASP Core Rule Set + Custom Policies)</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setCustomRulesOpen(p => !p)} className="text-muted-foreground">
                    {customRulesOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {customRulesOpen && (
                <div className="space-y-3">
                  {/* Tab Switcher */}
                  <div className="flex bg-muted/20 p-1 rounded-lg">
                    <button
                      onClick={() => setLibraryTab("custom")}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-2 ${libraryTab === "custom" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      <Zap className="h-3 w-3" /> Custom Policies
                    </button>
                    <button
                      onClick={() => setLibraryTab("owasp")}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-2 ${libraryTab === "owasp" ? "bg-background shadow text-foreground text-blue-500" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      <ShieldCheck className="h-3 w-3" /> OWASP Core Rules
                    </button>
                  </div>

                  {/* Action Bar (Custom Only) */}
                  {libraryTab === "custom" && canEdit && !showRuleBuilder && (
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={handleExport}>
                        <Download className="h-3.5 w-3.5" /> Export
                      </Button>
                      <div className="relative">
                        <Input
                          type="file"
                          className="absolute inset-0 opacity-0 cursor-pointer"
                          accept=".json"
                          onChange={handleImport}
                        />
                        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5">
                          <Upload className="h-3.5 w-3.5" /> Import
                        </Button>
                      </div>
                      <Button
                        size="sm"
                        className="h-8 text-xs gap-1.5 glow-primary"
                        onClick={() => setShowRuleBuilder(true)}
                      >
                        <Plus className="h-3.5 w-3.5" /> New Rule
                      </Button>
                    </div>
                  )}

                  {/* Search & Filter Bar */}
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder={libraryTab === "custom" ? "Search custom rules..." : "Search OWASP rules (Name, ID, Dec)..."}
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="h-9 pl-9 text-xs bg-muted/30"
                      />
                    </div>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="h-9 text-xs w-[120px] bg-muted/30"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all" className="text-xs">Any Status</SelectItem>
                        <SelectItem value="enabled" className="text-xs">Enabled</SelectItem>
                        <SelectItem value="disabled" className="text-xs">Disabled</SelectItem>
                        <SelectItem value="BLOCK" className="text-xs">Action: Block</SelectItem>
                        <SelectItem value="LOG" className="text-xs">Action: Simulate</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={catFilter} onValueChange={setCatFilter}>
                      <SelectTrigger className="h-9 text-xs w-[140px] bg-muted/30"><SelectValue placeholder="Category" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all" className="text-xs">Any Category</SelectItem>
                        {Array.from(new Set([
                          ...safeCustomRules.map(r => r.category),
                          ...safeOwaspRules.map(r => r.category).filter(Boolean)
                        ])).sort().map(c => (
                          <SelectItem key={c} value={c!} className="text-xs">{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {libraryTab === "owasp" && latestOwaspSync && (
                    <div className="bg-primary border-2 border-primary/20 rounded-xl p-4 flex items-center justify-between mb-4 shadow-lg text-white">
                      <div className="flex items-center gap-3">
                        <div className="bg-white/20 p-2 rounded-lg backdrop-blur-sm">
                          <Clock className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <p className="text-sm font-black uppercase tracking-tight">Security rules updated</p>
                          <p className="text-[11px] text-white/80 font-medium">Last Ruleset Sync: {latestOwaspSync.toLocaleString()}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] bg-white text-primary px-3 py-1.5 rounded-full font-black uppercase tracking-widest shadow-sm">
                        <CheckCircle2 className="h-3.5 w-3.5" /> System Protected
                      </div>
                    </div>
                  )}

                  {libraryTab === "custom" ? (
                    <>
                      {(showRuleBuilder || editingRule) && (
                        <CustomRuleBuilder
                          initialRule={editingRule || undefined}
                          onSave={saveCustomRule}
                          onCancel={() => { setShowRuleBuilder(false); setEditingRule(null); }}
                          token={token}
                        />
                      )}

                      {customRules.length === 0 && !showRuleBuilder && !editingRule ? (
                        <div className="py-8 text-center text-muted-foreground text-sm border border-dashed border-border rounded-lg">
                          No custom rules yet. Click <strong>New Rule</strong> to build one.
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {filteredRules.length === 0 && (
                            <div className="py-8 text-center text-muted-foreground text-sm border border-dashed border-border rounded-lg">
                              No matching custom rules found.
                            </div>
                          )}
                          {filteredRules.map((rule) => (
                            <div key={rule.id} className={`flex items-center justify-between py-2.5 px-3 rounded-lg border transition-colors ${rule.enabled ? "bg-muted/20 border-border/60" : "bg-muted/10 border-border/30 opacity-60"}`}>
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="text-[9px] font-mono text-muted-foreground/60 w-4">{rule.priority}</span>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium truncate flex items-center gap-2">
                                    {rule.name}
                                    <span className="text-[9px] font-mono font-bold px-1.5 rounded-full border border-primary/20 bg-primary/10 text-primary">
                                      {rule.category || "Custom"}
                                    </span>
                                  </p>
                                  <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                                    {rule.is_raw ? (
                                      <span className="text-primary/70">{"<RAW MODSECURITY> "}</span>
                                    ) : (
                                      <>
                                        IF {rule.condition_field} {rule.condition_operator} <span className="text-foreground/70">"{rule.condition_value}"</span>
                                        {rule.logic_operator && <> {rule.logic_operator} {rule.condition2_field} {rule.condition2_operator} <span className="text-foreground/70">"{rule.condition2_value}"</span></>}
                                      </>
                                    )}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {rule.is_raw ? (
                                  <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border border-primary/30 bg-primary/10 text-primary">RAW RULE</span>
                                ) : (
                                  <div className="flex gap-1.5 items-center">
                                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border border-muted-foreground/30 bg-muted/10 text-muted-foreground">CUSTOM BUILDER</span>
                                    {actionBadge(rule.action)}
                                  </div>
                                )}
                                {canEdit && (
                                  <div className="flex items-center gap-1.5 ml-2 transition-all">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0 text-blue-400 hover:text-blue-500 hover:bg-blue-500/10"
                                      title="View version history"
                                      onClick={() => {
                                        setSelectedHistoryRule(rule);
                                        setShowHistory(true);
                                        fetchHistory(rule.id);
                                      }}
                                    >
                                      <History className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0"
                                      onClick={() => setEditingRule(rule)}
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0 text-destructive"
                                      onClick={() => deleteCustomRule(rule.id)}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                    <div className="w-px h-4 bg-border mx-1"></div>
                                    <Select value={!rule.enabled ? "DISABLED" : rule.action} onValueChange={(v) => changeCustomRuleState(rule.id, v)}>
                                      <SelectTrigger className="h-7 text-xs w-[110px] bg-muted/50 border-border"><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="BLOCK" className="text-xs text-red-500 font-medium">Block</SelectItem>
                                        <SelectItem value="LOG" className="text-xs text-amber-500 font-medium">Simulate</SelectItem>
                                        <SelectItem value="DISABLED" className="text-xs text-muted-foreground">Disabled</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="space-y-3">
                      <OwaspPagination className="mb-2" />
                      <OwaspSortHeader />
                      <div className="space-y-1.5">
                        {paginatedOwaspRules.length === 0 && (
                          <div className="py-8 text-center text-muted-foreground text-sm border border-dashed border-border rounded-lg">
                            No matching OWASP rules found.
                          </div>
                        )}
                        {paginatedOwaspRules.map((rule) => (
                          <OWASPRuleRow
                            key={rule.id}
                            rule={rule}
                            isExpanded={!!expandedOwaspRules[rule.rule_id || (rule as any).ruleId || rule.id.split('-')[0]]}
                            onToggleExpand={toggleExpanded}
                            ruleExclusions={owaspExclusions.filter(e => (e.rule_id || (e as any).ruleId) === (rule.rule_id || (rule as any).ruleId || rule.id.split('-')[0]))}
                            canEdit={canEdit}
                            onToggleRule={toggleOwaspRule}
                            onAddExclusion={addOwaspExclusion}
                            onUpdateExclusion={updateOwaspExclusion}
                            onRemoveExclusion={removeOwaspExclusion}
                            onCloneRule={(r) => {
                              const rId = r.rule_id || (r as any).ruleId || r.id.split('-')[0];
                              setEditingRule({
                                id: "new",
                                name: `Clone of Rule ${rId}: ${r.name}`,
                                description: `Deeply customized version of standard OWASP rule ${rId}.\n\nOriginal description: ${r.description}`,
                                action: r.action === "DISABLED" ? "BLOCK" : r.action as any,
                                enabled: true,
                                priority: 50,
                                is_raw: true,
                                condition_field: "uri",
                                condition_operator: "contains",
                                condition_value: "/",
                                condition2_field: "ip",
                                condition2_operator: "eq",
                                condition2_value: "",
                                logic_operator: "",
                                category: r.category || "Custom",
                                raw_content: `# Customization for Core Rule ${rId}\n# Original: ${r.name}\n\nSecRule REQUEST_URI "@rx .*" \\\n    "id:100${rId},phase:2,deny,status:403,msg:'${r.name} (Custom Override)'"`
                              });
                              setShowRuleBuilder(true);
                              setLibraryTab("custom");
                            }}
                          />
                        ))}
                      </div>
                      <OwaspPagination className="mt-2" />
                    </div>
                  )}
                </div>
              )}
            </div>

          </TabsContent>

          <TabsContent value="tooling" className="space-y-6 mt-0">
            <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-6">
              <div>
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <History className="h-4 w-4 text-blue-400" /> Operational History
                </h3>
                <p className="text-[11px] text-muted-foreground mt-1">Review recent policy changes and rollback to previous versions.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div className="p-4 rounded-lg border border-border bg-muted/5 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Configuration Backup</h4>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1 h-9 gap-2" onClick={handleExport}>
                      <Download className="h-3.5 w-3.5" /> Export All
                    </Button>
                    <div className="relative flex-1">
                      <Input type="file" className="absolute inset-0 opacity-0 cursor-pointer" accept=".json" onChange={handleImport} />
                      <Button size="sm" variant="outline" className="w-full h-9 gap-2">
                        <Upload className="h-3.5 w-3.5" /> Import Rules
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-lg border border-border bg-muted/5 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Audit Trail</h4>
                  <Button size="sm" variant="outline" className="w-full h-9 gap-2" onClick={() => {
                    if (customRules.length > 0) {
                      setSelectedHistoryRule(customRules[0]);
                      setShowHistory(true);
                      fetchHistory(customRules[0].id);
                    }
                  }}>
                    <History className="h-3.5 w-3.5" /> View Version Log
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* History Modal Overlay */}
        {showHistory && (
          <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-card w-full max-w-lg rounded-xl border shadow-xl p-5 relative">
              <button onClick={() => setShowHistory(false)} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <History className="h-5 w-5 text-blue-400" /> Rule Version History
              </h3>

              <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1 custom-scrollbar">
                {historyLoading ? (
                  <div className="py-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                ) : historyVersions.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic text-center py-6">No historical versions available.</p>
                ) : (
                  historyVersions.map((v) => (
                    <div key={v.id} className="flex flex-col gap-2 p-3 bg-muted/10 border border-border/50 rounded-lg">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-xs font-mono text-muted-foreground">
                            {new Date(v.version_timestamp).toLocaleString()}
                          </p>
                          <p className="text-[10px] text-muted-foreground">By: {v.changed_by}</p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          onClick={() => rollbackVersion(v.rule_id, v.id)}
                        >
                          <RotateCcw className="h-3 w-3" /> Restore
                        </Button>
                      </div>
                      <div className="text-[9px] font-mono whitespace-pre-wrap bg-background p-2 rounded-md border border-border/30 max-h-20 overflow-hidden">
                        {v.snapshot_data}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {isLocked && (
        <UpgradeOverlay
          title="WAF Policy Management"
          description="Configure OWASP rule sets, custom firewall logic, IP access controls, and geo-filtering. WAF Policy Management requires the Standard plan or above."
          feature="WAF Policies"
        />
      )}
    </DashboardLayout>
  );
}

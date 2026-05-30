import React, { useState, useEffect } from "react";
import {
  ShieldCheck, Plus, Trash2, MapPin, Loader2, Check, Copy,
  Zap, Filter, ChevronDown, ChevronRight, X, Save, Ban, Search, Download, Upload, History, Beaker, Pencil, RotateCcw, Play, ShieldAlert,
  RefreshCw
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/hooks/use-auth";
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
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  // General view/edit for standard rules
  const canEdit = user?.role === "super_admin" || user?.role === "admin" || user?.role === "tenant_admin" || user?.role === "security_engineer" || user?.role === "analyst";

  // Restricted management for sensitive tenant policies (per user request)
  const canManageSecurityPolicies = user?.role === "super_admin" || user?.role === "admin" || user?.role === "tenant_admin";

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
  const [rateSaving, setRateSaving] = useState(false);
  const [customRulesOpen, setCustomRulesOpen] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [catFilter, setCatFilter] = useState("all");
  const [showHistory, setShowHistory] = useState(false);
  const [selectedHistoryRule, setSelectedHistoryRule] = useState<CustomRule | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

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
  useEffect(() => { sessionStorage.setItem("waf_policies_search", searchQuery); }, [searchQuery]);
  useEffect(() => { sessionStorage.setItem("waf_policies_expanded", JSON.stringify(expandedOwaspRules)); }, [expandedOwaspRules]);

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

  const token = (localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token")) || sessionStorage.getItem("auth_token");
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`
  };

  // Queries


  const { data: ipRules = [] } = useQuery<IPRule[]>({
    queryKey: ["ip-rules"],
    queryFn: () => fetch("/api/firewall/rules", { headers }).then(r => r.json()),
  });

  const { data: uriExclusions = [] } = useQuery<any[]>({
    queryKey: ["uri-exclusions"],
    queryFn: async () => {
      const res = await fetch("/api/firewall/uri-exclusions", { headers });
      if (!res.ok) throw new Error("Failed to load exclusions");
      return res.json();
    },
    enabled: !!token
  });

  const { data: owaspExclusions = [] } = useQuery<OWASPRuleExclusion[]>({
    queryKey: ["owasp-exclusions"],
    queryFn: async () => {
      const res = await fetch("/api/firewall/owasp-exclusions", { headers });
      if (!res.ok) throw new Error("Failed to load owasp exclusions");
      return res.json();
    },
    enabled: !!token,
    staleTime: 300000 // 5 minutes
  });

  const { data: customRules = [] } = useQuery<CustomRule[]>({
    queryKey: ["custom-rules"],
    queryFn: () => fetch("/api/firewall/custom-rules", { headers }).then(r => {
      if (!r.ok) throw new Error(`Failed to fetch custom rules: ${r.status}`);
      return r.json();
    }),
  });

  const { data: owaspRules = [], refetch: refetchOwasp } = useQuery<OWASPRule[]>({
    queryKey: ["owasp-rules"],
    queryFn: () => fetch("/api/firewall/owasp-rules", { headers }).then(r => {
      if (!r.ok) throw new Error(`Failed to fetch OWASP rules: ${r.status}`);
      return r.json();
    }),
    staleTime: 600000 // 10 minutes
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
          tenant_id: user?.tenantId,
          geo_enabled: geoEnabled,
          geo_mode: geoMode,
          geo_allowlist: geoAllowlist.join(","),
          geo_blocklist: geoBlocklist.join(","),
          rate_limit_rps: parseInt(rateLimit) || 100
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

  const filteredOwaspRules = React.useMemo(() => safeOwaspRules.filter(r => {
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
  }), [safeOwaspRules, searchQuery, statusFilter, catFilter]);

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
        </div>

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
                <div className="space-y-1.5">
                  {filteredOwaspRules.length === 0 && (
                    <div className="py-8 text-center text-muted-foreground text-sm border border-dashed border-border rounded-lg">
                      No matching OWASP rules found.
                    </div>
                  )}
                  {filteredOwaspRules.map((rule) => (
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
              )}
            </div>
          )}
        </div>

        {/* History Modal Overlay */}
        {showHistory && (
          <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-card w-full max-w-lg rounded-xl border shadow-xl p-5 relative">
              <button onClick={() => setShowHistory(false)} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <History className="h-5 w-5 text-blue-400" /> Rule Version History
              </h3>

              <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1 custom-scrollbar">
                {historyVersions.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic text-center py-6">No historical versions available for this rule.</p>
                ) : (
                  historyVersions.map((v) => (
                    <div key={v.id} className="flex flex-col gap-2 p-3 bg-muted/10 border border-border/50 rounded-lg">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-xs font-mono text-muted-foreground">
                            {new Date(v.version_timestamp).toLocaleString()}
                          </p>
                          <p className="text-[10px] text-muted-foreground">Edited by: {v.changed_by}</p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1 border-blue-500/30 text-blue-400 hover:bg-blue-500/10 hover:text-blue-300"
                          onClick={() => rollbackVersion(v.rule_id, v.id)}
                        >
                          <RotateCcw className="h-3 w-3" /> Restore
                        </Button>
                      </div>
                      <div className="text-[9px] font-mono whitespace-pre-wrap bg-background p-2 rounded-md overflow-x-auto text-muted-foreground/80 border border-border/30">
                        {v.snapshot_data.length > 250 ? v.snapshot_data.substring(0, 250) + "..." : v.snapshot_data}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}



        {/* URI Exclusions */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-3">URI Exclusions (WAF Bypass Paths)</h3>
          {canManageSecurityPolicies && (
            <div className="flex gap-2 mb-3">
              <Input placeholder="/api/health" value={newUri} onChange={e => setNewUri(e.target.value)} className="bg-muted/50 text-xs font-mono flex-1" />
              <Input placeholder="Description (optional)" value={newUriDesc} onChange={e => setNewUriDesc(e.target.value)} className="bg-muted/50 text-xs flex-1" />
              <Button size="sm" className="shrink-0" onClick={addURI}><Plus className="h-3.5 w-3.5" /></Button>
            </div>
          )}
          <div className="space-y-1.5">
            {(Array.isArray(uriExclusions) ? uriExclusions : []).map(u => (
              <div key={u.id} className={`flex items-center justify-between py-1.5 px-2 rounded text-xs font-mono bg-muted/20 ${!u.enabled ? "opacity-50" : ""}`}>
                <div className="flex items-center gap-2">
                  <Switch checked={u.enabled} onCheckedChange={() => canManageSecurityPolicies && toggleURI(u.id, u.enabled)} className="scale-75" disabled={!canManageSecurityPolicies} />
                  <span className={u.enabled ? "" : "line-through"}>{u.uri_pattern}</span>
                  {u.description && <span className="text-muted-foreground font-sans">— {u.description}</span>}
                </div>
                {canManageSecurityPolicies && <button onClick={() => deleteURI(u.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>}
              </div>
            ))}
            {uriExclusions.length === 0 && <p className="text-xs text-muted-foreground py-2">No URI exclusions configured</p>}
          </div>
        </div>

        {/* Geo-Filtering Section */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              <div>
                <h3 className="text-sm font-bold">Regional Geo-Filtering</h3>
                <p className="text-[11px] text-muted-foreground">Enforce regional access policies and block high-risk territories</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 mr-4 px-3 py-1 bg-muted/30 rounded-full border border-border">
                <span className="text-[10px] font-bold text-muted-foreground uppercase">Active Mode:</span>
                <span className={`text-[10px] font-mono font-bold ${geoMode === 'allowlist' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {geoMode === 'allowlist' ? 'PASS TRUSTED ONLY' : 'BLOCK TARGETED'}
                </span>
              </div>
              <Switch checked={geoEnabled} onCheckedChange={setGeoEnabled} disabled={!canManageSecurityPolicies} />
            </div>
          </div>

          {geoEnabled && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Geo Allowlist */}
                <div className={`space-y-4 p-4 rounded-xl border transition-all ${geoMode === 'allowlist' ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-muted/10 border-border opacity-60'}`}>
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-emerald-400 flex items-center gap-2 uppercase">
                      <ShieldCheck className="h-3.5 w-3.5" /> Trusted Regions
                    </h4>
                    <button
                      onClick={() => setGeoMode('allowlist')}
                      className={`text-[9px] px-2 py-0.5 rounded border transition-all ${geoMode === 'allowlist' ? 'bg-emerald-500 text-white border-emerald-500' : 'border-border text-muted-foreground hover:border-emerald-500/50'}`}
                    >
                      {geoMode === 'allowlist' ? 'ACTIVE' : 'ACTIVATE'}
                    </button>
                  </div>

                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-1.5 p-2 rounded bg-background/50 border border-border min-h-[60px]">
                      {geoAllowlist.map(c => (
                        <span key={c} className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[9px] font-mono font-bold">
                          {c}
                          <button onClick={() => setGeoAllowlist(p => p.filter(x => x !== c))} className="hover:text-white"><X className="h-2 w-2" /></button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Select onValueChange={(c) => c && !geoAllowlist.includes(c) && setGeoAllowlist(p => [...p, c])}>
                        <SelectTrigger className="h-8 text-[10px] bg-background/50"><SelectValue placeholder="Add to allowlist..." /></SelectTrigger>
                        <SelectContent className="max-h-48 overflow-y-auto">
                          {COUNTRIES.map(c => <SelectItem key={c} value={c} className="text-[10px]">{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Geo Blocklist */}
                <div className={`space-y-4 p-4 rounded-xl border transition-all ${geoMode === 'blocklist' ? 'bg-red-500/5 border-red-500/20' : 'bg-muted/10 border-border opacity-60'}`}>
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-red-400 flex items-center gap-2 uppercase">
                      <Ban className="h-3.5 w-3.5" /> Restricted Regions
                    </h4>
                    <button
                      onClick={() => setGeoMode('blocklist')}
                      className={`text-[9px] px-2 py-0.5 rounded border transition-all ${geoMode === 'blocklist' ? 'bg-red-500 text-white border-red-500' : 'border-border text-muted-foreground hover:border-red-500/50'}`}
                    >
                      {geoMode === 'blocklist' ? 'ACTIVE' : 'ACTIVATE'}
                    </button>
                  </div>

                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-1.5 p-2 rounded bg-background/50 border border-border min-h-[60px]">
                      {geoBlocklist.map(c => (
                        <span key={c} className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-[9px] font-mono font-bold">
                          {c}
                          <button onClick={() => setGeoBlocklist(p => p.filter(x => x !== c))} className="hover:text-white"><X className="h-2 w-2" /></button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Select onValueChange={(c) => c && !geoBlocklist.includes(c) && setGeoBlocklist(p => [...p, c])}>
                        <SelectTrigger className="h-8 text-[10px] bg-background/50"><SelectValue placeholder="Add to blocklist..." /></SelectTrigger>
                        <SelectContent className="max-h-48 overflow-y-auto">
                          {COUNTRIES.map(c => <SelectItem key={c} value={c} className="text-[10px]">{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t border-border">
                <Button size="sm" className="font-mono text-xs h-8 glow-primary" onClick={saveSettings} disabled={rateSaving}>
                  {rateSaving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                  Apply Regional Policies
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Rate Limiting */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-3">Rate Limiting</h3>
          <div className="flex items-center gap-4">
            <Label className="text-xs text-muted-foreground shrink-0">Max requests / minute / IP</Label>
            <Input type="number" value={rateLimit} onChange={e => setRateLimit(e.target.value)} className="bg-muted/50 font-mono w-28" disabled={!canManageSecurityPolicies} />
            {canManageSecurityPolicies && (
              <Button size="sm" className="font-mono text-xs glow-primary" disabled={rateSaving} onClick={saveSettings}>
                {rateSaving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Zap className="h-3 w-3 mr-1" />}
                Apply Rate Limit
              </Button>
            )}
          </div>
        </div>
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

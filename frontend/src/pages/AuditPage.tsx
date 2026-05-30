import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import {
  Loader2, ShieldCheck, ShieldAlert, Clock, Database,
  User as UserIcon, Activity, Globe, Eye, ExternalLink, X, Info,
  ChevronRight
} from "lucide-react";
import { format } from "date-fns";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function AuditPage() {
  const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
  const [selectedLog, setSelectedLog] = useState<any>(null);

  const { data: auditLogs = [], isLoading } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: () => fetch("/api/audit", {
      headers: { "Authorization": `Bearer ${token}` }
    }).then(r => r.json())
  });

  const renderJson = (jsonStr: string | null) => {
    if (!jsonStr) return <span className="text-muted-foreground italic text-xs">None</span>;
    try {
      const obj = JSON.parse(jsonStr);
      return (
        <pre className="text-[11px] font-mono bg-muted/30 p-3 rounded-md overflow-x-auto w-full border border-border/50 max-h-[300px] custom-scrollbar">
          {JSON.stringify(obj, null, 2)}
        </pre>
      );
    } catch {
      return <span className="text-xs font-mono break-all">{jsonStr}</span>;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Audit & Compliance</h1>
            <p className="text-sm text-muted-foreground">Comprehensive tracking of all platform configuration changes.</p>
          </div>
          <div className="text-[10px] font-mono text-muted-foreground bg-muted/30 px-2 py-1 rounded border border-border/50">
            Total entries: {auditLogs.length}
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-muted-foreground uppercase text-[10px] font-bold tracking-wider">
                <tr>
                  <th className="px-6 py-4">Timestamp</th>
                  <th className="px-6 py-4">Action</th>
                  <th className="px-6 py-4">Method</th>
                  <th className="px-6 py-4">User</th>
                  <th className="px-6 py-4">Resource</th>
                  <th className="px-6 py-4">Path</th>
                  <th className="px-6 py-4">Source IP</th>
                  <th className="px-6 py-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                    </td>
                  </tr>
                ) : auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center">
                      <ShieldCheck className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-20" />
                      <p className="text-muted-foreground font-medium">No audit logs found.</p>
                      <p className="text-xs text-muted-foreground mt-1">Configuration changes will appear here.</p>
                    </td>
                  </tr>
                ) : (
                  auditLogs.map((log: any) => (
                    <tr key={log.id} className="hover:bg-muted/30 transition-colors group border-transparent">
                      <td className="px-6 py-4 whitespace-nowrap text-xs font-mono">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {format(new Date(log.timestamp), "MMM d, HH:mm:ss")}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono tracking-wider border
                          ${log.action === "Created" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" :
                            log.action === "Deleted" ? "bg-red-500/10 text-red-500 border-red-500/20" :
                              "bg-blue-500/10 text-blue-400 border-blue-500/20"}`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {log.requestMethod || log.request_method ? (
                          <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border border-border/50 bg-muted/40 text-muted-foreground`}>
                            {log.requestMethod || log.request_method}
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground font-mono italic">N/A</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-xs">
                        <div className="flex items-center gap-2">
                          <UserIcon className="h-3 w-3 text-muted-foreground" />
                          <span className="font-medium text-[11px]">{log.userEmail?.split('@')[0] || "System"}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-xs font-semibold">
                          {log.entityName}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-[10px] font-mono text-muted-foreground truncate max-w-[140px]" title={log.requestPath || log.request_path}>
                          {log.requestPath || log.request_path || "/api/..."}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
                          <Globe className="h-3 w-3" />
                          {log.ip_address || log.ipAddress || "127.0.0.1"}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 text-[11px] font-bold transition-all"
                        >
                          <Eye className="h-3 w-3" /> Details
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-2xl bg-card border-border shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Activity className="h-5 w-5 text-primary" />
              Audit Event Details
            </DialogTitle>
            <DialogDescription className="font-mono text-[10px] break-all uppercase tracking-tighter">
              Event ID: {selectedLog?.id}
            </DialogDescription>
          </DialogHeader>

          {selectedLog && (
            <div className="grid grid-cols-2 gap-4 mt-2">
              <div className="space-y-4">
                <div className="space-y-1">
                  <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Timestamp
                  </h4>
                  <p className="text-sm font-mono">{format(new Date(selectedLog.timestamp), "yyyy-MM-dd HH:mm:ss")}</p>
                </div>
                <div className="space-y-1">
                  <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                    <UserIcon className="h-3 w-3" /> Initiated By
                  </h4>
                  <p className="text-sm font-medium">{selectedLog.userEmail || "System Internal"}</p>
                  <p className="text-[9px] text-muted-foreground font-mono">User ID: {selectedLog.userId || "N/A"}</p>
                </div>
                <div className="space-y-1">
                  <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                    <Globe className="h-3 w-3" /> Origin Context
                  </h4>
                  <p className="text-sm font-mono">{selectedLog.ip_address || selectedLog.ipAddress || "localhost"}</p>
                  {selectedLog.tenantId && <p className="text-[9px] text-muted-foreground font-mono">Tenant ID: {selectedLog.tenantId}</p>}
                </div>
                <div className="space-y-1">
                  <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                    <Database className="h-3 w-3" /> Resource
                  </h4>
                  <div className="flex flex-col gap-1">
                    <p className="text-sm font-semibold text-primary">{selectedLog.entityName}</p>
                    <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground font-mono w-fit">ID: {selectedLog.entityId}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                    <ExternalLink className="h-3 w-3" /> HTTP Interface
                  </h4>
                  <div className="flex items-center gap-2">
                    {selectedLog.requestMethod && (
                      <span className="text-[9px] font-bold px-1 rounded bg-muted border border-border">
                        {selectedLog.requestMethod}
                      </span>
                    )}
                    <p className="text-[11px] font-mono truncate max-w-[180px]">{selectedLog.requestPath || "/api/..."}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5 h-full flex flex-col">
                  <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex justify-between">
                    <span>Change Data</span>
                    <span className={`px-1 rounded ${selectedLog.action === "Created" ? "bg-emerald-500/20 text-emerald-400" : selectedLog.action === "Deleted" ? "bg-red-500/20 text-red-400" : "bg-blue-500/20 text-blue-400"}`}>
                      {selectedLog.action}
                    </span>
                  </h4>

                  <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                    {selectedLog.action === "Modified" ? (
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <Label className="text-[9px] uppercase text-muted-foreground font-bold">Original State</Label>
                          {renderJson(selectedLog.oldValues || selectedLog.old_values)}
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[9px] uppercase text-primary font-bold">New State</Label>
                          {renderJson(selectedLog.newValues || selectedLog.new_values)}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <Label className="text-[9px] uppercase text-muted-foreground font-bold">
                          {selectedLog.action === "Created" ? "Initial State" : "Last Known State"}
                        </Label>
                        {renderJson(selectedLog.newValues || selectedLog.new_values || selectedLog.oldValues || selectedLog.old_values)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="mt-6 pt-4 border-t border-border/50 overflow-hidden">
            <details className="group">
              <summary className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest cursor-pointer hover:text-foreground flex items-center gap-1 select-none">
                <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
                Raw Audit Source
              </summary>
              <div className="mt-2 w-full overflow-hidden">
                {renderJson(JSON.stringify(selectedLog))}
              </div>
            </details>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

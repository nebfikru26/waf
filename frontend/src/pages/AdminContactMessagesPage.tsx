import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Mail, Inbox, CheckCircle2, Eye, RefreshCw, Loader2, Clock, User as UserIcon,
} from "lucide-react";

interface ContactMessage {
  id: string;
  name: string;
  email: string;
  subject?: string | null;
  message: string;
  ipAddress?: string | null;
  status: "New" | "Read" | "Resolved" | string;
  createdAt: string;
}

const STATUS_STYLES: Record<string, string> = {
  New: "text-red-400 border-red-400/30 bg-red-400/8",
  Read: "text-amber-400 border-amber-400/30 bg-amber-400/8",
  Resolved: "text-emerald-400 border-emerald-400/30 bg-emerald-400/8",
};

export default function AdminContactMessagesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isPlatformAdmin = user?.role === "super_admin" || user?.role === "admin" || user?.role === "support_engineer";

  if (!isPlatformAdmin) {
    navigate("/");
    return null;
  }

  const headers = useMemo(() => ({ "Content-Type": "application/json" }), []);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: messages = [], isLoading, refetch, isFetching } = useQuery<ContactMessage[]>({
    queryKey: ["admin-contact-messages"],
    queryFn: () => fetch("/api/contact", { headers }).then(r => r.json()),
    refetchInterval: 30_000,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      fetch(`/api/contact/${id}/status`, { method: "PUT", headers, body: JSON.stringify({ status }) }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-contact-messages"] });
    },
    onError: () => toast({ title: "Failed to update status", variant: "destructive" }),
  });

  const safeMessages = Array.isArray(messages) ? messages : [];
  const counts = {
    total: safeMessages.length,
    new: safeMessages.filter(m => m.status === "New").length,
    read: safeMessages.filter(m => m.status === "Read").length,
    resolved: safeMessages.filter(m => m.status === "Resolved").length,
  };

  const markRead = (m: ContactMessage) => {
    setExpandedId(prev => (prev === m.id ? null : m.id));
    if (m.status === "New") {
      statusMutation.mutate({ id: m.id, status: "Read" });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Inbox className="h-5 w-5 text-primary" /> Contact Messages
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Submissions from the public marketing-site contact form
            </p>
          </div>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-3 w-3 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        {/* No email backend banner */}
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex gap-3">
          <Mail className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-primary mb-1">No Outbound Email Delivery</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              This platform has no SMTP/email-sending service configured. Contact form submissions are stored here
              instead of being emailed — review and triage them from this inbox, and follow up with senders directly
              at the email address they provided.
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total Messages", value: counts.total, subtext: "All time", icon: Inbox, color: "text-primary" },
            { label: "New", value: counts.new, subtext: "Unreviewed", icon: Mail, color: "text-red-400" },
            { label: "Read", value: counts.read, subtext: "Awaiting resolution", icon: Eye, color: "text-amber-400" },
            { label: "Resolved", value: counts.resolved, subtext: "Handled", icon: CheckCircle2, color: "text-emerald-400" },
          ].map((s) => (
            <div key={s.label} className="stat-card">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-muted">
                  <s.icon className={`h-4 w-4 ${s.color}`} />
                </div>
                <span className="text-sm text-muted-foreground">{s.label}</span>
              </div>
              <p className="text-2xl font-bold font-mono">{s.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.subtext}</p>
            </div>
          ))}
        </div>

        {/* Inbox */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Inbox className="h-4 w-4 text-primary" /> Inbox
              {counts.new > 0 && (
                <Badge className="text-[9px] font-mono bg-red-500/15 text-red-400 border-red-500/30 border ml-1">{counts.new} new</Badge>
              )}
            </h3>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : safeMessages.length === 0 ? (
            <div className="py-6 text-center text-muted-foreground text-sm border border-dashed border-border rounded-xl">
              No contact messages yet. Submissions from the landing page will appear here.
            </div>
          ) : (
            <div className="space-y-1.5">
              {safeMessages.map((m) => (
                <div key={m.id} className="rounded-lg bg-muted/20 hover:bg-muted/40 transition-colors text-xs overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between py-2.5 px-3 text-left"
                    onClick={() => markRead(m)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-mono text-muted-foreground shrink-0 flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {new Date(m.createdAt).toLocaleString()}
                      </span>
                      <span className="font-mono shrink-0 flex items-center gap-1">
                        <UserIcon className="h-3 w-3 text-muted-foreground" /> {m.name}
                      </span>
                      <span className="font-mono text-primary truncate">{m.subject || "(no subject)"}</span>
                    </div>
                    <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border shrink-0 ${STATUS_STYLES[m.status] || STATUS_STYLES.New}`}>
                      {m.status.toUpperCase()}
                    </span>
                  </button>

                  {expandedId === m.id && (
                    <div className="px-3 pb-3 pt-1 border-t border-border/40 space-y-2">
                      <p className="text-muted-foreground">
                        From <a href={`mailto:${m.email}`} className="text-primary hover:underline font-mono">{m.email}</a>
                        {m.ipAddress && <span className="text-muted-foreground/60"> · {m.ipAddress}</span>}
                      </p>
                      <p className="whitespace-pre-wrap text-foreground/90 leading-relaxed">{m.message}</p>
                      <div className="flex items-center gap-2 pt-1">
                        {m.status !== "Resolved" && (
                          <Button
                            size="sm" variant="ghost" className="h-6 text-[10px] font-mono text-muted-foreground hover:text-emerald-400"
                            disabled={statusMutation.isPending}
                            onClick={() => statusMutation.mutate({ id: m.id, status: "Resolved" })}
                          >
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Mark Resolved
                          </Button>
                        )}
                        {m.status === "Resolved" && (
                          <Button
                            size="sm" variant="ghost" className="h-6 text-[10px] font-mono text-muted-foreground"
                            disabled={statusMutation.isPending}
                            onClick={() => statusMutation.mutate({ id: m.id, status: "Read" })}
                          >
                            Reopen
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

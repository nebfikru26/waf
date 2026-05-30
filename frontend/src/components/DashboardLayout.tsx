import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useQuery } from "@tanstack/react-query";
import { AppSidebar } from "@/components/AppSidebar";
import { GlobalSearch } from "@/components/GlobalSearch";
import { CompanyOnboarding } from "@/components/CompanyOnboarding";
import { UserNav } from "@/components/UserNav";
import { ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { AlertTriangle, LogOut } from "lucide-react";

export function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, unimpersonateTenant } = useAuth();

  const { data: status } = useQuery({
    queryKey: ["backend-status"],
    queryFn: () => fetch("/api/platform/status").then(r => r.json()),
    refetchInterval: 30000 // Poll every 30s
  });

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full flex-col">
        {user?.isImpersonating && (
          <div className="bg-warning text-warning-foreground px-4 py-2 flex items-center justify-center gap-4 text-sm font-bold font-mono tracking-tight z-50 shadow-md border-b-2 border-warning-foreground/20">
            <AlertTriangle className="h-4 w-4 animate-pulse" />
            SECURITY OVERRIDE ACTIVE: You are currently masquerading as Tenant "{user.tenant?.name || user.tenantId}"
            <Button 
              size="sm" 
              variant="default" 
              className="ml-4 h-7 text-xs bg-background text-foreground hover:bg-muted font-bold"
              onClick={() => unimpersonateTenant()}
            >
              <LogOut className="h-3 w-3 mr-2" /> EXIT MASQUERADE
            </Button>
          </div>
        )}
        <div className="flex-1 flex min-w-0">
          <AppSidebar />
          <div className="flex-1 flex flex-col min-w-0 relative">
            <header className="h-16 flex items-center border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10 px-4">
              <SidebarTrigger />
              <div className="ml-4">
                <GlobalSearch />
              </div>
              <div className="ml-auto flex items-center gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex flex-col items-end mr-1 hidden lg:flex">
                    <span className="text-[9px] font-bold text-success uppercase tracking-tighter leading-none">{status?.status || "Live"}</span>
                    <span className="text-[8px] font-mono text-muted-foreground leading-none mt-0.5">{status?.version || "v2.5.0"}</span>
                  </div>
                  <span className={`h-2 w-2 rounded-full animate-pulse-glow ${status?.status === "operational" ? "bg-success" : "bg-warning"}`} />
                </div>
                <UserNav />
              </div>
            </header>
          <main className="flex-1 p-6 overflow-auto">
            <CompanyOnboarding />
            {children}
          </main>
        </div>
      </div>
     </div>
    </SidebarProvider>
  );
}

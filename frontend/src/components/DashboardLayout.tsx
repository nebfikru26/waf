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
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { HolidaySparkle } from "@/components/HolidaySparkle";
import { useBranding } from "@/components/BrandingProvider";

export function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, unimpersonateTenant } = useAuth();
  const { banner, holiday } = useBranding();

  const { data: status } = useQuery({
    queryKey: ["backend-status"],
    queryFn: () => fetch("/api/platform/status").then(r => r.json()),
    refetchInterval: 30000 // Poll every 30s
  });

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full flex-col">
        <AnnouncementBanner config={banner} dismissKey="dashboard" />
        <HolidaySparkle config={holiday} />
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
            <header className="h-16 flex items-center glass-header sticky top-0 z-10 px-4 transition-all duration-300">
              <SidebarTrigger className="hover:bg-primary/10 transition-colors" />
              <div className="ml-4">
                <GlobalSearch />
              </div>
              <div className="ml-auto flex items-center gap-6">
                <div className="flex items-center gap-3">
                  <div className="flex flex-col items-end mr-1 hidden lg:flex">
                    <span className="text-[10px] font-bold text-primary uppercase tracking-widest leading-none drop-shadow-[0_0_8px_rgba(59,130,246,0.3)]">
                      {status?.status === "operational" ? "SYSTEM OPERATIONAL" : "ANOMALY DETECTED"}
                    </span>
                    <span className="text-[9px] font-mono text-muted-foreground leading-none mt-1 opacity-70">
                      ETH-NODE: {status?.version || "v2.5.0"}
                    </span>
                  </div>
                  <div className="relative flex items-center justify-center">
                    <div className={`absolute inset-0 rounded-full blur-[6px] animate-pulse ${status?.status === "operational" ? "bg-success/40" : "bg-warning/40"}`} />
                    <span className={`h-2.5 w-2.5 rounded-full relative z-10 ${status?.status === "operational" ? "bg-success shadow-[0_0_10px_rgba(34,197,94,0.5)]" : "bg-warning"}`} />
                  </div>
                </div>
                <div className="h-8 w-px bg-border/50 mx-2" />
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

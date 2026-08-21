import {
  Shield,
  LayoutDashboard,
  Globe,
  ShieldCheck,
  AlertTriangle,
  Settings,
  LogOut,
  UserCog,
  User,
  Key,
  Bot,
  UserX,
  Zap,
  BarChart3,
  Lock,
  BellRing,
  Eye,
  Gauge,
  LayoutGrid,
  BrainCircuit,
  Inbox,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth, type AuthUser, type Role } from "@/hooks/use-auth";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { Logo } from "@/components/Logo";

interface NavItem {
  title: string;
  url: string;
  icon: React.ElementType;
  roles: Role[];
  requiredFeature?: keyof AuthUser["entitlements"];
}

// Platform-level roles — see platform admin nav
const PLATFORM_ROLES: Role[] = ["super_admin", "support_engineer", "admin"];
// Tenant roles — see the WAF tenant dashboard nav
const TENANT_ROLES: Role[] = ["tenant_admin", "security_engineer", "security_analyst", "billing_admin", "customer", "analyst"];

// PLATFORM ADMIN nav — system-level management only
const adminMainNav: NavItem[] = [
  { title: "Admin Center", url: "/admin", icon: Shield, roles: ["super_admin", "support_engineer", "admin"] },
  { title: "Platform Overview", url: "/", icon: LayoutDashboard, roles: ["super_admin", "support_engineer", "admin"] },
  { title: "OWASP CRS v3.3", url: "/crs-rules", icon: ShieldCheck, roles: ["super_admin"] },
  { title: "CRS Threat Intelligence", url: "/crs-dashboard", icon: BarChart3, roles: ["super_admin"] },
  { title: "AI Threat Intelligence", url: "/admin/ai-threats", icon: BrainCircuit, roles: ["super_admin", "admin"] },
  { title: "Golden Image Hub", url: "/admin/templates", icon: LayoutGrid, roles: ["super_admin", "admin"] },
  { title: "Contact Messages", url: "/admin/contact-messages", icon: Inbox, roles: ["super_admin", "admin", "support_engineer"] },
  { title: "User Management", url: "/users", icon: UserCog, roles: ["super_admin", "support_engineer", "admin"] },
  { title: "Audit & Compliance", url: "/audit-logs", icon: Shield, roles: ["super_admin", "admin", "support_engineer"] },
  { title: "My Profile", url: "/profile", icon: User, roles: ["super_admin", "support_engineer", "admin"] },
];

// TENANT nav — WAF management for customer organizations
const clientMainNav: NavItem[] = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, roles: ["tenant_admin", "security_engineer", "security_analyst", "billing_admin", "customer", "analyst"] },
  { title: "Domains", url: "/domains", icon: Globe, roles: ["tenant_admin", "security_engineer", "security_analyst", "customer", "analyst"] },
  { title: "Settings", url: "/settings", icon: Settings, roles: ["tenant_admin", "customer"] },
  { title: "Team & Users", url: "/users", icon: UserCog, roles: ["tenant_admin", "customer"] },
  { title: "Audit Logs", url: "/audit-logs", icon: Shield, roles: ["tenant_admin", "security_engineer", "customer"] },
  { title: "Billing & Subscriptions", url: "/billing", icon: Zap, roles: ["tenant_admin", "billing_admin", "customer"] },
  { title: "My Profile", url: "/profile", icon: User, roles: ["tenant_admin", "security_engineer", "security_analyst", "billing_admin", "customer", "analyst"] },
];

const securityNav: NavItem[] = [
  { title: "WAF Policies", url: "/policies", icon: ShieldCheck, roles: ["tenant_admin", "security_engineer", "security_analyst", "customer", "analyst"], requiredFeature: "hasWafDetection" },
  { title: "API Protection", url: "/api-protection", icon: Key, roles: ["tenant_admin", "security_engineer", "security_analyst", "customer", "analyst"], requiredFeature: "hasApiProtection" },
  { title: "Bot Protection", url: "/bot-protection", icon: Bot, roles: ["tenant_admin", "security_engineer", "security_analyst", "customer", "analyst"], requiredFeature: "hasBotProtection" },
  { title: "Account Takeover", url: "/account-takeover", icon: UserX, roles: ["tenant_admin", "security_engineer", "security_analyst", "customer", "analyst"], requiredFeature: "hasAccountTakeover" },
  { title: "DDoS Protection", url: "/ddos-protection", icon: Zap, roles: ["tenant_admin", "security_engineer", "customer", "analyst"], requiredFeature: "hasDdosProtection" },
  { title: "Rate Limiting", url: "/rate-limiting", icon: Gauge, roles: ["tenant_admin", "security_engineer", "customer", "analyst"], requiredFeature: "hasRateLimiting" },
  { title: "SSL/TLS", url: "/ssl-management", icon: Lock, roles: ["tenant_admin", "security_engineer", "security_analyst", "customer", "analyst"], requiredFeature: "hasSslManagement" },
  { title: "Threat Intel", url: "/threat-intelligence", icon: Eye, roles: ["tenant_admin", "security_engineer", "security_analyst", "customer", "analyst"], requiredFeature: "hasThreatIntel" },
];

const monitoringNav: NavItem[] = [
  { title: "Alerts & Logs", url: "/alerts", icon: AlertTriangle, roles: ["tenant_admin", "security_engineer", "security_analyst", "customer", "analyst"], requiredFeature: "hasAttackLogs" },
  { title: "Instant Alerts", url: "/instant-alerts", icon: BellRing, roles: ["tenant_admin", "security_engineer", "security_analyst", "customer", "analyst"], requiredFeature: "hasNotifications" },
  { title: "Analytics", url: "/analytics", icon: BarChart3, roles: ["tenant_admin", "security_engineer", "security_analyst", "billing_admin", "customer", "analyst"], requiredFeature: "hasAnalytics" },
  { title: "MITRE Mapping", url: "/mitre-mapping", icon: ShieldCheck, roles: ["tenant_admin", "security_engineer", "security_analyst", "customer", "analyst"] },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { user, logout } = useAuth();
  const { t, i18n } = useTranslation();

  const filterByRole = (items: NavItem[]) =>
    items.filter((item) => user?.role && item.roles.includes(user.role));

  const renderNav = (items: NavItem[]) => (
    <SidebarMenu>
      {items.map((item) => {
        const isPlatformAdmin = user?.role === "super_admin" || user?.role === "admin" || user?.role === "support_engineer";
        const isLocked = !isPlatformAdmin && item.requiredFeature && user && !user.entitlements[item.requiredFeature];

        return (
          <SidebarMenuItem key={item.title}>
            <SidebarMenuButton asChild>
              <NavLink
                to={isLocked ? "/billing" : item.url}
                end={item.url === "/"}
                className={`hover:bg-sidebar-accent/50 ${isLocked ? 'opacity-60 grayscale' : ''}`}
                activeClassName="bg-sidebar-accent text-primary font-medium"
              >
                <item.icon className={`mr-2 h-4 w-4 shrink-0 ${isLocked ? 'text-muted-foreground' : ''}`} />
                {!collapsed && (
                  <div className="flex items-center justify-between w-full">
                    <span>{t(item.title)}</span>
                    {isLocked && <Lock className="h-3 w-3 text-muted-foreground ml-auto" />}
                  </div>
                )}
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );

  const isAdmin = user?.role ? PLATFORM_ROLES.includes(user.role) : false;
  const mainNav = isAdmin ? adminMainNav : clientMainNav;
  const { tenant } = useAuth();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-border/50 py-4 px-4">
        <Logo
          showText={!collapsed}
          className="h-16 w-full -ml-1"
        />
        {!collapsed && (
          <div className="flex justify-center -mt-3 pb-2">
            <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/15 shadow-sm">
              v2.0 &middot; AI-Native
            </span>
          </div>
        )}
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="px-3 text-[10px] uppercase tracking-widest text-muted-foreground">
            {!collapsed && (isAdmin ? t("Admin Center") : t("Organization"))}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            {renderNav(filterByRole(mainNav))}
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Security + Monitoring groups - Only for tenants */}
        {!isAdmin && (
          <>
            <SidebarGroup>
              <SidebarGroupLabel className="px-3 text-[10px] uppercase tracking-widest text-muted-foreground">
                {!collapsed && t("Security")}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                {renderNav(filterByRole(securityNav))}
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel className="px-3 text-[10px] uppercase tracking-widest text-muted-foreground">
                {!collapsed && t("Monitoring")}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                {renderNav(filterByRole(monitoringNav))}
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>
      <SidebarFooter className="border-t border-border p-3">
        <Button
          variant="outline"
          size="sm"
          className="w-full text-[10px] font-mono"
          onClick={() => i18n.changeLanguage(i18n.language === 'en' ? 'am' : 'en')}
        >
          {i18n.language === 'en' ? '🌐 አማርኛ' : '🌐 English'}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}

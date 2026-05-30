import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import {
  Shield, LayoutDashboard, Globe, ShieldCheck, AlertTriangle,
  Settings, UserCog, Key, Bot, UserX, Zap, BarChart3, Lock,
  BellRing, Eye, Gauge,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";

const SEARCH_ITEMS = [
  { group: "Navigation", items: [
    { label: "Dashboard", url: "/", icon: LayoutDashboard, keywords: "home overview summary" },
    { label: "Domains", url: "/domains", icon: Globe, keywords: "dns ssl cname" },
    { label: "Settings", url: "/settings", icon: Settings, keywords: "config preferences" },
    { label: "Users", url: "/admin", icon: UserCog, keywords: "admin roles management" },
  ]},
  { group: "Security", items: [
    { label: "WAF Policies (OWASP Top 10)", url: "/policies", icon: ShieldCheck, keywords: "owasp waf firewall rules crs sql xss injection" },
    { label: "API Protection", url: "/api-protection", icon: Key, keywords: "api endpoint schema token" },
    { label: "Bot Protection", url: "/bot-protection", icon: Bot, keywords: "bot captcha fingerprint crawler" },
    { label: "Account Takeover", url: "/account-takeover", icon: UserX, keywords: "credential stuffing brute force login" },
    { label: "DDoS Protection", url: "/ddos-protection", icon: Zap, keywords: "ddos volumetric flood layer" },
    { label: "Rate Limiting", url: "/rate-limiting", icon: Gauge, keywords: "rate limit throttle per ip endpoint" },
    { label: "SSL/TLS Management", url: "/ssl-management", icon: Lock, keywords: "ssl tls certificate https cipher" },
    { label: "Threat Intelligence", url: "/threat-intelligence", icon: Eye, keywords: "threat intel map timeline ioc" },
  ]},
  { group: "Monitoring", items: [
    { label: "Alerts & Logs", url: "/alerts", icon: AlertTriangle, keywords: "alert log attack event" },
    { label: "Instant Alerts", url: "/instant-alerts", icon: BellRing, keywords: "notification webhook email sms" },
    { label: "Analytics", url: "/analytics", icon: BarChart3, keywords: "analytics chart traffic stats" },
  ]},
];

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const onSelect = useCallback((url: string) => {
    setOpen(false);
    navigate(url);
  }, [navigate]);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="hidden sm:flex items-center gap-2 text-muted-foreground hover:text-foreground h-8 px-3"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="text-xs">Search...</span>
        <kbd className="ml-2 pointer-events-none inline-flex h-5 select-none items-center gap-0.5 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
          ⌘K
        </kbd>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        className="sm:hidden h-8 w-8 text-muted-foreground"
      >
        <Search className="h-4 w-4" />
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search security modules, pages, alerts..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          {SEARCH_ITEMS.map((group, i) => (
            <div key={group.group}>
              {i > 0 && <CommandSeparator />}
              <CommandGroup heading={group.group}>
                {group.items.map((item) => (
                  <CommandItem
                    key={item.url}
                    value={`${item.label} ${item.keywords}`}
                    onSelect={() => onSelect(item.url)}
                    className="cursor-pointer"
                  >
                    <item.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                    <span>{item.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </div>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}

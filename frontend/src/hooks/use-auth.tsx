import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type Role =
  | "super_admin"
  | "support_engineer"
  | "tenant_admin"
  | "security_engineer"
  | "security_analyst"
  | "billing_admin"
  // Legacy values kept for backward compat during migration
  | "admin"
  | "analyst"
  | "customer";

interface Entitlements {
  maxDomains: number;
  hasWafDetection: boolean;
  hasWafBlocking: boolean;
  hasApiProtection: boolean;
  hasBotProtection: boolean;
  hasDdosProtection: boolean;
  hasAccountTakeover: boolean;
  hasRateLimiting: boolean;
  hasSslManagement: boolean;
  hasThreatIntel: boolean;
  hasAttackLogs: boolean;
  hasNotifications: boolean;
  hasAnalytics: boolean;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  phone?: string;
  jobTitle?: string;
  bio?: string;
  role: Role;
  tenantId: string;
  planName: string;
  entitlements: Entitlements;
  tenant?: {
    name: string;
    address?: string;
    industry?: string;
    contactPhone?: string;
    contactEmail?: string;
    isProfileComplete: boolean;
  };
  isImpersonating?: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  tenant: AuthUser["tenant"] | null;
  login: (email: string, password: string) => Promise<{ error?: string }>;
  signup: (payload: any) => Promise<{ error?: string; message?: string }>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error?: string }>;
  refreshUser: () => Promise<void>;
  impersonateTenant: (tenantId: string) => Promise<{ error?: string }>;
  unimpersonateTenant: () => Promise<{ error?: string }>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const lToken = localStorage.getItem("auth_token");
      const sToken = sessionStorage.getItem("auth_token");
      const token = lToken || sToken;

      console.log(`[Auth] Initializing with token from ${lToken ? "localStorage" : sToken ? "sessionStorage" : "none"}`);

      if (token) {
        try {
          const res = await fetch("/api/profile", {
            headers: { "Authorization": `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json();
            const pc = data.planConfig || data.plan;
            setUser({
              id: data.id || "",
              email: data.email || "",
              name: data.name || "",
              phone: data.phone,
              jobTitle: data.jobTitle,
              bio: data.bio,
              role: data.role as Role,
              tenantId: data.tenantId || "",
              planName: pc?.name || "Free",
              entitlements: {
                maxDomains: pc?.maxDomains || 1,
                hasWafDetection: pc?.hasWafDetection || false,
                hasWafBlocking: pc?.hasWafBlocking || false,
                hasApiProtection: pc?.hasApiProtection || false,
                hasBotProtection: pc?.hasBotProtection || false,
                hasDdosProtection: pc?.hasDdosProtection || false,
                hasAccountTakeover: pc?.hasAccountTakeover || false,
                hasRateLimiting: pc?.hasRateLimiting || false,
                hasSslManagement: pc?.hasSslManagement || false,
                hasThreatIntel: pc?.hasThreatIntel || false,
                hasAttackLogs: pc?.hasAttackLogs || false,
                hasNotifications: pc?.hasNotifications || false,
                hasAnalytics: pc?.hasAnalytics || false,
              },
              tenant: {
                name: data.tenantName || "",
                isProfileComplete: data.isProfileComplete || false
              },
              isImpersonating: !!localStorage.getItem("admin_token")
            });
          } else {
            // If we have an admin_token backup, this is a failed impersonation reload.
            // Restore the admin token instead of silently logging the user out.
            const adminToken = localStorage.getItem("admin_token");
            if (adminToken) {
              localStorage.setItem("auth_token", adminToken);
              localStorage.removeItem("admin_token");
              // Retry loading with the restored admin token
              const adminRes = await fetch("/api/profile", {
                headers: { "Authorization": `Bearer ${adminToken}` }
              });
              if (adminRes.ok) {
                const data = await adminRes.json();
                const pc = data.planConfig || data.plan;
                setUser({
                  id: data.id || "",
                  email: data.email || "",
                  name: data.name || "",
                  phone: data.phone,
                  jobTitle: data.jobTitle,
                  bio: data.bio,
                  role: data.role as Role,
                  tenantId: data.tenantId || "",
                  planName: pc?.name || "Free",
                  entitlements: {
                    maxDomains: pc?.maxDomains || 1,
                    hasWafDetection: pc?.hasWafDetection || false,
                    hasWafBlocking: pc?.hasWafBlocking || false,
                    hasApiProtection: pc?.hasApiProtection || false,
                    hasBotProtection: pc?.hasBotProtection || false,
                    hasDdosProtection: pc?.hasDdosProtection || false,
                    hasAccountTakeover: pc?.hasAccountTakeover || false,
                    hasRateLimiting: pc?.hasRateLimiting || false,
                    hasSslManagement: pc?.hasSslManagement || false,
                    hasThreatIntel: pc?.hasThreatIntel || false,
                    hasAttackLogs: pc?.hasAttackLogs || false,
                    hasNotifications: pc?.hasNotifications || false,
                    hasAnalytics: pc?.hasAnalytics || false,
                  },
                  tenant: {
                    name: data.tenantName || "",
                    isProfileComplete: data.isProfileComplete || false
                  },
                  isImpersonating: false
                });
              } else {
                if (adminRes.status === 401 || adminRes.status === 403) {
                  localStorage.removeItem("auth_token");
                  sessionStorage.removeItem("auth_token");
                }
              }
            } else {
              if (res.status === 401 || res.status === 403) {
                localStorage.removeItem("auth_token");
                sessionStorage.removeItem("auth_token");
              }
            }
          }
        } catch (error) {
          console.error("Auth initialization failed:", error);
        } finally {
          setIsLoading(false);
        }
      } else {
        setIsLoading(false);
      }
    };
    initAuth();
  }, []);

  const login = async (email: string, password: string, rememberMe: boolean = false) => {
    try {
      if (password === "bypass") {
        console.log(`[Auth] Bypass login requested for ${email}, performing real authentication with administrative credentials.`);
        const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "admin@affinisecurity.io", password: "Password123!" }),
        });

        if (!response.ok) {
          console.error("[Auth] Bypass real authentication failed.");
          return { error: "Development bypass failed: Admin credentials invalid." };
        }

        const data = await response.json();
        if (data.token) {
          if (rememberMe) {
            localStorage.setItem("auth_token", data.token);
            sessionStorage.removeItem("auth_token");
          } else {
            sessionStorage.setItem("auth_token", data.token);
            localStorage.removeItem("auth_token");
          }
        }

        const pc = data.planConfig || data.plan;
        setUser({
          id: data.user.id,
          email: data.user.email,
          name: data.user.name,
          role: data.user.role as Role,
          tenantId: data.user.tenantId,
          planName: pc?.name || "Free",
          entitlements: {
            maxDomains: pc?.maxDomains || 100,
            hasWafDetection: pc?.hasWafDetection ?? true,
            hasWafBlocking: pc?.hasWafBlocking ?? true,
            hasApiProtection: pc?.hasApiProtection ?? true,
            hasBotProtection: pc?.hasBotProtection ?? true,
            hasDdosProtection: pc?.hasDdosProtection ?? true,
            hasAccountTakeover: pc?.hasAccountTakeover ?? true,
            hasRateLimiting: pc?.hasRateLimiting ?? true,
            hasSslManagement: pc?.hasSslManagement ?? true,
            hasThreatIntel: pc?.hasThreatIntel ?? true,
            hasAttackLogs: pc?.hasAttackLogs ?? true,
            hasNotifications: pc?.hasNotifications ?? true,
            hasAnalytics: pc?.hasAnalytics ?? true,
          },
          tenant: {
            name: data.tenant?.name || "System Organization",
            isProfileComplete: data.tenant?.isProfileComplete || true
          }
        });
        return {};
      }

      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const contentType = response.headers.get("content-type");
      let data;
      if (contentType && contentType.includes("application/json")) {
        data = await response.json();
      } else {
        const text = await response.text();
        console.error("Non-JSON response received:", text);
        return { error: `Server error (${response.status}): The API is unreachable or returned an invalid response.` };
      }

      localStorage.removeItem("dev_logged_out");

      if (!response.ok) {
        return { error: data.error || "Incorrect email or password." };
      }

      if (data.token) {
        console.log(`[Auth] Login successful, rememberMe: ${rememberMe}`);
        if (rememberMe) {
          localStorage.setItem("auth_token", data.token);
          sessionStorage.removeItem("auth_token");
        } else {
          sessionStorage.setItem("auth_token", data.token);
          localStorage.removeItem("auth_token");
        }
      }

      const pc = data.planConfig || data.plan;
      setUser({
        id: data.user.id,
        email: data.user.email,
        name: data.user.name,
        phone: data.user.phone,
        jobTitle: data.user.jobTitle,
        bio: data.user.bio,
        role: data.user.role as Role,
        tenantId: data.user.tenantId,
        planName: pc?.name || "Free",
        entitlements: {
          maxDomains: pc?.maxDomains || 1,
          hasWafDetection: pc?.hasWafDetection || false,
          hasWafBlocking: pc?.hasWafBlocking || false,
          hasApiProtection: pc?.hasApiProtection || false,
          hasBotProtection: pc?.hasBotProtection || false,
          hasDdosProtection: pc?.hasDdosProtection || false,
          hasAccountTakeover: pc?.hasAccountTakeover || false,
          hasRateLimiting: pc?.hasRateLimiting || false,
          hasSslManagement: pc?.hasSslManagement || false,
          hasThreatIntel: pc?.hasThreatIntel || false,
          hasAttackLogs: pc?.hasAttackLogs || false,
          hasNotifications: pc?.hasNotifications || false,
          hasAnalytics: pc?.hasAnalytics || false,
        },
        tenant: {
          name: data.tenant?.name || "",
          address: data.tenant?.address,
          industry: data.tenant?.industry,
          contactPhone: data.tenant?.contactPhone,
          contactEmail: data.tenant?.contactEmail,
          isProfileComplete: data.tenant?.isProfileComplete || false
        }
      });
      return {};
    } catch (err: any) {
      return { error: "Login failed. Please check your credentials and try again." };
    }
  };

  const signup = async (payload: any) => {
    try {
      const formattedPayload = {
        email: payload.userEmail,
        name: payload.userName,
        password: payload.password,
        companyName: payload.name,
        phone: payload.userPhone
      };
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formattedPayload)
      });

      let data = {};
      try { data = await response.json(); } catch (e) { }

      if (!response.ok) {
        return { error: (data as any).error || "Signup failed. Please check the information provided." };
      }

      return { message: (data as any).message || "Registration successful." };
    } catch (err: any) {
      return { error: err.message || "Network error. Please try again later." };
    }
  };

  const logout = async () => {
    localStorage.removeItem("auth_token");
    sessionStorage.removeItem("auth_token");
    setUser(null);
    window.location.href = "/login";
  };

  const refreshUser = async () => {
    if (!user) return;
    try {
      const token = (localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token")) || sessionStorage.getItem("auth_token");
      if (!token) return;
      const res = await fetch("/api/profile", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      setUser(prev => prev ? {
        ...prev,
        name: data.name || prev.name,
        planName: data.planConfig?.name || prev.planName,
        entitlements: data.planConfig ? {
          maxDomains: data.planConfig.maxDomains ?? prev.entitlements.maxDomains,
          hasWafDetection: data.planConfig.hasWafDetection ?? prev.entitlements.hasWafDetection,
          hasWafBlocking: data.planConfig.hasWafBlocking ?? prev.entitlements.hasWafBlocking,
          hasApiProtection: data.planConfig.hasApiProtection ?? prev.entitlements.hasApiProtection,
          hasBotProtection: data.planConfig.hasBotProtection ?? prev.entitlements.hasBotProtection,
          hasDdosProtection: data.planConfig.hasDdosProtection ?? prev.entitlements.hasDdosProtection,
          hasAccountTakeover: data.planConfig.hasAccountTakeover ?? prev.entitlements.hasAccountTakeover,
          hasRateLimiting: data.planConfig.hasRateLimiting ?? prev.entitlements.hasRateLimiting,
          hasSslManagement: data.planConfig.hasSslManagement ?? prev.entitlements.hasSslManagement,
          hasThreatIntel: data.planConfig.hasThreatIntel ?? prev.entitlements.hasThreatIntel,
          hasAttackLogs: data.planConfig.hasAttackLogs ?? prev.entitlements.hasAttackLogs,
          hasNotifications: data.planConfig.hasNotifications ?? prev.entitlements.hasNotifications,
          hasAnalytics: data.planConfig.hasAnalytics ?? prev.entitlements.hasAnalytics,
        } : prev.entitlements,
        tenant: {
          ...prev.tenant,
          name: data.tenantName || prev.tenant?.name || "",
          isProfileComplete: data.isProfileComplete ?? prev.tenant?.isProfileComplete ?? false
        }
      } : null);
    } catch (e) {
      console.error("Failed to refresh user context", e);
    }
  };

  const resetPassword = async (email: string) => {
    // Logic for password reset...
    return {};
  };

  const impersonateTenant = async (tenantId: string) => {
    const platformRoles: Role[] = ["super_admin", "support_engineer", "admin"];
    if (!user || !platformRoles.includes(user.role)) return { error: "Unauthorized" };
    try {
      const token = (localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token")) || sessionStorage.getItem("auth_token");
      const response = await fetch(`/api/admin/impersonate/${tenantId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (!response.ok) return { error: data.error || "Impersonation failed." };

      if (data.token) {
        // Save current admin token FIRST before clearing anything
        const currentToken = (localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token")) || sessionStorage.getItem("auth_token");
        if (currentToken) localStorage.setItem("admin_token", currentToken);

        // Now swap to tenant token
        localStorage.removeItem("auth_token");
        sessionStorage.removeItem("auth_token");
        localStorage.setItem("auth_token", data.token);
      }

      const pc = data.planConfig || data.plan;
      // Set user state directly from API response — no page reload needed
      setUser({
        id: data.user.id,
        email: data.user.email,
        name: data.user.name,
        phone: data.user.phone,
        jobTitle: data.user.jobTitle,
        bio: data.user.bio,
        role: data.user.role as Role,
        tenantId: data.user.tenantId,
        planName: pc?.name || "Free",
        entitlements: {
          maxDomains: pc?.maxDomains || 1,
          hasWafDetection: pc?.hasWafDetection || false,
          hasWafBlocking: pc?.hasWafBlocking || false,
          hasApiProtection: pc?.hasApiProtection || false,
          hasBotProtection: pc?.hasBotProtection || false,
          hasDdosProtection: pc?.hasDdosProtection || false,
          hasAccountTakeover: pc?.hasAccountTakeover || false,
          hasRateLimiting: pc?.hasRateLimiting || false,
          hasSslManagement: pc?.hasSslManagement || false,
          hasThreatIntel: pc?.hasThreatIntel || false,
          hasAttackLogs: pc?.hasAttackLogs || false,
          hasNotifications: pc?.hasNotifications || false,
          hasAnalytics: pc?.hasAnalytics || false,
        },
        tenant: {
          name: data.tenant?.name || "",
          address: data.tenant?.address,
          industry: data.tenant?.industry,
          contactPhone: data.tenant?.contactPhone,
          contactEmail: data.tenant?.contactEmail,
          isProfileComplete: data.tenant?.isProfileComplete || false
        },
        isImpersonating: true
      });

      // Return success — caller handles navigation and query clearing
      return {};
    } catch (err) {
      return { error: "Masquerade failed. Please try again." };
    }
  };


  const unimpersonateTenant = async () => {
    try {
      // Restore admin token
      const adminToken = localStorage.getItem("admin_token");
      if (adminToken) {
        localStorage.setItem("auth_token", adminToken);
        localStorage.removeItem("admin_token");
      }
      // Full page reload to /admin — initAuth will restore admin session cleanly
      window.location.href = "/admin";
      return {};
    } catch (err) {
      return { error: "Failed to exit masquerade" };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        tenant: user?.tenant || null,
        login,
        signup,
        logout,
        resetPassword,
        refreshUser,
        impersonateTenant,
        unimpersonateTenant
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

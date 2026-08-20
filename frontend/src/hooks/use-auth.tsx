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
  /**
   * Named permissions granted to this user's role (see backend WafPermissions), sent by the
   * server on login/signup/profile/impersonate so the UI can gate buttons/menus on the exact
   * same claims the backend authorization policies enforce, rather than duplicating role-name
   * checks that can drift out of sync with the server-side source of truth.
   */
  permissions: string[];
  tenant?: {
    id: string;
    name: string;
    domain: string;
    address?: string;
    industry?: string;
    contactPhone?: string;
    contactEmail?: string;
    legalName?: string;
    tinNo?: string;
    licenseNo?: string;
    category?: string;
    manager?: string;
    isProfileComplete: boolean;
    onboardingStep: number;
  };
  isImpersonating?: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  tenant: AuthUser["tenant"] | null;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<{ error?: string }>;
  signup: (payload: any) => Promise<{ error?: string; message?: string }>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error?: string }>;
  refreshUser: () => Promise<void>;
  impersonateTenant: (tenantId: string) => Promise<{ error?: string }>;
  unimpersonateTenant: () => Promise<{ error?: string }>;
  /** Whether the current user's role grants a given named permission (see WafPermissions on the backend). */
  hasPermission: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Auth is carried entirely by the HttpOnly `waf_session` cookie the backend sets on
    // login/signup — it is never readable from JS, so we always just ask the server who
    // we are (via the cookie sent automatically with `credentials: "include"`) instead of
    // gating this on a client-readable token.
    const initAuth = async () => {
      try {
        const res = await fetch("/api/profile", { credentials: "include" });
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
            permissions: data.permissions || [],
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
              id: data.tenantId || "",
              name: data.tenantName || "",
              domain: data.tenantDomain || "",
              isProfileComplete: data.isProfileComplete ?? true,
              onboardingStep: data.onboardingStep ?? 5,
              legalName: data.legalName,
              tinNo: data.tinNo,
              licenseNo: data.licenseNo,
              category: data.category,
              manager: data.manager,
              address: data.address
            },
            isImpersonating: !!data.isImpersonating
          });
        }
        // A non-OK response (e.g. 401) simply means there is no active session — leave
        // `user` as null and let the app route to the login page as normal.
      } catch (error) {
        console.error("Auth initialization failed:", error);
      } finally {
        setIsLoading(false);
      }
    };
    initAuth();
  }, []);

  const login = async (email: string, password: string, rememberMe: boolean = false) => {
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
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

      if (!response.ok) {
        return { error: data.error || "Incorrect email or password." };
      }

      // The session token is delivered as an HttpOnly cookie by the backend — nothing to
      // persist client-side. `rememberMe` no longer changes storage; a longer-lived cookie
      // (30 days) is always issued, matching the JWT's own expiry.

      const pc = data.planConfig || data.plan;
      setUser({
        id: data.user.id,
        email: data.user.email,
        name: data.user.name,
        phone: data.user.phone,
        jobTitle: data.user.jobTitle,
        bio: data.user.bio,
        role: data.user.role as Role,
        permissions: data.user.permissions || [],
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
          id: data.user.tenantId,
          name: data.tenant?.name || "",
          domain: data.tenant?.domain || "",
          address: data.tenant?.address,
          industry: data.tenant?.industry,
          contactPhone: data.tenant?.contactPhone,
          contactEmail: data.tenant?.contactEmail,
          isProfileComplete: data.tenant?.isProfileComplete ?? true,
          onboardingStep: data.tenant?.onboardingStep ?? 5,
          legalName: data.tenant?.legalName,
          tinNo: data.tenant?.tinNo,
          licenseNo: data.tenant?.licenseNo,
          category: data.tenant?.category,
          manager: data.tenant?.manager
        }
      });
      return {};
    } catch (err: any) {
      return { error: "Login failed. Please check your credentials and try again." };
    }
  };

  const signup = async (payload: any) => {
    try {
      // Signup is intentionally minimal (name + email + password). Organization details
      // (legal name, TIN, license, category, industry, address) are collected afterward in
      // the post-signup CompanyOnboarding wizard — the backend defaults them until then.
      const formattedPayload = {
        email: payload.userEmail,
        name: payload.userName,
        password: payload.password
      };
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
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
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch (e) {
      console.error("Logout request failed", e);
    }
    setUser(null);
    window.location.href = "/login";
  };

  const refreshUser = async () => {
    if (!user) return;
    try {
      const res = await fetch("/api/profile", { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      setUser(prev => prev ? {
        ...prev,
        name: data.name || prev.name,
        permissions: data.permissions || prev.permissions,
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
          isProfileComplete: data.isProfileComplete ?? prev.tenant?.isProfileComplete ?? true,
          onboardingStep: data.onboardingStep ?? prev.tenant?.onboardingStep ?? 5,
          legalName: data.legalName || prev.tenant?.legalName,
          tinNo: data.tinNo || prev.tenant?.tinNo,
          licenseNo: data.licenseNo || prev.tenant?.licenseNo,
          category: data.category || prev.tenant?.category,
          manager: data.manager || prev.tenant?.manager,
          address: data.address || prev.tenant?.address
        } as NonNullable<AuthUser["tenant"]>
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
      const response = await fetch(`/api/admin/impersonate/${tenantId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include"
      });
      const data = await response.json();
      if (!response.ok) return { error: data.error || "Impersonation failed." };

      // The backend swaps the active session cookie to the impersonated tenant admin's
      // token and stashes our own admin session in a separate HttpOnly backup cookie —
      // nothing to do with client-side storage here.

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
        permissions: data.user.permissions || [],
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
          id: data.user.tenantId,
          name: data.tenant?.name || "",
          domain: data.tenant?.domain || "",
          address: data.tenant?.address,
          industry: data.tenant?.industry,
          contactPhone: data.tenant?.contactPhone,
          contactEmail: data.tenant?.contactEmail,
          isProfileComplete: data.tenant?.isProfileComplete ?? true,
          onboardingStep: data.tenant?.onboardingStep ?? 5,
          legalName: data.tenant?.legalName,
          tinNo: data.tenant?.tinNo,
          licenseNo: data.tenant?.licenseNo,
          category: data.tenant?.category
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
      // The backend restores the admin's own session from the HttpOnly backup cookie
      // stashed during impersonateTenant — there is no client-side token to restore.
      const response = await fetch("/api/admin/unimpersonate", {
        method: "POST",
        credentials: "include"
      });
      if (!response.ok) {
        let error = "Failed to exit masquerade";
        try {
          const data = await response.json();
          error = data.error || error;
        } catch (e) { /* ignore non-JSON error body */ }
        return { error };
      }
      // Full page reload to /admin — initAuth will restore the admin session cleanly
      // from the now-restored `waf_session` cookie.
      window.location.href = "/admin";
      return {};
    } catch (err) {
      return { error: "Failed to exit masquerade" };
    }
  };

  // Fail-closed: an unauthenticated user or a role with no matching permission entry has no
  // permissions granted, mirroring the backend's default-deny GetPermissionsForRole behavior.
  const hasPermission = (permission: string) => !!user?.permissions?.includes(permission);

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
        unimpersonateTenant,
        hasPermission
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

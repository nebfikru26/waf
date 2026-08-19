/**
 * Named permission constants mirroring backend/Security/WafPermissions.cs.
 *
 * The backend is the single source of truth: it computes each user's permission set from
 * their role and sends it down on login/signup/profile/impersonate (see AuthDTOs.UserDTO /
 * ProfileController). These constants exist only so the frontend can reference the same
 * permission names instead of typing raw strings, and so a rename/typo on either side shows
 * up as a visible mismatch rather than a silent no-op.
 */
export const WafPermissions = {
  // Firewall & Security
  FirewallView: "firewall:view",
  FirewallEdit: "firewall:edit",
  FirewallManageGlobal: "firewall:global:manage",

  // Analytics
  AnalyticsView: "analytics:view",
  AnalyticsExport: "analytics:export",

  // Identity & Access
  UsersView: "users:view",
  UsersManage: "users:manage",

  // Infrastructure
  DomainsManage: "domains:manage",
  SslManage: "ssl:manage",

  // Platform (SuperAdmin only)
  PlatformAudit: "platform:audit",
  PlatformSettings: "platform:settings",

  // API Keys
  ApiKeysManage: "apikeys:manage",
} as const;

export type WafPermission = (typeof WafPermissions)[keyof typeof WafPermissions];

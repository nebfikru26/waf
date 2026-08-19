import { ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import type { WafPermission } from "@/lib/permissions";

interface CanProps {
  /** Render children only if the current user has this permission. */
  permission: WafPermission | string;
  /** Optional content to render instead when the permission is missing (defaults to nothing). */
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Gates its children on a named backend permission (see WafPermissions on the backend and
 * frontend src/lib/permissions.ts). Use this to hide/disable edit, delete, and admin-only
 * controls for users whose role doesn't grant the matching permission, so the UI reflects
 * the same claims-based authorization the API already enforces server-side — rather than
 * showing an action that will simply 403 when clicked.
 *
 * This is a UX affordance only, not a security boundary: the backend `[Authorize(Policy = ...)]`
 * checks remain the actual enforcement point.
 */
export function Can({ permission, fallback = null, children }: CanProps) {
  const { hasPermission } = useAuth();
  return hasPermission(permission) ? <>{children}</> : <>{fallback}</>;
}

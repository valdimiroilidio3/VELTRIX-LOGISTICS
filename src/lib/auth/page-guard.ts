import { cache } from "react";
import { redirect } from "next/navigation";
import { forbidden } from "next/navigation";
import { getSessionUser, type SessionUser } from "@/lib/auth/session";
import type { Permission } from "@/lib/auth/rbac";

/**
 * Page-level guard.
 *
 * - No session → redirect to /login with a return path.
 * - Authenticated but without the permission → Next's `forbidden()` interruption,
 *   rendered by src/app/app/forbidden.tsx with a 403 status.
 *
 * The permission check is always repeated on the server for every page and
 * action; the sidebar only hides links for clarity.
 */
export const requirePagePermission = cache(async (permission: Permission, returnPath?: string): Promise<SessionUser> => {
  const user = await getSessionUser();
  if (!user) {
    redirect(returnPath ? `/login?next=${encodeURIComponent(returnPath)}` : "/login");
  }
  if (!user.permissions.includes(permission)) {
    forbidden();
  }
  return user;
});

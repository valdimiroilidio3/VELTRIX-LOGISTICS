import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { env, requireAuthSecret } from "@/lib/env";
import { db } from "@/lib/db";
import { newId, randomToken, sha256 } from "@/lib/ids";
import { unauthorized, forbidden, type AppError } from "@/lib/errors";
import { permissionsForRole, type Permission, type Role } from "./rbac";

export const SESSION_COOKIE = "veltrix_session";
const SESSION_TTL_HOURS = 12;

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  organizationId: string;
  organizationName: string;
  organizationDataMode: "demo" | "live";
  timezone: string;
  currency: string;
  customerId: string | null;
  driverId: string | null;
  /** True when the account was provisioned with a temporary password. */
  mustChangePassword?: boolean;
  permissions: Permission[];
}

interface ProfileRow {
  id: string;
  organization_id: string;
  email: string;
  full_name: string;
  role: Role;
  status: string;
  customer_id: string | null;
  driver_id: string | null;
  must_change_password: number | boolean | null;
  organization_name: string;
  data_mode: "demo" | "live";
  timezone: string;
  default_currency: string;
  org_status: string;
}

function toUser(row: ProfileRow): SessionUser {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    organizationDataMode: row.data_mode,
    timezone: row.timezone,
    currency: row.default_currency,
    customerId: row.customer_id,
    driverId: row.driver_id,
    mustChangePassword: Boolean(row.must_change_password),
    permissions: permissionsForRole(row.role),
  };
}

const PROFILE_QUERY = `
  SELECT p.id, p.organization_id, p.email, p.full_name, p.role, p.status, p.customer_id,
         p.must_change_password, d.id AS driver_id, o.name AS organization_name, o.data_mode, o.timezone, o.default_currency, o.status AS org_status
  FROM profiles p
  JOIN organizations o ON o.id = p.organization_id
  LEFT JOIN drivers d ON d.profile_id = p.id
  WHERE p.id = ?`;

function hashToken(token: string): string {
  // The secret is part of the hash input so a leaked database alone cannot be
  // used to forge a valid session token without also knowing AUTH_SECRET.
  return sha256(`${token}.${requireAuthSecret()}`);
}

export async function createSession(profileId: string, meta: { ip?: string | null; userAgent?: string | null } = {}): Promise<void> {
  const token = randomToken(32);
  const expires = new Date(Date.now() + SESSION_TTL_HOURS * 3600_000).toISOString();
  await db().run(
    `INSERT INTO sessions (id, profile_id, token_hash, expires_at, created_at, ip_hash, user_agent) VALUES (?,?,?,?,?,?,?)`,
    [newId(), profileId, hashToken(token), expires, new Date().toISOString(), meta.ip ? sha256(meta.ip) : null, meta.userAgent?.slice(0, 255) ?? null],
  );
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.isProduction,
    path: "/",
    expires: new Date(expires),
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db().run("DELETE FROM sessions WHERE token_hash = ?", [hashToken(token)]);
  }
  store.delete(SESSION_COOKIE);
}

/** Per-request memoised session lookup. Never trust role/org ids from the client. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db().get<{ profile_id: string; expires_at: string }>(
    "SELECT profile_id, expires_at FROM sessions WHERE token_hash = ?",
    [hashToken(token)],
  );
  if (!session) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) {
    await db().run("DELETE FROM sessions WHERE token_hash = ?", [hashToken(token)]);
    return null;
  }
  const row = await db().get<ProfileRow>(PROFILE_QUERY, [session.profile_id]);
  if (!row) return null;
  if (row.status !== "active" || row.org_status !== "active") return null;
  return toUser(row);
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw unauthorized();
  return user;
}

export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw unauthorized();
  if (!user.permissions.includes(permission)) throw forbidden();
  return user;
}

export function assertPermission(user: SessionUser, permission: Permission): void {
  if (!user.permissions.includes(permission)) throw forbidden();
}

export function isAuthError(error: unknown): error is AppError {
  return typeof error === "object" && error !== null && "status" in error;
}

/** Credentials lookup. Email is unique per organisation; the first active match wins. */
export async function findProfileByEmail(
  email: string,
): Promise<(ProfileRow & { password_hash: string | null }) | undefined> {
  return db().get<ProfileRow & { password_hash: string | null }>(
    `SELECT p.id, p.organization_id, p.email, p.full_name, p.role, p.status, p.customer_id,
            p.must_change_password, p.password_hash, d.id AS driver_id, o.name AS organization_name, o.data_mode,
            o.timezone, o.default_currency, o.status AS org_status
     FROM profiles p
     JOIN organizations o ON o.id = p.organization_id
     LEFT JOIN drivers d ON d.profile_id = p.id
     WHERE lower(p.email) = lower(?) AND p.status = 'active'
     ORDER BY p.created_at ASC`,
    [email],
  );
}

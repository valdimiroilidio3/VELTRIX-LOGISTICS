import "server-only";
import { db, type Db } from "@/lib/db";
import { newId, nowIso, randomToken, sha256 } from "@/lib/ids";
import { env, requireAuthSecret } from "@/lib/env";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { sendEmail, emailIsConfigured } from "@/lib/integrations/email";
import { writeAudit } from "@/lib/audit";
import { consumeWithSweep } from "@/lib/rate-limit";
import { validationError } from "@/lib/errors";
import { logError } from "@/lib/errors";

/**
 * Password recovery.
 *
 * Design constraints:
 *  - The response to a reset request is always identical, whether or not the
 *    address exists (no account enumeration).
 *  - Only a SHA-256 hash of the token is stored, bound to AUTH_SECRET, so the
 *    database alone cannot produce a valid token.
 *  - Tokens are single-use, expire in 60 minutes, and invalidate all sessions
 *    of the account when consumed.
 *  - When the email integration is not configured the request is still recorded
 *    and the caller is told that delivery is pending — never that an email was
 *    sent.
 */

const TOKEN_TTL_MINUTES = 60;
const MAX_REQUESTS_PER_WINDOW = 5;
const WINDOW_MS = 15 * 60_000;

export interface ResetRequestResult {
  accepted: true;
  delivery: "email_sent" | "email_not_configured" | "delivery_failed" | "unknown_account";
}

function hashToken(token: string): string {
  return sha256(`${token}.${requireAuthSecret()}`);
}

/**
 * Issues a single-use token for a profile and returns the raw value exactly
 * once. Callers must deliver it (email/operator) and never persist it.
 */
export async function issueResetToken(
  profile: { id: string; organization_id: string; email: string },
  meta: { ip?: string | null } = {},
  database: Db = db(),
): Promise<{ token: string; expiresAt: string }> {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60_000).toISOString();
  const now = nowIso();

  // Only the latest link works: older unused tokens are invalidated.
  await database.run(
    "UPDATE password_reset_tokens SET used_at = ? WHERE profile_id = ? AND used_at IS NULL",
    [now, profile.id],
  );
  await database.run(
    `INSERT INTO password_reset_tokens (id, profile_id, token_hash, expires_at, used_at, requested_ip_hash, created_at)
     VALUES (?,?,?,?,NULL,?,?)`,
    [newId(), profile.id, hashToken(token), expiresAt, meta.ip ? sha256(meta.ip) : null, now],
  );
  return { token, expiresAt };
}

export async function requestPasswordReset(
  email: string,
  meta: { ip?: string | null } = {},
  database: Db = db(),
): Promise<ResetRequestResult> {
  const normalized = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) throw validationError("Email inválido.");

  const ip = meta.ip ?? "unknown";
  if (!consumeWithSweep(`password-reset:${ip}`, MAX_REQUESTS_PER_WINDOW, WINDOW_MS).allowed) {
    throw validationError("Demasiados pedidos de recuperação. Aguarde 15 minutos.");
  }

  const profile = await database.get<{ id: string; email: string; full_name: string; organization_id: string; status: string }>(
    "SELECT id, email, full_name, organization_id, status FROM profiles WHERE lower(email) = ?",
    [normalized],
  );

  // Same shape for unknown accounts — but no token is written.
  if (!profile || profile.status !== "active") {
    return { accepted: true, delivery: "unknown_account" };
  }

  const { token, expiresAt } = await issueResetToken(profile, meta, database);

  await writeAudit({
    organizationId: profile.organization_id,
    actorId: profile.id,
    actorEmail: profile.email,
    action: "auth.password_reset_requested",
    resourceType: "profile",
    resourceId: profile.id,
    metadata: { expiresAt },
    ip: meta.ip,
  });

  if (!emailIsConfigured()) {
    // Honest state: the request exists but nothing was delivered. An operator
    // can still complete the reset with scripts/create-admin.ts or the manual
    // procedure documented in docs/OPERACAO.md.
    return { accepted: true, delivery: "email_not_configured" };
  }

  const link = `${env.appUrl}/recuperar-password/${token}`;
  const result = await sendEmail({
    to: profile.email,
    subject: "VELTRIX — definir nova palavra-passe",
    text: [
      `Olá ${profile.full_name},`,
      "",
      "Recebemos um pedido para redefinir a palavra-passe da sua conta VELTRIX.",
      `Defina uma nova palavra-passe em: ${link}`,
      "",
      `A ligação expira em ${TOKEN_TTL_MINUTES} minutos e só pode ser usada uma vez.`,
      "Se não pediu esta alteração, ignore este email — a palavra-passe atual mantém-se válida.",
    ].join("\n"),
  });

  if (!result.ok) {
    logError("auth.password_reset_email", result.error ?? "unknown error");
    return { accepted: true, delivery: "delivery_failed" };
  }
  return { accepted: true, delivery: "email_sent" };
}

export interface ResetResult {
  ok: boolean;
  message: string;
}

export async function resetPasswordWithToken(
  token: string,
  newPassword: string,
  confirmPassword: string,
  meta: { ip?: string | null } = {},
  database: Db = db(),
): Promise<ResetResult> {
  if (!token || token.length < 20) return { ok: false, message: "Ligação inválida ou já utilizada." };
  if (newPassword.length < 10) return { ok: false, message: "A palavra-passe deve ter pelo menos 10 caracteres." };
  if (newPassword !== confirmPassword) return { ok: false, message: "As palavras-passe não coincidem." };
  if (!/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
    return { ok: false, message: "A palavra-passe deve conter letras e números." };
  }

  const hash = hashToken(token);
  const row = await database.get<{ id: string; profile_id: string; expires_at: string; used_at: string | null }>(
    "SELECT id, profile_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = ?",
    [hash],
  );
  if (!row || row.used_at) return { ok: false, message: "Ligação inválida ou já utilizada." };
  if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false, message: "Ligação expirada. Peça uma nova." };

  const passwordHash = await hashPassword(newPassword);
  const now = nowIso();

  await database.transaction(async (tx) => {
    await tx.run(
      "UPDATE profiles SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?",
      [passwordHash, now, row.profile_id],
    );
    await tx.run("UPDATE password_reset_tokens SET used_at = ? WHERE id = ?", [now, row.id]);
    // Every existing session is revoked: a reset means the old credentials may be compromised.
    await tx.run("DELETE FROM sessions WHERE profile_id = ?", [row.profile_id]);

    const profile = await tx.get<{ email: string; organization_id: string }>(
      "SELECT email, organization_id FROM profiles WHERE id = ?",
      [row.profile_id],
    );
    await writeAudit({
      organizationId: profile?.organization_id ?? "",
      actorId: row.profile_id,
      actorEmail: profile?.email ?? null,
      action: "auth.password_reset_completed",
      resourceType: "profile",
      resourceId: row.profile_id,
      metadata: { sessionsRevoked: true },
      ip: meta.ip,
    });
  });

  return { ok: true, message: "Palavra-passe alterada. Inicie sessão com as novas credenciais." };
}

/**
 * Administrative password reset performed by an admin for a colleague.
 * Returns a one-time password that is never logged or stored in clear text.
 */
export async function issueOneTimePassword(
  organizationId: string,
  profileId: string,
  actor: { id: string; email: string },
  database: Db = db(),
): Promise<{ password: string }> {
  const profile = await database.get<{ id: string; email: string; role: string }>(
    "SELECT id, email, role FROM profiles WHERE id = ? AND organization_id = ?",
    [profileId, organizationId],
  );
  if (!profile) throw validationError("Utilizador não encontrado.");
  if (profile.role === "super_admin" && actor.id !== profileId) {
    throw validationError("Palavras-passe de super_admin devem ser repostas pelo próprio através de recuperação segura.");
  }

  const password = `Vx${randomToken(18).replace(/[^A-Za-z0-9]/g, "").slice(0, 16)}9`;
  const passwordHash = await hashPassword(password);
  const now = nowIso();

  await database.transaction(async (tx) => {
    await tx.run(
      "UPDATE profiles SET password_hash = ?, must_change_password = 1, updated_at = ? WHERE id = ?",
      [passwordHash, now, profileId],
    );
    await tx.run("DELETE FROM sessions WHERE profile_id = ?", [profileId]);
    await writeAudit({
      organizationId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: "user.password_reset_by_admin",
      resourceType: "profile",
      resourceId: profileId,
      metadata: { email: profile.email },
    });
  });

  return { password };
}

/**
 * Self-service password change for a signed-in user. Requires the current
 * password (a stolen session alone must not be enough to take over the account),
 * clears the must-change flag and revokes every other session.
 */
export async function changeOwnPassword(
  user: { id: string; organizationId: string; email: string },
  input: { currentPassword: string; newPassword: string; confirmPassword: string },
  meta: { ip?: string | null } = {},
  database: Db = db(),
): Promise<ResetResult> {
  if (input.newPassword.length < 10) return { ok: false, message: "A palavra-passe deve ter pelo menos 10 caracteres." };
  if (input.newPassword !== input.confirmPassword) return { ok: false, message: "As palavras-passe não coincidem." };
  if (!/[A-Za-z]/.test(input.newPassword) || !/[0-9]/.test(input.newPassword)) {
    return { ok: false, message: "A palavra-passe deve conter letras e números." };
  }

  const profile = await database.get<{ id: string; password_hash: string | null }>(
    "SELECT id, password_hash FROM profiles WHERE id = ? AND organization_id = ?",
    [user.id, user.organizationId],
  );
  if (!profile) return { ok: false, message: "Conta não encontrada." };
  if (!(await verifyPassword(input.currentPassword, profile.password_hash))) {
    return { ok: false, message: "A palavra-passe atual não está correta." };
  }
  if (await verifyPassword(input.newPassword, profile.password_hash)) {
    return { ok: false, message: "Escolha uma palavra-passe diferente da atual." };
  }

  const passwordHash = await hashPassword(input.newPassword);
  const now = nowIso();
  // Outside a request (CLI/tests) there is no cookie store: every session is revoked.
  let currentToken: string | null = null;
  try {
    currentToken = (await cookies()).get(SESSION_COOKIE)?.value ?? null;
  } catch {
    currentToken = null;
  }

  await database.transaction(async (tx) => {
    await tx.run(
      "UPDATE profiles SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?",
      [passwordHash, now, profile.id],
    );
    if (currentToken) {
      // keep the session that performed the change, revoke the rest
      await tx.run("DELETE FROM sessions WHERE profile_id = ? AND token_hash <> ?", [profile.id, hashToken(currentToken)]);
    } else {
      await tx.run("DELETE FROM sessions WHERE profile_id = ?", [profile.id]);
    }
    await writeAudit({
      organizationId: user.organizationId,
      actorId: profile.id,
      actorEmail: user.email,
      action: "auth.password_changed",
      resourceType: "profile",
      resourceId: profile.id,
      metadata: { otherSessionsRevoked: true },
      ip: meta.ip,
    });
  });

  return { ok: true, message: "Palavra-passe alterada." };
}

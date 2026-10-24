import type { NextRequest } from "next/server";
import { ok, withApi, clientIp } from "@/lib/api/http";
import { AppError } from "@/lib/errors";
import { loginSchema } from "@/lib/validation/schemas";
import { findProfileByEmail, createSession, getSessionUser } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { consumeWithSweep } from "@/lib/rate-limit";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { nowIso } from "@/lib/ids";

/**
 * Programmatic login for API clients.
 * Sets the same httpOnly session cookie used by the web app; the session token
 * is never returned in the response body.
 */
export const POST = withApi(async (request: NextRequest) => {
  const ip = clientIp(request);
  const parsed = loginSchema.parse(await request.json());

  if (!consumeWithSweep(`login:${parsed.email}:${ip}`, 8, 15 * 60_000).allowed) {
    throw new AppError("Demasiadas tentativas. Aguarde 15 minutos.", 429, "rate_limited");
  }

  const profile = await findProfileByEmail(parsed.email);
  const valid = await verifyPassword(parsed.password, profile?.password_hash ?? null);
  if (!profile || !valid) {
    throw new AppError("Credenciais inválidas.", 401, "unauthorized");
  }
  if (profile.status !== "active" || profile.org_status !== "active") {
    throw new AppError("Conta suspensa. Contacte o administrador.", 403, "forbidden");
  }

  await createSession(profile.id, { ip, userAgent: request.headers.get("user-agent") });
  await db().run("UPDATE profiles SET last_login_at = ?, updated_at = ? WHERE id = ?", [nowIso(), nowIso(), profile.id]);
  await writeAudit({
    organizationId: profile.organization_id,
    actorId: profile.id,
    actorEmail: profile.email,
    action: "auth.login_api",
    resourceType: "session",
    metadata: { role: profile.role },
    ip,
  });

  const user = await getSessionUser();
  return ok({
    user: user
      ? {
          id: user.id,
          email: user.email,
          role: user.role,
          mustChangePassword: Boolean(user.mustChangePassword),
          permissions: user.permissions,
        }
      : null,
  });
});

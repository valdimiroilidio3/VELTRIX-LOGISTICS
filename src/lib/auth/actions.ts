"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { db, ensureDatabase } from "@/lib/db";
import { loginSchema } from "@/lib/validation/schemas";
import { verifyPassword } from "./password";
import { createSession, destroySession, findProfileByEmail } from "./session";
import { consumeWithSweep } from "@/lib/rate-limit";
import { writeAudit } from "@/lib/audit";
import { logError } from "@/lib/errors";
import { nowIso } from "@/lib/ids";

export interface LoginState {
  error?: string;
  email?: string;
}

async function requestMeta() {
  const headerList = await headers();
  const ip = headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? headerList.get("x-real-ip") ?? "unknown";
  return { ip, userAgent: headerList.get("user-agent") };
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  await ensureDatabase();
  let redirectTo = "/app";
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Introduza um email válido e a palavra-passe.", email: String(formData.get("email") ?? "") };
  }

  const meta = await requestMeta();
  const limitKey = `login:${parsed.data.email}:${meta.ip}`;
  const limit = consumeWithSweep(limitKey, 8, 15 * 60_000);
  if (!limit.allowed) {
    return { error: "Demasiadas tentativas. Aguarde 15 minutos e tente novamente.", email: parsed.data.email };
  }

  try {
    const profile = await findProfileByEmail(parsed.data.email);
    // Constant-ish work either way to reduce user enumeration through timing.
    const valid = await verifyPassword(parsed.data.password, profile?.password_hash ?? null);
    if (!profile || !valid) {
      if (profile) {
        await writeAudit({
          organizationId: profile.organization_id,
          actorId: profile.id,
          actorEmail: profile.email,
          action: "auth.login_failed",
          resourceType: "session",
          metadata: null,
          ip: meta.ip,
        });
      }
      return { error: "Credenciais inválidas.", email: parsed.data.email };
    }
    if (profile.status !== "active" || profile.org_status !== "active") {
      return { error: "Conta suspensa. Contacte o administrador.", email: parsed.data.email };
    }

    await createSession(profile.id, meta);
    const requestedNext = String(formData.get("next") ?? "").trim();
    const safeNext = requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : null;
    redirectTo = profile.must_change_password
      ? "/definir-palavra-passe"
      : (safeNext ?? (profile.role === "driver" ? "/app/driver" : "/app"));
    await db().run("UPDATE profiles SET last_login_at = ?, updated_at = ? WHERE id = ?", [nowIso(), nowIso(), profile.id]);
    await writeAudit({
      organizationId: profile.organization_id,
      actorId: profile.id,
      actorEmail: profile.email,
      action: "auth.login",
      resourceType: "session",
      metadata: { role: profile.role },
      ip: meta.ip,
    });
  } catch (error) {
    logError("auth.login", error);
    return { error: "Não foi possível iniciar sessão. Tente novamente.", email: parsed.data.email };
  }

  redirect(redirectTo);
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}

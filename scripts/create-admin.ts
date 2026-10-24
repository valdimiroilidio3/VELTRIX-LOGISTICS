/**
 * Provisions the first administrator — no default password anywhere in the repo.
 *
 * Usage:
 *   ADMIN_EMAIL=admin@empresa.pt ADMIN_NAME="Nome" \
 *   ADMIN_ORG="Nome da empresa" ADMIN_ORG_COUNTRY=PT \
 *   DATABASE_URL=postgres://... npx tsx scripts/create-admin.ts
 *
 * Behaviour:
 *  - requires DATABASE_URL (refuses to touch the demo SQLite store);
 *  - requires ADMIN_EMAIL; ADMIN_PASSWORD is optional but must be >= 14 chars;
 *    when omitted a 24-character random password is generated and printed ONCE;
 *  - refuses to create a second super_admin silently (requires --allow-additional);
 *  - audited with actions `admin.provisioned`.
 */
import { createHash, randomBytes } from "node:crypto";
import { getPostgresDb } from "../src/lib/db/postgres";
import { hashPassword } from "../src/lib/auth/password";
import { randomUUID } from "node:crypto";

function fail(message: string): never {
  console.error(`[create-admin] ${message}`);
  process.exit(1);
}

function strongPassword(): string {
  const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#%*";
  const bytes = randomBytes(24);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) fail("DATABASE_URL não está definido. Este script nunca corre sobre a base demo SQLite.");

  const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const fullName = (process.env.ADMIN_NAME ?? "").trim();
  const orgName = (process.env.ADMIN_ORG ?? "").trim();
  const country = (process.env.ADMIN_ORG_COUNTRY ?? "PT").toUpperCase();
  const providedPassword = process.env.ADMIN_PASSWORD;
  const allowAdditional = process.argv.includes("--allow-additional");

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail("ADMIN_EMAIL inválido ou em falta.");
  if (fullName.length < 3) fail("ADMIN_NAME inválido ou em falta.");
  if (orgName.length < 2) fail("ADMIN_ORG inválido ou em falta.");
  if (providedPassword && providedPassword.length < 14) fail("ADMIN_PASSWORD deve ter pelo menos 14 caracteres.");

  const database = getPostgresDb(databaseUrl);
  const password = providedPassword ?? strongPassword();
  const now = new Date().toISOString();
  const passwordHash = await hashPassword(password);

  const existing = await database.get<{ id: string }>("SELECT id FROM profiles WHERE lower(email) = ?", [email]);
  if (existing) fail(`Já existe um utilizador com o email ${email}.`);

  const existingAdmins = await database.get<{ total: number }>(
    "SELECT COUNT(*) AS total FROM profiles WHERE role IN ('admin','super_admin')",
  );
  if (Number(existingAdmins?.total ?? 0) > 0 && !allowAdditional) {
    fail("Já existe pelo menos um administrador. Use --allow-additional para criar outro conscientemente.");
  }

  const organization = await database.get<{ id: string }>("SELECT id FROM organizations ORDER BY created_at ASC LIMIT 1");
  const organizationId = organization?.id ?? randomUUID();
  if (!organization) {
    await database.run(
      `INSERT INTO organizations (id, name, country_code, default_currency, timezone, data_mode, status, created_at, updated_at)
       VALUES (?,?,?,?,?,'live','active',?,?)`,
      [organizationId, orgName, country, "EUR", "Europe/Lisbon", now, now],
    );
  }

  const profileId = randomUUID();
  await database.run(
    `INSERT INTO profiles (id, organization_id, auth_provider, email, password_hash, full_name, phone, role, status, customer_id, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,'active',NULL,?,?)`,
    [profileId, organizationId, "local", email, passwordHash, fullName, null, "super_admin", now, now],
  );

  await database.run(
    `INSERT INTO audit_logs (id, organization_id, actor_id, actor_email, action, resource_type, resource_id, metadata, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [
      randomUUID(),
      organizationId,
      profileId,
      email,
      "admin.provisioned",
      "profile",
      profileId,
      JSON.stringify({ email, via: "scripts/create-admin.ts" }),
      now,
    ],
  );

  console.log("[create-admin] administrador criado");
  console.log(`  organização : ${organizationId}`);
  console.log(`  utilizador  : ${email} (super_admin)`);
  if (!providedPassword) {
    console.log(`  palavra-passe: ${password}`);
    console.log("  ⚠ Esta palavra-passe é mostrada uma única vez. Guarde-a no gestor de segredos.");
  }
  console.log(`  impressão   : ${createHash("sha256").update(profileId).digest("hex").slice(0, 12)}`);
  await (database as unknown as { close?: () => Promise<void> }).close?.();
}

main().catch((error) => {
  console.error("[create-admin] falhou", error);
  process.exit(1);
});

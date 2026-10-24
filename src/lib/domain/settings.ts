import "server-only";
import { db, type Db } from "@/lib/db";
import { nowIso } from "@/lib/ids";
import { notFound, validationError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth/session";
import type { PricingRuleRow } from "@/lib/domain/pricing";

export interface OrganizationSettings {
  id: string;
  name: string;
  legal_name: string | null;
  tax_number: string | null;
  country_code: string;
  default_currency: string;
  timezone: string;
  data_mode: "demo" | "live";
  status: string;
  created_at: string;
}

export async function getOrganizationSettings(organizationId: string, database: Db = db()): Promise<OrganizationSettings> {
  const row = await database.get<OrganizationSettings>(
    `SELECT id, name, legal_name, tax_number, country_code, default_currency, timezone, data_mode, status, created_at
     FROM organizations WHERE id = ?`,
    [organizationId],
  );
  if (!row) throw notFound("Organização não encontrada");
  return row;
}

export async function updateOrganizationSettings(
  organizationId: string,
  input: { name: string; legalName?: string | null; taxNumber?: string | null; timezone: string; defaultCurrency: string },
  actor: SessionUser,
  database: Db = db(),
) {
  if (!/^[A-Z]{3}$/.test(input.defaultCurrency)) throw validationError("Moeda inválida (ISO 4217, três letras).");
  if (!/^[A-Za-z]+\/[A-Za-z_]+$/.test(input.timezone)) throw validationError("Fuso horário inválido (formato IANA).");
  const name = input.name.trim();
  if (name.length < 2) throw validationError("O nome da organização é demasiado curto.");

  await database.run(
    `UPDATE organizations SET name = ?, legal_name = ?, tax_number = ?, timezone = ?, default_currency = ?, updated_at = ? WHERE id = ?`,
    [name, input.legalName?.trim() || null, input.taxNumber?.trim() || null, input.timezone, input.defaultCurrency, nowIso(), organizationId],
  );

  await writeAudit(
    {
      organizationId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: "organization.updated",
      resourceType: "organization",
      resourceId: organizationId,
      metadata: { timezone: input.timezone, currency: input.defaultCurrency },
    },
    database,
  );

  return { id: organizationId };
}

/**
 * Switching demo → live is intentionally one-way through this action: it does
 * not delete demo rows, it only changes the label so demo records stop being
 * presented as operational. Deletion is a separate, audited maintenance task.
 */
export async function setDataMode(
  organizationId: string,
  mode: "demo" | "live",
  confirmation: string,
  actor: SessionUser,
  database: Db = db(),
) {
  if (actor.role !== "super_admin" && actor.role !== "admin") throw validationError("Apenas administradores podem alterar o modo de dados.");
  if (mode === "live" && confirmation.trim().toUpperCase() !== "PRODUCAO") {
    throw validationError("Para ativar o modo operacional escreva PRODUCAO na confirmação.");
  }
  const demoRows = await database.get<{ total: number }>(
    "SELECT COUNT(*) AS total FROM shipments WHERE organization_id = ?",
    [organizationId],
  );

  await database.run("UPDATE organizations SET data_mode = ?, updated_at = ? WHERE id = ?", [mode, nowIso(), organizationId]);
  await writeAudit(
    {
      organizationId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: "organization.data_mode_changed",
      resourceType: "organization",
      resourceId: organizationId,
      metadata: { mode, existingShipments: Number(demoRows?.total ?? 0) },
    },
    database,
  );

  return { mode, existingShipments: Number(demoRows?.total ?? 0) };
}

export interface PricingRuleView extends PricingRuleRow {
  id: string;
  active: number;
  updated_at: string;
}

export async function listPricingRules(organizationId: string, database: Db = db()): Promise<PricingRuleView[]> {
  return database.all<PricingRuleView>(
    `SELECT id, service_type, base_fee_cents, per_kg_cents, per_m3_cents, per_km_cents, minimum_cents,
            fuel_surcharge_pct, vat_rate_pct, active, updated_at
     FROM pricing_rules WHERE organization_id = ? ORDER BY service_type`,
    [organizationId],
  );
}

export async function updatePricingRule(
  organizationId: string,
  ruleId: string,
  input: {
    baseFeeCents: number;
    perKgCents: number;
    perM3Cents: number;
    perKmCents: number;
    minimumCents: number;
    fuelSurchargePct: number;
    vatRatePct: number;
    active: boolean;
  },
  actor: SessionUser,
  database: Db = db(),
) {
  const rule = await database.get<{ id: string; service_type: string }>(
    "SELECT id, service_type FROM pricing_rules WHERE id = ? AND organization_id = ?",
    [ruleId, organizationId],
  );
  if (!rule) throw notFound("Regra de preço não encontrada");

  const nonNegative = [input.baseFeeCents, input.perKgCents, input.perM3Cents, input.perKmCents, input.minimumCents];
  if (nonNegative.some((value) => !Number.isFinite(value) || value < 0)) throw validationError("Valores monetários não podem ser negativos.");
  if (input.fuelSurchargePct < 0 || input.fuelSurchargePct > 100) throw validationError("Sobretaxa de combustível deve estar entre 0 e 100.");
  if (input.vatRatePct < 0 || input.vatRatePct > 100) throw validationError("Taxa de IVA deve estar entre 0 e 100.");

  const previous = await database.get<Record<string, number>>(
    "SELECT base_fee_cents, per_kg_cents, per_m3_cents, per_km_cents, minimum_cents, fuel_surcharge_pct, vat_rate_pct FROM pricing_rules WHERE id = ?",
    [ruleId],
  );

  await database.run(
    `UPDATE pricing_rules SET base_fee_cents = ?, per_kg_cents = ?, per_m3_cents = ?, per_km_cents = ?, minimum_cents = ?,
       fuel_surcharge_pct = ?, vat_rate_pct = ?, active = ?, updated_at = ? WHERE id = ?`,
    [
      Math.round(input.baseFeeCents),
      Math.round(input.perKgCents),
      Math.round(input.perM3Cents),
      Math.round(input.perKmCents),
      Math.round(input.minimumCents),
      input.fuelSurchargePct,
      input.vatRatePct,
      input.active ? 1 : 0,
      nowIso(),
      ruleId,
    ],
  );

  await writeAudit(
    {
      organizationId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: "pricing.rule_updated",
      resourceType: "pricing_rule",
      resourceId: ruleId,
      metadata: { serviceType: rule.service_type, previous, next: input },
    },
    database,
  );

  return { id: ruleId };
}

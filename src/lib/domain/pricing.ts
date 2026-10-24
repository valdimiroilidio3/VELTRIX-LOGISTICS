import "server-only";
import { db, type Db } from "@/lib/db";

/**
 * Configurable price engine.
 *
 * The formula lives in the `pricing_rules` table so the company can change it
 * without a deployment. The seeded values are PROVISIONAL DEMONSTRATION VALUES
 * and must be reviewed and replaced by the company before any commercial use.
 *
 *   subtotal = max(base + kg*per_kg + m3*per_m3 + km*per_km, minimum)
 *   fuel     = subtotal * fuel_surcharge_pct/100
 *   tax      = (subtotal + fuel) * vat_rate_pct/100
 */

export interface PricingRuleRow {
  service_type: string;
  base_fee_cents: number;
  per_kg_cents: number;
  per_m3_cents: number;
  per_km_cents: number;
  minimum_cents: number;
  fuel_surcharge_pct: number;
  vat_rate_pct: number;
}

export interface PriceBreakdown {
  serviceType: string;
  weightKg: number;
  volumeM3: number;
  distanceKm: number | null;
  baseCents: number;
  weightCents: number;
  volumeCents: number;
  distanceCents: number;
  fuelCents: number;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  vatRatePct: number;
  currency: string;
  assumptions: string[];
}

export async function getPricingRule(organizationId: string, serviceType: string, database: Db = db()): Promise<PricingRuleRow> {
  const rule = await database.get<PricingRuleRow>(
    `SELECT service_type, base_fee_cents, per_kg_cents, per_m3_cents, per_km_cents, minimum_cents, fuel_surcharge_pct, vat_rate_pct
     FROM pricing_rules WHERE organization_id = ? AND service_type = ? AND active = 1`,
    [organizationId, serviceType],
  );
  if (!rule) {
    // No invented fallback price: refuse to quote instead of guessing.
    throw new Error(`Sem tabela de preços ativa para o serviço ${serviceType}. Configure pricing_rules.`);
  }
  return rule;
}

export function computePrice(
  rule: PricingRuleRow,
  input: { weightKg: number; volumeM3: number; distanceKm?: number | null; currency?: string },
): PriceBreakdown {
  const weightKg = Math.max(0, input.weightKg);
  const volumeM3 = Math.max(0, input.volumeM3);
  const distanceKm = input.distanceKm ?? null;

  const weightCents = Math.round(weightKg * rule.per_kg_cents);
  const volumeCents = Math.round(volumeM3 * rule.per_m3_cents);
  const distanceCents = distanceKm === null ? 0 : Math.round(distanceKm * rule.per_km_cents);
  const raw = rule.base_fee_cents + weightCents + volumeCents + distanceCents;
  const subtotal = Math.max(raw, rule.minimum_cents);
  const fuelCents = Math.round((subtotal * rule.fuel_surcharge_pct) / 100);
  const taxable = subtotal + fuelCents;
  const taxCents = Math.round((taxable * rule.vat_rate_pct) / 100);

  const assumptions = [
    "Valores provisórios de demonstração — sujeitos a validação comercial.",
    distanceKm === null
      ? "Distância não considerada (sem coordenadas validadas para origem/destino)."
      : "Distância rodoviária calculada pelo motor de rotas configurado.",
    `Sobretaxa de combustível ${rule.fuel_surcharge_pct}% · IVA ${rule.vat_rate_pct}% (regime PT).`,
  ];

  return {
    serviceType: rule.service_type,
    weightKg,
    volumeM3,
    distanceKm,
    baseCents: rule.base_fee_cents,
    weightCents,
    volumeCents,
    distanceCents,
    fuelCents,
    subtotalCents: subtotal,
    taxCents,
    totalCents: taxable + taxCents,
    vatRatePct: rule.vat_rate_pct,
    currency: input.currency ?? "EUR",
    assumptions,
  };
}

export async function priceShipment(
  organizationId: string,
  input: { serviceType: string; weightKg: number; volumeM3: number; distanceKm?: number | null },
  database: Db = db(),
): Promise<PriceBreakdown> {
  const rule = await getPricingRule(organizationId, input.serviceType, database);
  return computePrice(rule, input);
}

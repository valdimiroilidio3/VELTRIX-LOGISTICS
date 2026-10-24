import "server-only";
import { db, type Db } from "@/lib/db";
import { newId, newReference, nowIso } from "@/lib/ids";
import { conflict, notFound, validationError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth/session";
import { enqueueNotification } from "@/lib/notifications";
import type { ShipmentStatus } from "./shipment-status";

/**
 * Administrative quotes (prompt 02, section 7).
 *
 * A quote is written by staff with an explicit amount and currency — VELTRIX
 * never invents a tariff. Amounts are stored as integer minor units and the
 * currency is an explicit ISO-4217 code, so no floating point is involved.
 *
 * Quote lifecycle: draft → sent → accepted | rejected | expired.
 * Accepting a quote moves the linked shipment from `pending_quote` to `quoted`
 * (the shipment is only *confirmed* when staff confirms commercially).
 */

import { QUOTE_STATUSES, QUOTE_STATUS_LABELS, QUOTE_TRANSITIONS, type QuoteStatus } from "@/lib/domain/quote-status";

export { QUOTE_STATUSES, QUOTE_STATUS_LABELS, QUOTE_TRANSITIONS, type QuoteStatus };

export interface QuoteRecord {
  id: string;
  reference: string;
  organization_id: string;
  customer_id: string | null;
  shipment_id: string | null;
  tracking_code: string | null;
  company_name: string | null;
  contact_name: string;
  contact_email: string;
  origin: string;
  destination: string;
  service_type: string;
  description: string | null;
  weight_kg: number;
  volume_m3: number;
  currency: string;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  status: QuoteStatus;
  valid_until: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  decided_at: string | null;
  created_by_name: string | null;
}

const QUOTE_SELECT = `
  SELECT q.id, q.reference, q.organization_id, q.customer_id, q.shipment_id, s.tracking_code,
         c.company_name, q.contact_name, q.contact_email, q.origin, q.destination, q.service_type,
         q.description, q.weight_kg, q.volume_m3, q.currency, q.subtotal_cents, q.tax_cents, q.total_cents,
         q.status, q.valid_until, q.notes, q.created_at, q.updated_at, q.sent_at, q.decided_at,
         p.full_name AS created_by_name
  FROM quotes q
  LEFT JOIN customers c ON c.id = q.customer_id
  LEFT JOIN shipments s ON s.id = q.shipment_id
  LEFT JOIN profiles p ON p.id = q.created_by
`;

export async function listAdminQuotes(
  organizationId: string,
  options: { status?: string | null; customerId?: string | null } = {},
  database: Db = db(),
): Promise<QuoteRecord[]> {
  const params: (string | number)[] = [organizationId];
  let where = "q.organization_id = ?";
  if (options.status && (QUOTE_STATUSES as readonly string[]).includes(options.status)) {
    where += " AND q.status = ?";
    params.push(options.status);
  }
  if (options.customerId) {
    where += " AND q.customer_id = ?";
    params.push(options.customerId);
  }
  return database.all<QuoteRecord>(`${QUOTE_SELECT} WHERE ${where} ORDER BY q.created_at DESC LIMIT 200`, params);
}

export async function getQuote(quoteId: string, organizationId: string, database: Db = db()): Promise<QuoteRecord> {
  const quote = await database.get<QuoteRecord>(`${QUOTE_SELECT} WHERE q.id = ? AND q.organization_id = ?`, [quoteId, organizationId]);
  if (!quote) throw notFound("Orçamento não encontrado");
  return quote;
}

export interface CreateQuoteAdminInput {
  shipmentId?: string | null;
  customerId?: string | null;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string | null;
  origin?: string;
  destination?: string;
  serviceType?: string;
  description?: string | null;
  amountCents: number;
  currency: string;
  taxRatePct?: number;
  validUntil?: string | null;
  notes?: string | null;
}

function assertAmount(amountCents: number): number {
  if (!Number.isFinite(amountCents) || !Number.isInteger(amountCents) || amountCents < 0) {
    throw validationError("O valor do orçamento deve ser um número inteiro de cêntimos não negativo.");
  }
  if (amountCents > 1_000_000_000) throw validationError("Valor do orçamento acima do limite permitido.");
  return amountCents;
}

function assertCurrency(currency: string): string {
  const value = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(value)) throw validationError("Moeda inválida — use um código ISO 4217 de três letras.");
  return value;
}

function assertTaxRate(rate: number): number {
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw validationError("Taxa de IVA deve estar entre 0% e 100%.");
  return Math.round(rate * 100) / 100;
}

/**
 * Creates an administrative quote. When linked to a shipment, the customer and
 * route summary are copied from the shipment so the document is self-contained.
 */
export async function createAdminQuote(
  organizationId: string,
  input: CreateQuoteAdminInput,
  actor: SessionUser,
  database: Db = db(),
): Promise<{ id: string; reference: string }> {
  const amountCents = assertAmount(input.amountCents);
  const currency = assertCurrency(input.currency);
  const taxRate = assertTaxRate(input.taxRatePct ?? 0);

  return database.transaction(async (tx) => {
    let customerId = input.customerId ?? null;
    let contactName = input.contactName ?? "";
    let contactEmail = input.contactEmail ?? "";
    let contactPhone = input.contactPhone ?? null;
    let origin = input.origin ?? "";
    let destination = input.destination ?? "";
    let serviceType = input.serviceType ?? "standard";
    const shipmentId = input.shipmentId ?? null;

    if (shipmentId) {
      const shipment = await tx.get<{
        id: string; customer_id: string; service_type: string; status: string;
        company_name: string; contact_name: string; email: string; phone: string | null;
        origin_city: string; destination_city: string;
      }>(
        `SELECT s.id, s.customer_id, s.service_type, s.status, c.company_name, c.contact_name, c.email, c.phone,
                oa.city AS origin_city, da.city AS destination_city
         FROM shipments s
         JOIN customers c ON c.id = s.customer_id
         JOIN addresses oa ON oa.id = s.origin_address_id
         JOIN addresses da ON da.id = s.destination_address_id
         WHERE s.id = ? AND s.organization_id = ?`,
        [shipmentId, organizationId],
      );
      if (!shipment) throw notFound("Encomenda associada não encontrada");
      if (["cancelled", "returned"].includes(shipment.status)) {
        throw conflict("Não é possível orçamentar uma encomenda cancelada ou devolvida.");
      }
      customerId = shipment.customer_id;
      contactName = contactName || shipment.contact_name;
      contactEmail = contactEmail || shipment.email;
      contactPhone = contactPhone ?? shipment.phone;
      origin = origin || shipment.origin_city;
      destination = destination || shipment.destination_city;
      serviceType = input.serviceType || shipment.service_type;
    }

    if (!customerId && !contactEmail) throw validationError("Indique o cliente ou o email de contacto.");
    if (!contactName.trim()) throw validationError("Indique o nome de contacto.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactEmail)) throw validationError("Email de contacto inválido.");
    if (!origin.trim() || !destination.trim()) throw validationError("Indique a origem e o destino.");

    const taxCents = Math.round((amountCents * taxRate) / 100);
    const totalCents = amountCents + taxCents;
    const validUntil = input.validUntil ?? new Date(Date.now() + 15 * 24 * 3600_000).toISOString();

    const id = newId();
    const now = nowIso();
    const reference = newReference("QT");

    await tx.run(
      `INSERT INTO quotes (id, organization_id, reference, customer_id, shipment_id, contact_name, contact_email, contact_phone,
         origin, destination, service_type, weight_kg, volume_m3, currency, subtotal_cents, tax_cents, total_cents, status,
         valid_until, notes, description, created_by, sent_at, decided_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id, organizationId, reference, customerId, shipmentId, contactName.trim(), contactEmail.trim().toLowerCase(),
        contactPhone, origin.trim(), destination.trim(), serviceType,
        Number((await tx.get<{ w: number }>("SELECT COALESCE(total_weight_kg,0) AS w FROM shipments WHERE id = ?", [shipmentId]))?.w ?? 0),
        0, currency, amountCents, taxCents, totalCents, "draft",
        validUntil, input.notes ?? null, input.description ?? null, actor.id, null, null, now, now,
      ],
    );

    await tx.run(
      `INSERT INTO quote_events (id, quote_id, organization_id, previous_status, new_status, amount_cents, actor_id, notes, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [newId(), id, organizationId, null, "draft", totalCents, actor.id, "Orçamento criado", now],
    );

    await writeAudit(
      {
        organizationId,
        actorId: actor.id,
        actorEmail: actor.email,
        action: "quote.created",
        resourceType: "quote",
        resourceId: id,
        metadata: { reference, amountCents, currency, shipmentId, taxRatePct: taxRate },
      },
      tx,
    );

    return { id, reference };
  });
}

export async function updateAdminQuote(
  organizationId: string,
  quoteId: string,
  input: {
    amountCents?: number;
    currency?: string;
    taxRatePct?: number;
    description?: string | null;
    notes?: string | null;
    validUntil?: string | null;
  },
  actor: SessionUser,
  database: Db = db(),
) {
  return database.transaction(async (tx) => {
    const quote = await tx.get<QuoteRecord>("SELECT * FROM quotes WHERE id = ? AND organization_id = ?", [quoteId, organizationId]);
    if (!quote) throw notFound("Orçamento não encontrado");
    if (quote.status === "accepted") throw conflict("Orçamentos aceites são imutáveis. Emita um novo orçamento.");
    if (quote.status === "rejected" || quote.status === "expired") {
      throw conflict("Reative o orçamento (estado rascunho) antes de alterar valores.");
    }

    const amountCents = input.amountCents === undefined ? Number(quote.total_cents) : assertAmount(input.amountCents);
    const currency = input.currency ? assertCurrency(input.currency) : quote.currency;
    const taxRate =
      input.amountCents === undefined && input.taxRatePct === undefined
        ? // keep the existing effective rate when only descriptive fields change
          amountCents > 0
          ? Math.round((Number(quote.tax_cents) / Math.max(amountCents, 1)) * 10_000) / 100
          : 0
        : assertTaxRate(input.taxRatePct ?? 0);

    // subtotal stored in quotes.subtotal_cents; total = subtotal + tax
    const subtotal = input.taxRatePct === undefined ? Math.round(amountCents / (1 + taxRate / 100)) : amountCents;
    const taxCents = input.taxRatePct === undefined ? amountCents - subtotal : Math.round((amountCents * taxRate) / 100);
    const totalCents = subtotal + taxCents;

    await tx.run(
      `UPDATE quotes SET subtotal_cents = ?, tax_cents = ?, total_cents = ?, currency = ?, description = ?, notes = ?,
         valid_until = ?, updated_at = ? WHERE id = ? AND organization_id = ?`,
      [
        subtotal, taxCents, totalCents, currency,
        input.description === undefined ? quote.description : input.description,
        input.notes === undefined ? quote.notes : input.notes,
        input.validUntil === undefined ? quote.valid_until : input.validUntil,
        nowIso(), quoteId, organizationId,
      ],
    );

    await tx.run(
      `INSERT INTO quote_events (id, quote_id, organization_id, previous_status, new_status, amount_cents, actor_id, notes, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [newId(), quoteId, organizationId, quote.status, quote.status, totalCents, actor.id, "Valores atualizados", nowIso()],
    );

    await writeAudit(
      {
        organizationId,
        actorId: actor.id,
        actorEmail: actor.email,
        action: "quote.updated",
        resourceType: "quote",
        resourceId: quoteId,
        metadata: { previousTotalCents: quote.total_cents, totalCents, currency },
      },
      tx,
    );

    return { id: quoteId, totalCents, currency };
  });
}

export async function setAdminQuoteStatus(
  organizationId: string,
  quoteId: string,
  status: QuoteStatus,
  actor: SessionUser,
  notes?: string | null,
  database: Db = db(),
) {
  return database.transaction(async (tx) => {
    const quote = await tx.get<QuoteRecord>("SELECT * FROM quotes WHERE id = ? AND organization_id = ?", [quoteId, organizationId]);
    if (!quote) throw notFound("Orçamento não encontrado");
    if (!QUOTE_TRANSITIONS[quote.status].includes(status)) {
      throw conflict(
        `Transição de orçamento inválida: ${QUOTE_STATUS_LABELS[quote.status]} → ${QUOTE_STATUS_LABELS[status]}.`,
      );
    }

    // Events must be strictly ordered: two transitions can happen within the
    // same millisecond, so the timestamp is advanced past the previous event.
    const previousEvent = await tx.get<{ created_at: string }>(
      "SELECT created_at FROM quote_events WHERE quote_id = ? ORDER BY created_at DESC LIMIT 1",
      [quoteId],
    );
    let now = nowIso();
    if (previousEvent && new Date(previousEvent.created_at).getTime() >= new Date(now).getTime()) {
      now = new Date(new Date(previousEvent.created_at).getTime() + 1).toISOString();
    }
    await tx.run(
      `UPDATE quotes SET status = ?, sent_at = CASE WHEN ? = 'sent' THEN ? ELSE sent_at END,
         decided_at = CASE WHEN ? IN ('accepted','rejected') THEN ? ELSE decided_at END,
         updated_at = ? WHERE id = ? AND organization_id = ?`,
      [status, status, now, status, now, now, quoteId, organizationId],
    );

    await tx.run(
      `INSERT INTO quote_events (id, quote_id, organization_id, previous_status, new_status, amount_cents, actor_id, notes, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [newId(), quoteId, organizationId, quote.status, status, quote.total_cents, actor.id, notes ?? null, now],
    );

    // Cascade to the linked shipment, inside the same transaction.
    if (quote.shipment_id && status === "sent") {
      const shipment = await tx.get<{ id: string; status: ShipmentStatus }>(
        "SELECT id, status FROM shipments WHERE id = ? AND organization_id = ?",
        [quote.shipment_id, organizationId],
      );
      if (shipment?.status === "pending_quote") {
        await tx.run("UPDATE shipments SET status = 'quoted', updated_at = ? WHERE id = ?", [now, shipment.id]);
        await tx.run(
          `INSERT INTO shipment_events (id, shipment_id, event_type, previous_status, new_status, description, location, latitude, longitude, actor_id, occurred_at, metadata)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            newId(), shipment.id, "quote_sent", "pending_quote", "quoted",
            `Orçamento ${quote.reference} enviado ao cliente`, null, null, null, actor.id, now,
            JSON.stringify({ quoteId, reference: quote.reference }),
          ],
        );
      }
    }

    if (quote.contact_email && (status === "sent" || status === "rejected")) {
      await enqueueNotification(tx, {
        organizationId,
        recipient: quote.contact_email,
        channel: "email",
        template: status === "sent" ? "quote.sent" : "quote.received",
        subject: `VELTRIX — orçamento ${quote.reference} (${QUOTE_STATUS_LABELS[status].toLowerCase()})`,
        body:
          status === "sent"
            ? `O orçamento ${quote.reference}, no valor de ${(quote.total_cents / 100).toFixed(2)} ${quote.currency}, está disponível. Validade: ${quote.valid_until?.slice(0, 10) ?? "a confirmar"}.`
            : `O orçamento ${quote.reference} foi registado como ${QUOTE_STATUS_LABELS[status].toLowerCase()}.`,
        dedupeKey: `quote:${quoteId}:${status}:${now}`,
      });
    }

    await writeAudit(
      {
        organizationId,
        actorId: actor.id,
        actorEmail: actor.email,
        action: "quote.status_changed",
        resourceType: "quote",
        resourceId: quoteId,
        metadata: { from: quote.status, to: status, totalCents: quote.total_cents },
      },
      tx,
    );

    return { id: quoteId, status, reference: quote.reference };
  });
}

export async function listQuoteEvents(organizationId: string, quoteId: string, database: Db = db()) {
  return database.all<{
    id: string;
    previous_status: string | null;
    new_status: string;
    amount_cents: number | null;
    notes: string | null;
    actor_name: string | null;
    created_at: string;
  }>(
    `SELECT e.id, e.previous_status, e.new_status, e.amount_cents, e.notes, p.full_name AS actor_name, e.created_at
     FROM quote_events e LEFT JOIN profiles p ON p.id = e.actor_id
     WHERE e.quote_id = ? AND e.organization_id = ?
     ORDER BY e.created_at ASC`,
    [quoteId, organizationId],
  );
}

/** Converts a customer request into a quoted shipment amount (staff action). */
export async function attachQuoteAmountToShipment(
  organizationId: string,
  shipmentId: string,
  amountCents: number,
  actor: SessionUser,
  database: Db = db(),
) {
  assertAmount(amountCents);
  const shipment = await database.get<{ id: string; status: string; quoted_amount_cents: number }>(
    "SELECT id, status, quoted_amount_cents FROM shipments WHERE id = ? AND organization_id = ?",
    [shipmentId, organizationId],
  );
  if (!shipment) throw notFound("Encomenda não encontrada");
  await database.run("UPDATE shipments SET quoted_amount_cents = ?, updated_at = ? WHERE id = ?", [
    amountCents,
    nowIso(),
    shipmentId,
  ]);
  await writeAudit({
    organizationId,
    actorId: actor.id,
    actorEmail: actor.email,
    action: "shipment.amount_set",
    resourceType: "shipment",
    resourceId: shipmentId,
    metadata: { previous: shipment.quoted_amount_cents, amountCents },
  });
  return { id: shipmentId, amountCents };
}

export async function listQuotesForShipment(
  organizationId: string,
  shipmentId: string,
  database: Db = db(),
): Promise<QuoteRecord[]> {
  return database.all<QuoteRecord>(
    `${QUOTE_SELECT} WHERE q.organization_id = ? AND q.shipment_id = ? ORDER BY q.created_at DESC`,
    [organizationId, shipmentId],
  );
}

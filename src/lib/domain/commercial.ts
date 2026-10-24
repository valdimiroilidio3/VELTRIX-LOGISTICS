import "server-only";
import { db, type Db } from "@/lib/db";
import { newId, newReference, nowIso } from "@/lib/ids";
import { conflict, notFound, validationError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth/session";
import { priceShipment } from "./pricing";
import { enqueueNotification } from "@/lib/notifications";

/* ------------------------------------------------------------------ quotes */

export interface QuoteRow {
  id: string;
  reference: string;
  customer_id: string | null;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  origin: string;
  destination: string;
  service_type: string;
  weight_kg: number;
  volume_m3: number;
  currency: string;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  status: "draft" | "sent" | "accepted" | "rejected" | "expired";
  valid_until: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  company_name?: string | null;
}

export async function listQuotes(organizationId: string, database: Db = db()): Promise<QuoteRow[]> {
  return database.all<QuoteRow>(
    `SELECT q.*, c.company_name FROM quotes q LEFT JOIN customers c ON c.id = q.customer_id
     WHERE q.organization_id = ? ORDER BY q.created_at DESC LIMIT 100`,
    [organizationId],
  );
}

export interface CreateQuoteInput {
  contactName: string;
  contactEmail: string;
  contactPhone?: string;
  origin: string;
  destination: string;
  serviceType: string;
  weightKg: number;
  volumeM3: number;
  notes?: string;
  customerId?: string | null;
  distanceKm?: number | null;
}

/** Public/staff quote creation. Prices come from the configurable rule table only. */
export async function createQuote(organizationId: string, input: CreateQuoteInput, database: Db = db()) {
  return database.transaction(async (tx) => {
    const breakdown = await priceShipment(
      organizationId,
      { serviceType: input.serviceType, weightKg: input.weightKg, volumeM3: input.volumeM3, distanceKm: input.distanceKm ?? null },
      tx,
    );
    const id = newId();
    const now = nowIso();
    const validUntil = new Date(Date.now() + 15 * 24 * 3600_000).toISOString();
    await tx.run(
      `INSERT INTO quotes (id, organization_id, reference, customer_id, contact_name, contact_email, contact_phone, origin, destination, service_type,
        weight_kg, volume_m3, currency, subtotal_cents, tax_cents, total_cents, status, valid_until, notes, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id, organizationId, newReference("QT"), input.customerId ?? null, input.contactName, input.contactEmail,
        input.contactPhone || null, input.origin, input.destination, input.serviceType, input.weightKg, input.volumeM3,
        breakdown.currency, breakdown.subtotalCents, breakdown.taxCents, breakdown.totalCents, "sent", validUntil,
        input.notes || null, now, now,
      ],
    );
    return { id, reference: (await tx.get<{ reference: string }>("SELECT reference FROM quotes WHERE id = ?", [id]))?.reference ?? "", breakdown };
  });
}

export async function updateQuoteStatus(
  organizationId: string,
  quoteId: string,
  status: QuoteRow["status"],
  user: SessionUser,
  database: Db = db(),
) {
  const quote = await database.get<{ id: string; status: string }>("SELECT id, status FROM quotes WHERE id = ? AND organization_id = ?", [quoteId, organizationId]);
  if (!quote) throw notFound("Orçamento não encontrado");
  if (quote.status === "accepted" && status !== "accepted") throw conflict("Um orçamento aceite não pode voltar atrás.");
  await database.run("UPDATE quotes SET status = ?, updated_at = ? WHERE id = ?", [status, nowIso(), quoteId]);
  await writeAudit({
    organizationId,
    actorId: user.id,
    actorEmail: user.email,
    action: "quote.status_changed",
    resourceType: "quote",
    resourceId: quoteId,
    metadata: { from: quote.status, to: status },
  });
  return { id: quoteId, status };
}

/* ---------------------------------------------------------------- invoices */

export interface InvoiceRow {
  id: string;
  invoice_number: string;
  customer_id: string;
  company_name: string | null;
  contact_name: string;
  currency: string;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  status: "draft" | "issued" | "paid" | "overdue" | "void";
  issued_at: string | null;
  due_at: string | null;
  created_at: string;
}

/** Overdue is derived, never stored by a background guess: overdue = issued && due_at < now. */
export async function listInvoices(
  organizationId: string,
  scope: { customerId?: string | null } = {},
  database: Db = db(),
): Promise<InvoiceRow[]> {
  const rows = await database.all<InvoiceRow>(
    `SELECT i.id, i.invoice_number, i.customer_id, c.company_name, c.contact_name, i.currency,
            i.subtotal_cents, i.tax_cents, i.total_cents, i.status, i.issued_at, i.due_at, i.created_at
     FROM invoices i JOIN customers c ON c.id = i.customer_id
     WHERE i.organization_id = ?${scope.customerId ? " AND i.customer_id = ?" : ""}
     ORDER BY i.created_at DESC LIMIT 200`,
    scope.customerId ? [organizationId, scope.customerId] : [organizationId],
  );
  const now = nowIso();
  return rows.map((row) => ({
    ...row,
    status: row.status === "issued" && row.due_at && row.due_at < now ? "overdue" : row.status,
  }));
}

async function nextInvoiceNumber(tx: Db, organizationId: string): Promise<string> {
  const year = new Date().getUTCFullYear();
  const row = await tx.get<{ c: number }>(
    "SELECT COUNT(*) AS c FROM invoices WHERE organization_id = ? AND invoice_number LIKE ?",
    [organizationId, `FT-${year}-%`],
  );
  const sequence = Number(row?.c ?? 0) + 1;
  return `FT-${year}-${String(sequence).padStart(4, "0")}`;
}

export async function createInvoice(
  organizationId: string,
  input: { customerId: string; shipmentId?: string | null; subtotalCents: number; vatRatePct: number; dueInDays: number },
  user: SessionUser,
  database: Db = db(),
) {
  return database.transaction(async (tx) => {
    const customer = await tx.get<{ id: string }>("SELECT id FROM customers WHERE id = ? AND organization_id = ?", [input.customerId, organizationId]);
    if (!customer) throw validationError("Cliente inválido");

    if (input.shipmentId) {
      const shipment = await tx.get<{ id: string; customer_id: string; status: string }>(
        "SELECT id, customer_id, status FROM shipments WHERE id = ? AND organization_id = ?",
        [input.shipmentId, organizationId],
      );
      if (!shipment) throw validationError("Encomenda inválida");
      if (shipment.customer_id !== input.customerId) throw validationError("A encomenda não pertence ao cliente indicado");
      if (shipment.status !== "delivered") throw conflict("Só é possível faturar encomendas entregues.");
      const already = await tx.get<{ id: string }>("SELECT id FROM invoices WHERE shipment_id = ? AND status <> 'void'", [input.shipmentId]);
      if (already) throw conflict("Esta encomenda já tem fatura emitida.");
    }

    const taxCents = Math.round((input.subtotalCents * input.vatRatePct) / 100);
    const total = input.subtotalCents + taxCents;
    const invoiceNumber = await nextInvoiceNumber(tx, organizationId);
    const id = newId();
    const now = nowIso();
    const dueAt = new Date(Date.now() + input.dueInDays * 24 * 3600_000).toISOString();

    await tx.run(
      `INSERT INTO invoices (id, organization_id, customer_id, shipment_id, invoice_number, currency, subtotal_cents, tax_cents, total_cents, status, issued_at, due_at, external_reference, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, organizationId, input.customerId, input.shipmentId ?? null, invoiceNumber, "EUR", input.subtotalCents, taxCents, total, "issued", now, dueAt, null, now, now],
    );

    await writeAudit({
      organizationId,
      actorId: user.id,
      actorEmail: user.email,
      action: "invoice.issued",
      resourceType: "invoice",
      resourceId: id,
      metadata: { invoiceNumber, totalCents: total },
    }, tx);

    return { id, invoiceNumber, totalCents: total };
  });
}

/**
 * Registers a settlement. `provider = manual` records an offline/bank payment
 * entered by finance; gateway payments must arrive through the verified webhook.
 */
export async function registerPayment(
  organizationId: string,
  input: { invoiceId: string; amountCents: number; provider?: "manual" | "stripe" | "mollie" | "bank_transfer"; reference?: string; idempotencyKey?: string },
  user: SessionUser,
  database: Db = db(),
) {
  return database.transaction(async (tx) => {
    const invoice = await tx.get<{ id: string; total_cents: number; status: string; currency: string }>(
      "SELECT id, total_cents, status, currency FROM invoices WHERE id = ? AND organization_id = ?",
      [input.invoiceId, organizationId],
    );
    if (!invoice) throw notFound("Fatura não encontrada");
    if (invoice.status === "void") throw conflict("Fatura anulada não pode ser liquidada.");
    if (input.amountCents <= 0) throw validationError("Montante inválido");

    // Idempotent retry: a repeated (provider, reference) pair returns the original
    // payment instead of violating the UNIQUE constraint (which would surface as 500).
    const provider = input.provider ?? "manual";
    const providerReference = input.reference ?? input.idempotencyKey ?? null;
    if (providerReference) {
      const existing = await tx.get<{ id: string }>(
        "SELECT id FROM payments WHERE provider = ? AND provider_reference = ?",
        [provider, providerReference],
      );
      if (existing) return { id: existing.id, duplicate: true };
    }

    const paid = await tx.get<{ total: number | null }>(
      "SELECT SUM(amount_cents) AS total FROM payments WHERE invoice_id = ? AND status = 'succeeded'",
      [invoice.id],
    );
    const alreadyPaid = Number(paid?.total ?? 0);
    if (alreadyPaid + input.amountCents > invoice.total_cents) {
      throw conflict("O montante excede o valor em aberto da fatura.");
    }

    const id = newId();
    const now = nowIso();
    await tx.run(
      `INSERT INTO payments (id, organization_id, invoice_id, provider, provider_reference, amount_cents, currency, status, idempotency_key, paid_at, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [id, organizationId, invoice.id, provider, providerReference, input.amountCents, invoice.currency, "succeeded", input.idempotencyKey ?? null, now, now],
    );

    const settled = alreadyPaid + input.amountCents >= invoice.total_cents;
    if (settled) {
      await tx.run("UPDATE invoices SET status = 'paid', updated_at = ? WHERE id = ?", [now, invoice.id]);
    }

    await writeAudit({
      organizationId,
      actorId: user.id,
      actorEmail: user.email,
      action: "payment.registered",
      resourceType: "invoice",
      resourceId: invoice.id,
      metadata: { amountCents: input.amountCents, provider: input.provider ?? "manual", settled },
    }, tx);

    return { id, settled, duplicate: false };
  });
}

/* --------------------------------------------------------------- customers */

// Single implementation lives in ./people (also used by the customers page).
export { listCustomers } from "./people";

/**
 * Public quote submission used by both the website form and POST /api/v1/quotes.
 * Single implementation so the two entry points cannot diverge.
 */
export async function submitPublicQuote(
  input: {
    contactName: string;
    contactEmail: string;
    contactPhone?: string;
    origin: string;
    destination: string;
    serviceType: string;
    weightKg: number;
    volumeM3: number;
    notes?: string;
  },
  meta: { ip?: string | null } = {},
) {
  const organization = await db().get<{ id: string }>(
    "SELECT id FROM organizations WHERE status = 'active' ORDER BY created_at ASC",
  );
  if (!organization) throw conflict("Organização não configurada. Contacte o administrador.");

  const quote = await createQuote(organization.id, input);
  await enqueueNotification(db(), {
    organizationId: organization.id,
    recipient: input.contactEmail,
    channel: "email",
    template: "quote.received",
    subject: `VELTRIX — pedido de orçamento ${quote.reference}`,
    body: `Recebemos o seu pedido ${quote.reference}. A nossa equipa responde em 1 dia útil.`,
    dedupeKey: `quote:${quote.id}`,
  });
  await writeAudit({
    organizationId: organization.id,
    action: "quote.requested_publicly",
    resourceType: "quote",
    resourceId: quote.id,
    metadata: { serviceType: input.serviceType },
    ip: meta.ip ?? null,
  });
  return quote;
}

/* ----------------------------------------------------------- contact inbox */

export async function submitContactMessage(
  input: { name: string; email: string; topic: string; message: string },
  meta: { ip?: string | null } = {},
) {
  const organization = await db().get<{ id: string }>(
    "SELECT id FROM organizations WHERE status = 'active' ORDER BY created_at ASC",
  );
  if (!organization) throw conflict("Organização não configurada.");

  const id = newId();
  const now = nowIso();
  await db().run(
    `INSERT INTO contact_messages (id, organization_id, name, email, topic, message, status, assigned_to, ip_hash, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [id, organization.id, input.name, input.email, input.topic.slice(0, 40), input.message.slice(0, 1500), "new", null, null, now, now],
  );

  // Mirror the inbound message into the outbox so staff are notified when email works.
  await enqueueNotification(db(), {
    organizationId: organization.id,
    recipient: input.email,
    channel: "in_app",
    template: "integration.failure",
    subject: `Nova mensagem de ${input.name}`,
    body: input.message.slice(0, 400),
    dedupeKey: `contact:${id}`,
  });

  await writeAudit({
    organizationId: organization.id,
    action: "contact.message_received",
    resourceType: "contact_message",
    resourceId: id,
    metadata: { topic: input.topic },
    ip: meta.ip ?? null,
  });

  return { id };
}

export async function listContactMessages(organizationId: string, database: Db = db()) {
  return database.all<{
    id: string; name: string; email: string; topic: string; message: string; status: string; created_at: string;
  }>(
    `SELECT id, name, email, topic, message, status, created_at FROM contact_messages
     WHERE organization_id = ? ORDER BY created_at DESC LIMIT 100`,
    [organizationId],
  );
}

import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { db } from "@/lib/db";
import { logError } from "@/lib/errors";
import { registerPayment } from "@/lib/domain/commercial";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * Payment provider webhook.
 *
 * - HMAC-SHA256 signature over the raw body, compared in constant time.
 * - Idempotent: the provider event id is stored in `payments.provider_reference`,
 *   so replays never double-credit an invoice.
 * - Unknown/invalid payloads are acknowledged with 4xx and never mutate data.
 * - Without PAYMENT_WEBHOOK_SECRET the endpoint refuses all requests (503).
 */
function verifySignature(rawBody: string, header: string | null): boolean {
  if (!env.payments.webhookSecret) return false;
  if (!header) return false;
  const expected = createHmac("sha256", env.payments.webhookSecret).update(rawBody).digest("hex");
  const provided = header.startsWith("sha256=") ? header.slice(7) : header;
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

interface PaymentEvent {
  id?: string;
  type?: string;
  data?: { invoiceNumber?: string; amountCents?: number; reference?: string };
}

export async function POST(request: NextRequest) {
  if (!env.payments.configured) {
    return NextResponse.json(
      { error: { code: "not_configured", message: "Pagamentos online não estão configurados." } },
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-veltrix-signature") ?? request.headers.get("stripe-signature");
  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: { code: "invalid_signature", message: "Assinatura inválida." } }, { status: 401 });
  }

  let event: PaymentEvent;
  try {
    event = JSON.parse(rawBody) as PaymentEvent;
  } catch {
    return NextResponse.json({ error: { code: "invalid_payload", message: "Payload inválido." } }, { status: 400 });
  }

  if (!event.id || !event.data?.invoiceNumber || !event.data.amountCents) {
    return NextResponse.json({ error: { code: "invalid_payload", message: "Evento incompleto." } }, { status: 422 });
  }
  if (event.type && event.type !== "payment.succeeded" && event.type !== "payment_succeeded") {
    return NextResponse.json({ received: true, ignored: true }, { status: 200 });
  }

  try {
    const invoice = await db().get<{ id: string; organization_id: string }>(
      "SELECT id, organization_id FROM invoices WHERE invoice_number = ?",
      [event.data.invoiceNumber],
    );
    if (!invoice) {
      return NextResponse.json({ error: { code: "invoice_not_found", message: "Fatura desconhecida." } }, { status: 404 });
    }

    const replay = await db().get<{ id: string }>("SELECT id FROM payments WHERE provider = ? AND provider_reference = ?", [
      env.payments.provider ?? "stripe",
      event.id,
    ]);
    if (replay) return NextResponse.json({ received: true, duplicate: true }, { status: 200 });

    const systemActor = {
      id: "system",
      email: "system@veltrix",
      organizationId: invoice.organization_id,
      role: "finance" as const,
    };

    await registerPayment(
      invoice.organization_id,
      {
        invoiceId: invoice.id,
        amountCents: event.data.amountCents,
        provider: (env.payments.provider ?? "stripe") as "stripe" | "mollie",
        reference: event.id,
        idempotencyKey: event.id,
      },
      { ...systemActor } as never,
    );

    await writeAudit({
      organizationId: invoice.organization_id,
      action: "payment.webhook_processed",
      resourceType: "invoice",
      resourceId: invoice.id,
      metadata: { provider: env.payments.provider, providerEventId: event.id, amountCents: event.data.amountCents },
    });

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    logError("webhook.payments", error);
    return NextResponse.json({ error: { code: "processing_failed", message: "Falha ao processar o evento." } }, { status: 500 });
  }
}

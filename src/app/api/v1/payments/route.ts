import type { NextRequest } from "next/server";
import { z } from "zod";
import { created, requireApiPermission, withApi } from "@/lib/api/http";
import { registerPayment } from "@/lib/domain/commercial";

const schema = z.object({
  invoiceId: z.string().uuid(),
  amountCents: z.coerce.number().int().positive(),
  provider: z.enum(["manual", "stripe", "mollie", "bank_transfer"]).default("manual"),
  reference: z.string().trim().max(120).optional(),
  idempotencyKey: z.string().trim().min(8).max(100).optional(),
});

/**
 * Manual settlement registered by finance. Gateway payments must never use this
 * endpoint — they arrive via /api/v1/webhooks/payments after signature checks.
 */
export const POST = withApi(async (request: NextRequest) => {
  const user = await requireApiPermission("payments:write");
  const parsed = schema.parse(await request.json());
  if (parsed.provider !== "manual" && parsed.provider !== "bank_transfer") {
    return created({
      error: "Pagamentos de gateway só podem ser confirmados pelo webhook verificado.",
    });
  }
  return created(await registerPayment(user.organizationId, parsed, user));
});

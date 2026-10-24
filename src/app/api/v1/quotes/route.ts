import type { NextRequest } from "next/server";
import { created, clientIp, withApi } from "@/lib/api/http";
import { quoteRequestSchema } from "@/lib/validation/schemas";
import { submitPublicQuote } from "@/lib/domain/commercial";
import { consumeWithSweep } from "@/lib/rate-limit";
import { tooManyRequests, validationError } from "@/lib/errors";

/** Public quote request: rate limited, honeypot field, server-side validated. */
export const POST = withApi(async (request: NextRequest) => {
  const ip = clientIp(request);
  if (!consumeWithSweep(`quote:${ip}`, 5, 10 * 60_000).allowed) throw tooManyRequests();

  const parsed = quoteRequestSchema.parse(await request.json());
  if (parsed.website) throw validationError("Submissão rejeitada.");

  const quote = await submitPublicQuote(
    {
      contactName: parsed.contactName,
      contactEmail: parsed.contactEmail,
      contactPhone: parsed.contactPhone || undefined,
      origin: parsed.origin,
      destination: parsed.destination,
      serviceType: parsed.serviceType,
      weightKg: parsed.weightKg,
      volumeM3: parsed.volumeM3,
      notes: parsed.notes || undefined,
    },
    { ip },
  );

  return created({
    reference: quote.reference,
    totalCents: quote.breakdown.totalCents,
    currency: quote.breakdown.currency,
    validUntil: new Date(Date.now() + 15 * 24 * 3600_000).toISOString(),
    assumptions: quote.breakdown.assumptions,
    note: "Valor indicativo gerado por tabela configurável, sujeito a confirmação comercial.",
  });
});

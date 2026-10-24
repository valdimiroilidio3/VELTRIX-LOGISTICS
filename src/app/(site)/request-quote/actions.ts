"use server";

import { headers } from "next/headers";
import { quoteRequestSchema } from "@/lib/validation/schemas";
import { submitPublicQuote } from "@/lib/domain/commercial";
import { consumeWithSweep } from "@/lib/rate-limit";
import { logError } from "@/lib/errors";
import { ensureDatabase } from "@/lib/db";

export interface QuoteFormState {
  status: "idle" | "success" | "error";
  message?: string;
  result?: {
    reference: string;
    totalCents: number;
    currency: string;
    validUntil: string;
    assumptions: string[];
  };
  fieldErrors?: Record<string, string>;
}

export async function requestQuoteAction(_prev: QuoteFormState, formData: FormData): Promise<QuoteFormState> {
  await ensureDatabase();
  const headerList = await headers();
  const ip = headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!consumeWithSweep(`quote-form:${ip}`, 5, 10 * 60_000).allowed) {
    return { status: "error", message: "Demasiados pedidos a partir deste endereço. Tente novamente mais tarde." };
  }

  const raw = {
    contactName: formData.get("contactName"),
    contactEmail: formData.get("contactEmail"),
    contactPhone: formData.get("contactPhone") ?? "",
    origin: formData.get("origin"),
    destination: formData.get("destination"),
    serviceType: formData.get("serviceType"),
    weightKg: formData.get("weightKg"),
    volumeM3: formData.get("volumeM3") || 0,
    notes: formData.get("notes") ?? "",
    website: formData.get("website") ?? "",
  };

  const parsed = quoteRequestSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { status: "error", message: "Verifique os campos assinalados.", fieldErrors };
  }
  if (parsed.data.website) {
    return { status: "error", message: "Submissão rejeitada." };
  }

  try {
    const quote = await submitPublicQuote(
      {
        contactName: parsed.data.contactName,
        contactEmail: parsed.data.contactEmail,
        contactPhone: parsed.data.contactPhone || undefined,
        origin: parsed.data.origin,
        destination: parsed.data.destination,
        serviceType: parsed.data.serviceType,
        weightKg: parsed.data.weightKg,
        volumeM3: parsed.data.volumeM3,
        notes: parsed.data.notes || undefined,
      },
      { ip },
    );

    return {
      status: "success",
      message: "Pedido registado. Receberá a confirmação pelo email indicado quando o email transacional estiver configurado.",
      result: {
        reference: quote.reference,
        totalCents: quote.breakdown.totalCents,
        currency: quote.breakdown.currency,
        validUntil: new Date(Date.now() + 15 * 24 * 3600_000).toISOString(),
        assumptions: quote.breakdown.assumptions,
      },
    };
  } catch (error) {
    logError("quote.request", error);
    return {
      status: "error",
      message: error instanceof Error && error.message.includes("tabela de preços")
        ? "O simulador de preços não está configurado. Contacte-nos diretamente para uma proposta."
        : "Não foi possível registar o pedido. Tente novamente.",
    };
  }
}

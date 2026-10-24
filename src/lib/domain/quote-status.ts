/**
 * Canonical quote lifecycle — safe to import from client components.
 * Domain operations live in `@/lib/domain/quotes` (server-only).
 */
export const QUOTE_STATUSES = ["draft", "sent", "accepted", "rejected", "expired"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: "Rascunho",
  sent: "Enviado",
  accepted: "Aceite",
  rejected: "Recusado",
  expired: "Expirado",
};

/** Allowed quote state changes. Accepted quotes are final. */
export const QUOTE_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  draft: ["sent", "expired"],
  sent: ["accepted", "rejected", "expired", "draft"],
  accepted: [],
  rejected: ["draft", "sent"],
  expired: ["draft", "sent"],
};

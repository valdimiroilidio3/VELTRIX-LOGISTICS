/**
 * Formal shipment state machine.
 *
 * Canonical lifecycle (prompt 02):
 *   pending_quote → quoted → confirmed → assigned → picked_up → in_transit → delivered
 *
 * `out_for_delivery` remains available as an optional refinement between
 * `in_transit` and `delivered` for last-mile operations.
 *
 * Exception states: on_hold, exception, failed_delivery, returned, cancelled.
 */

export const SHIPMENT_STATUSES = [
  "pending_quote",
  "quoted",
  "confirmed",
  "assigned",
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "on_hold",
  "exception",
  "failed_delivery",
  "returned",
  "cancelled",
] as const;

export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

/** States before the shipment is confirmed by the customer. */
export const PLANNING_STATUSES: ShipmentStatus[] = ["pending_quote", "quoted"];

/** States where the shipment is physically in the carrier's hands. */
export const OPERATIONAL_STATUSES: ShipmentStatus[] = ["picked_up", "in_transit", "out_for_delivery"];

export const TERMINAL_STATUSES: ShipmentStatus[] = ["delivered", "returned", "cancelled"];

export const SHIPMENT_TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  pending_quote: ["quoted", "cancelled"],
  quoted: ["confirmed", "on_hold", "cancelled"],
  confirmed: ["assigned", "on_hold", "cancelled"],
  assigned: ["picked_up", "on_hold", "exception", "cancelled"],
  picked_up: ["in_transit", "exception", "on_hold"],
  in_transit: ["out_for_delivery", "delivered", "exception", "on_hold"],
  out_for_delivery: ["delivered", "failed_delivery", "exception"],
  delivered: ["returned"],
  on_hold: ["quoted", "confirmed", "assigned", "cancelled"],
  exception: ["in_transit", "out_for_delivery", "failed_delivery", "on_hold", "returned", "cancelled"],
  failed_delivery: ["out_for_delivery", "returned", "cancelled"],
  returned: [],
  cancelled: [],
};

export const STATUS_LABELS: Record<ShipmentStatus, string> = {
  pending_quote: "Pedido de orçamento",
  quoted: "Orçamentada",
  confirmed: "Confirmada",
  assigned: "Atribuída",
  picked_up: "Recolhida",
  in_transit: "Em trânsito",
  out_for_delivery: "Em distribuição",
  delivered: "Entregue",
  on_hold: "Em espera",
  exception: "Ocorrência",
  failed_delivery: "Entrega falhada",
  returned: "Devolvida",
  cancelled: "Cancelada",
};

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

export const STATUS_TONE: Record<ShipmentStatus, StatusTone> = {
  pending_quote: "warning",
  quoted: "info",
  confirmed: "info",
  assigned: "info",
  picked_up: "info",
  in_transit: "info",
  out_for_delivery: "warning",
  delivered: "success",
  on_hold: "neutral",
  exception: "danger",
  failed_delivery: "danger",
  returned: "neutral",
  cancelled: "neutral",
};

export function isShipmentStatus(value: string): value is ShipmentStatus {
  return (SHIPMENT_STATUSES as readonly string[]).includes(value);
}

export function nextStatuses(from: ShipmentStatus): ShipmentStatus[] {
  return SHIPMENT_TRANSITIONS[from] ?? [];
}

export function isTerminal(status: ShipmentStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function isOperational(status: ShipmentStatus): boolean {
  return OPERATIONAL_STATUSES.includes(status);
}

/** Statuses a customer may request to move to (self-service). */
export const CUSTOMER_ALLOWED_TRANSITIONS: ShipmentStatus[] = ["cancelled"];

export interface TransitionCheckInput {
  from: ShipmentStatus;
  to: ShipmentStatus;
  role: string;
  hasProofOfDelivery: boolean;
  override?: boolean;
  justification?: string | null;
  roleAllows?: (to: ShipmentStatus) => boolean;
}

export interface TransitionCheckResult {
  allowed: boolean;
  reason?: string;
  requiresOverride: boolean;
}

/**
 * Pure decision function — no I/O, so it is fully unit-testable and is the
 * single authority used by both the API and the UI to decide what is possible.
 */
export function checkTransition(input: TransitionCheckInput): TransitionCheckResult {
  const { from, to, override, justification, hasProofOfDelivery } = input;

  if (from === to) {
    return { allowed: false, reason: "A encomenda já se encontra nesse estado.", requiresOverride: false };
  }

  const structural = (SHIPMENT_TRANSITIONS[from] ?? []).includes(to);
  const isAdmin = input.role === "admin" || input.role === "super_admin";
  const overrideValid = Boolean(override && isAdmin && (justification ?? "").trim().length >= 10);

  if (isTerminal(from) && !overrideValid) {
    return {
      allowed: false,
      reason: "Estado terminal: é necessária uma ação administrativa com justificação registada.",
      requiresOverride: true,
    };
  }

  if (!structural && !overrideValid) {
    if (isAdmin) {
      return {
        allowed: false,
        reason: "Transição inválida. Pode ser forçada por um administrador com justificação.",
        requiresOverride: true,
      };
    }
    return { allowed: false, reason: `Transição de ${from} para ${to} não é permitida.`, requiresOverride: false };
  }

  if (input.roleAllows && !input.roleAllows(to) && !overrideValid) {
    return { allowed: false, reason: "A sua função não permite efetuar esta transição.", requiresOverride: true };
  }

  // Business guard: a delivery may only be confirmed with proof of delivery on file.
  if (to === "delivered" && !hasProofOfDelivery && !overrideValid) {
    return {
      allowed: false,
      reason: "É necessário registar a prova de entrega antes de confirmar a entrega.",
      requiresOverride: false,
    };
  }

  return { allowed: true, requiresOverride: overrideValid };
}

/** Canonical path used for timelines, seeds and tests. */
export const CANONICAL_PATH: ShipmentStatus[] = [
  "pending_quote",
  "quoted",
  "confirmed",
  "assigned",
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "delivered",
];

export function canonicalPath(to: ShipmentStatus): ShipmentStatus[] {
  const index = CANONICAL_PATH.indexOf(to);
  if (index >= 0) return CANONICAL_PATH.slice(0, index + 1);
  return [to];
}

/** Legacy status values from the previous schema, mapped for migrations. */
export const LEGACY_STATUS_MAP: Record<string, ShipmentStatus> = {
  draft: "pending_quote",
  pending_confirmation: "quoted",
  scheduled: "assigned",
};

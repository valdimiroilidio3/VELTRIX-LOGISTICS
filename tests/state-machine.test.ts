import { describe, expect, it } from "vitest";
import { checkTransition, nextStatuses, isTerminal, SHIPMENT_TRANSITIONS } from "@/lib/domain/shipment-status";

const base = { role: "operations_manager", hasProofOfDelivery: true, roleAllows: () => true };

describe("shipment state machine", () => {
  it("allows the canonical happy path", () => {
    const path = ["pending_quote", "quoted", "confirmed", "assigned", "picked_up", "in_transit", "out_for_delivery", "delivered"] as const;
    for (let index = 1; index < path.length; index += 1) {
      const from = path[index - 1]!;
      const to = path[index]!;
      expect(checkTransition({ ...base, from, to }).allowed).toBe(true);
    }
  });

  it("blocks skipping states", () => {
    expect(checkTransition({ ...base, from: "confirmed", to: "delivered" }).allowed).toBe(false);
    expect(checkTransition({ ...base, from: "in_transit", to: "cancelled" }).allowed).toBe(false);
  });

  it("refuses delivery confirmation without proof of delivery", () => {
    const result = checkTransition({ ...base, from: "out_for_delivery", to: "delivered", hasProofOfDelivery: false });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/prova de entrega/i);
  });

  it("treats delivered/returned/cancelled as terminal without override", () => {
    expect(isTerminal("delivered")).toBe(true);
    expect(checkTransition({ ...base, from: "delivered", to: "returned" }).allowed).toBe(false);
    expect(checkTransition({ ...base, from: "cancelled", to: "confirmed" }).allowed).toBe(false);
  });

  it("allows an administrator override only with a justification", () => {
    const withoutJustification = checkTransition({ ...base, role: "admin", from: "delivered", to: "returned", override: true, justification: "curta" });
    expect(withoutJustification.allowed).toBe(false);

    const withJustification = checkTransition({
      ...base,
      role: "admin",
      from: "delivered",
      to: "returned",
      override: true,
      justification: "Devolução autorizada pelo cliente após inspeção.",
    });
    expect(withJustification.allowed).toBe(true);
    expect(withJustification.requiresOverride).toBe(true);
  });

  it("never lets a non-admin force a transition", () => {
    const result = checkTransition({
      role: "dispatcher",
      hasProofOfDelivery: true,
      from: "delivered",
      to: "returned",
      override: true,
      justification: "Tentativa indevida de alterar estado terminal.",
      roleAllows: () => true,
    });
    expect(result.allowed).toBe(false);
  });

  it("enforces role restrictions on transitions", () => {
    const result = checkTransition({
      role: "driver",
      hasProofOfDelivery: true,
      from: "in_transit",
      to: "cancelled",
      roleAllows: (to) => to === "out_for_delivery" || to === "delivered",
    });
    expect(result.allowed).toBe(false);
  });

  it("declares no outgoing transitions for returned shipments", () => {
    expect(nextStatuses("returned")).toHaveLength(0);
    expect(SHIPMENT_TRANSITIONS.cancelled).toHaveLength(0);
  });

  it("rejects a transition to the same status", () => {
    expect(checkTransition({ ...base, from: "in_transit", to: "in_transit" }).allowed).toBe(false);
  });
});

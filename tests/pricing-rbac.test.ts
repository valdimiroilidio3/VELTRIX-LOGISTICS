import { describe, expect, it } from "vitest";
import { computePrice, type PricingRuleRow } from "@/lib/domain/pricing";
import { ROLE_PERMISSIONS, roleCanTransitionTo, roleHasPermission, ROLES } from "@/lib/auth/rbac";

const rule: PricingRuleRow = {
  service_type: "standard",
  base_fee_cents: 4500,
  per_kg_cents: 85,
  per_m3_cents: 1800,
  per_km_cents: 55,
  minimum_cents: 8500,
  fuel_surcharge_pct: 8.5,
  vat_rate_pct: 23,
};

describe("price engine", () => {
  it("uses integer minor units and applies base + weight + volume", () => {
    const price = computePrice(rule, { weightKg: 100, volumeM3: 2 });
    expect(price.weightCents).toBe(8500);
    expect(price.volumeCents).toBe(3600);
    expect(price.subtotalCents).toBe(4500 + 8500 + 3600);
    expect(Number.isInteger(price.totalCents)).toBe(true);
  });

  it("never returns below the configured minimum", () => {
    const price = computePrice(rule, { weightKg: 1, volumeM3: 0 });
    expect(price.subtotalCents).toBe(rule.minimum_cents);
  });

  it("adds fuel surcharge before VAT", () => {
    const price = computePrice(rule, { weightKg: 100, volumeM3: 2 });
    const expectedFuel = Math.round((price.subtotalCents * 8.5) / 100);
    expect(price.fuelCents).toBe(expectedFuel);
    expect(price.taxCents).toBe(Math.round(((price.subtotalCents + expectedFuel) * 23) / 100));
    expect(price.totalCents).toBe(price.subtotalCents + expectedFuel + price.taxCents);
  });

  it("includes distance only when it was actually calculated", () => {
    const withDistance = computePrice(rule, { weightKg: 10, volumeM3: 0, distanceKm: 100 });
    const withoutDistance = computePrice(rule, { weightKg: 10, volumeM3: 0 });
    expect(withDistance.distanceCents).toBe(5500);
    expect(withoutDistance.distanceCents).toBe(0);
    expect(withoutDistance.assumptions.some((line) => line.includes("Distância não considerada"))).toBe(true);
  });

  it("clamps negative inputs instead of producing negative prices", () => {
    const price = computePrice(rule, { weightKg: -50, volumeM3: -1 });
    expect(price.weightCents).toBe(0);
    expect(price.volumeCents).toBe(0);
    expect(price.totalCents).toBeGreaterThan(0);
  });
});

describe("RBAC", () => {
  it("gives every role a declared permission set", () => {
    for (const role of ROLES) {
      expect(Array.isArray(ROLE_PERMISSIONS[role])).toBe(true);
    }
  });

  it("restricts customer portal users to read-only own resources", () => {
    expect(roleHasPermission("customer", "shipments:read")).toBe(true);
    expect(roleHasPermission("customer", "shipments:create")).toBe(false);
    expect(roleHasPermission("customer", "invoices:write")).toBe(false);
    expect(roleHasPermission("customer", "users:manage")).toBe(false);
  });

  it("does not let drivers change prices or manage users", () => {
    expect(roleHasPermission("driver", "invoices:write")).toBe(false);
    expect(roleHasPermission("driver", "users:manage")).toBe(false);
    expect(roleHasPermission("driver", "routes:optimize")).toBe(false);
    expect(roleHasPermission("driver", "pod:submit")).toBe(true);
  });

  it("limits driver transitions to field states", () => {
    expect(roleCanTransitionTo("driver", "delivered")).toBe(true);
    expect(roleCanTransitionTo("driver", "out_for_delivery")).toBe(true);
    expect(roleCanTransitionTo("driver", "confirmed")).toBe(false);
    expect(roleCanTransitionTo("driver", "cancelled")).toBe(false);
  });

  it("lets only finance manage invoicing among non-admin roles", () => {
    expect(roleHasPermission("finance", "invoices:write")).toBe(true);
    expect(roleHasPermission("dispatcher", "invoices:write")).toBe(false);
    expect(roleHasPermission("warehouse_operator", "invoices:write")).toBe(false);
  });
});

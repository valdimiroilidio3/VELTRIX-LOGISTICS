import { beforeAll, describe, expect, it } from "vitest";
import { db, ensureDatabase } from "@/lib/db";
import { createShipment, getShipmentDetail, listShipments, transitionShipment, assignShipment } from "@/lib/domain/shipments";
import { submitProofOfDelivery } from "@/lib/domain/shipments";
import { lookupTracking } from "@/lib/domain/tracking";
import { createCustomer } from "@/lib/domain/people";
import { newId } from "@/lib/ids";
import type { SessionUser } from "@/lib/auth/session";
import { permissionsForRole, type Role } from "@/lib/auth/rbac";

function makeUser(role: Role, organizationId: string, profileId: string, extra: Partial<SessionUser> = {}): SessionUser {
  return {
    id: profileId,
    email: `${role}@test.example`,
    fullName: `Test ${role}`,
    role,
    organizationId,
    organizationName: "Test Org",
    organizationDataMode: "demo",
    timezone: "Europe/Lisbon",
    currency: "EUR",
    customerId: null,
    driverId: null,
    permissions: permissionsForRole(role),
    ...extra,
  };
}

let orgA = "";
let orgB = "";
let adminA: SessionUser;
let adminB: SessionUser;
let customerA: SessionUser;
let otherCustomerId = "";
let shipmentId = "";
let trackingCode = "";

beforeAll(async () => {
  await ensureDatabase();
  const orgs = await db().all<{ id: string }>("SELECT id FROM organizations");
  orgA = orgs[0]?.id ?? "";
  expect(orgA).not.toBe("");

  // second organisation to prove isolation
  orgB = newId();
  await db().run(
    `INSERT INTO organizations (id, name, country_code, default_currency, timezone, data_mode, status, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [orgB, "Isolation Test Org", "PT", "EUR", "Europe/Lisbon", "demo", "active", new Date().toISOString(), new Date().toISOString()],
  );

  const profileFor = async (organizationId: string, role: Role, email: string, customerId: string | null = null) => {
    const id = newId();
    const nowIso = new Date().toISOString();
    await db().run(
      `INSERT INTO profiles (id, organization_id, auth_provider, email, password_hash, full_name, role, status, customer_id, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [id, organizationId, "local", email, null, `Test ${role}`, role, "active", customerId, nowIso, nowIso],
    );
    return id;
  };

  adminA = makeUser("admin", orgA, await profileFor(orgA, "admin", "isolation-admin-a@test.example"));
  adminB = makeUser("admin", orgB, await profileFor(orgB, "admin", "isolation-admin-b@test.example"));
  const customerAProfile = await profileFor(orgA, "customer", "isolation-customer-a@test.example");
  const customerBProfile = await profileFor(orgA, "customer", "isolation-customer-b@test.example");

  const customerAId = newId();
  const customerBId = newId();
  const now = new Date().toISOString();
  for (const [id, orgId, email] of [
    [customerAId, orgA, "buyer.a@test.example"],
    [customerBId, orgA, "buyer.b@test.example"],
  ] as const) {
    await db().run(
      `INSERT INTO customers (id, organization_id, customer_type, company_name, contact_name, email, billing_country_code, status, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [id, orgId, "business", `Buyer ${email}`, "Buyer", email, "PT", "active", now, now],
    );
  }
  otherCustomerId = customerBId;
  customerA = makeUser("customer", orgA, customerAProfile, { customerId: customerAId });
  void makeUser("customer", orgA, customerBProfile, { customerId: customerBId });

  const created = await createShipment(
    {
      customerId: customerAId,
      serviceType: "standard",
      priority: "normal",
      items: [{ description: "Teste de isolamento", quantity: 1, weightKg: 10 }],
      origin: { addressLine: "Rua A 1", city: "Coimbra", countryCode: "PT" },
      destination: { addressLine: "Rua B 2", city: "Lisboa", countryCode: "PT" },
      quotedAmountCents: 1000,
    },
    adminA,
  );
  shipmentId = created.id;
  trackingCode = created.trackingCode;
});

describe("organisation and resource isolation", () => {
  it("creates the shipment with a tracking code and a created event", async () => {
    const events = await db().all<{ new_status: string }>("SELECT new_status FROM shipment_events WHERE shipment_id = ?", [shipmentId]);
    expect(trackingCode).toMatch(/^VX[A-Z0-9]{10}$/);
    expect(events.map((event) => event.new_status)).toContain("pending_quote");
  });

  it("hides another organisation's shipment (404, not 403)", async () => {
    await expect(getShipmentDetail(shipmentId, orgB)).rejects.toMatchObject({ status: 404 });
    await expect(getShipmentDetail(shipmentId, orgA)).resolves.toBeTruthy();
  });

  it("scopes the list to the customer portal user", async () => {
    const own = await listShipments({ page: 1, pageSize: 50, orderBy: "created_at DESC" }, { organizationId: orgA, restrictCustomerId: customerA.customerId });
    expect(own.items.every((item) => item.customer.id === customerA.customerId)).toBe(true);

    const other = await listShipments({ page: 1, pageSize: 50, orderBy: "created_at DESC" }, { organizationId: orgA, restrictCustomerId: otherCustomerId });
    expect(other.items.some((item) => item.id === shipmentId)).toBe(false);
  });

  it("refuses to mutate a shipment from another organisation", async () => {
    await expect(
      transitionShipment({ shipmentId, toStatus: "quoted" }, adminB),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("blocks invalid transitions through the service layer", async () => {
    await expect(transitionShipment({ shipmentId, toStatus: "delivered" }, adminA)).rejects.toMatchObject({ status: 409 });
  });

  it("requires proof of delivery to reach delivered", async () => {
    for (const status of ["quoted", "confirmed", "assigned", "picked_up", "in_transit", "out_for_delivery"] as const) {
      await transitionShipment({ shipmentId, toStatus: status }, adminA);
    }
    await expect(transitionShipment({ shipmentId, toStatus: "delivered" }, adminA)).rejects.toMatchObject({ status: 409 });

    await submitProofOfDelivery(shipmentId, { receivedBy: "QA Receiver", latitude: 38.7, longitude: -9.1 }, adminA);
    const detail = await getShipmentDetail(shipmentId, orgA);
    expect(detail.shipment.status).toBe("delivered");
    expect(detail.proofOfDelivery?.received_by).toBe("QA Receiver");
  });

  it("does not expose personal data through public tracking", async () => {
    const tracking = await lookupTracking(trackingCode);
    expect(tracking).toBeTruthy();
    const serialised = JSON.stringify(tracking);
    expect(serialised).not.toContain("buyer.a@test.example");
    expect(serialised).not.toContain("Rua A 1");
    expect(serialised).not.toContain("Rua B 2");
    expect(tracking?.origin).toEqual({ city: "Coimbra", country: "PT" });
    // completed shipments must not show a delivery estimate
    expect(tracking?.estimatedDeliveryAt).toBeNull();
  });

  it("returns null for unknown tracking codes without leaking existence", async () => {
    expect(await lookupTracking("VXZZZZZZZZZZ")).toBeNull();
    expect(await lookupTracking("1")).toBeNull();
  });

  it("rejects assignments with insufficient vehicle capacity", async () => {
    const customer = await createCustomer(orgA, {
      customerType: "business",
      companyName: "Heavy Load Lda",
      contactName: "Carga Pesada",
      email: `heavy-${Date.now()}@test.example`,
      billingCountryCode: "PT",
    }, adminA);

    const heavy = await createShipment(
      {
        customerId: customer.id,
        serviceType: "freight",
        priority: "normal",
        items: [{ description: "Carga pesada", quantity: 1, weightKg: 50000 }],
        origin: { addressLine: "Rua C 3", city: "Porto", countryCode: "PT" },
        destination: { addressLine: "Rua D 4", city: "Faro", countryCode: "PT" },
        quotedAmountCents: 5000,
      },
      adminA,
    );

    const driver = await db().get<{ id: string }>("SELECT id FROM drivers WHERE organization_id = ? LIMIT 1", [orgA]);
    const vehicle = await db().get<{ id: string }>("SELECT id FROM vehicles WHERE organization_id = ? ORDER BY capacity_weight_kg ASC LIMIT 1", [orgA]);
    expect(driver).toBeTruthy();
    expect(vehicle).toBeTruthy();

    await expect(
      assignShipment(heavy.id, { driverId: driver!.id, vehicleId: vehicle!.id }, adminA),
    ).rejects.toMatchObject({ status: 409 });
  });
});

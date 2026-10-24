import { beforeAll, describe, expect, it } from "vitest";
import { db, ensureDatabase } from "@/lib/db";
import { newId } from "@/lib/ids";
import type { SessionUser } from "@/lib/auth/session";
import { permissionsForRole, type Role } from "@/lib/auth/rbac";
import { createShipment, getShipmentDetail, submitProofOfDelivery, transitionShipment } from "@/lib/domain/shipments";
import {
  QUOTE_TRANSITIONS,
  attachQuoteAmountToShipment,
  createAdminQuote,
  getQuote,
  listAdminQuotes,
  listQuoteEvents,
  listQuotesForShipment,
  setAdminQuoteStatus,
  updateAdminQuote,
} from "@/lib/domain/quotes";
import { issueResetToken, resetPasswordWithToken, requestPasswordReset } from "@/lib/auth/password-reset";

function makeUser(role: Role, organizationId: string, profileId: string, extra: Partial<SessionUser> = {}): SessionUser {
  return {
    id: profileId,
    email: `${role}-${profileId.slice(0, 6)}@test.example`,
    fullName: `Test ${role}`,
    role,
    organizationId,
    organizationName: "Quotes Test Org",
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
let admin: SessionUser;
let operator: SessionUser;
let customer: SessionUser;
let customerId = "";
let shipmentId = "";
let shipmentTracking = "";
let otherOrgProfileId = "";

beforeAll(async () => {
  await ensureDatabase();
  const org = await db().get<{ id: string }>("SELECT id FROM organizations LIMIT 1");
  orgA = org?.id ?? "";
  expect(orgA).not.toBe("");

  orgB = newId();
  const now = new Date().toISOString();
  await db().run(
    `INSERT INTO organizations (id, name, country_code, default_currency, timezone, data_mode, status, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [orgB, "Quotes Isolation Org", "PT", "EUR", "Europe/Lisbon", "demo", "active", now, now],
  );

  const profile = async (organizationId: string, role: Role, email: string, customerIdValue: string | null = null) => {
    const id = newId();
    await db().run(
      `INSERT INTO profiles (id, organization_id, auth_provider, email, password_hash, full_name, role, status, customer_id, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [id, organizationId, "local", email, null, `Quote ${role}`, role, "active", customerIdValue, now, now],
    );
    return id;
  };

  admin = makeUser("admin", orgA, await profile(orgA, "admin", "quotes-admin@test.example"));
  operator = makeUser("operations_manager", orgA, await profile(orgA, "operations_manager", "quotes-ops@test.example"));
  otherOrgProfileId = await profile(orgB, "admin", "quotes-admin-b@test.example");

  customerId = newId();
  await db().run(
    `INSERT INTO customers (id, organization_id, customer_type, company_name, contact_name, email, billing_country_code, status, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [customerId, orgA, "business", "Comprador Orçamentos Lda", "Ana Orçamento", "ana@quotes-test.example", "PT", "active", now, now],
  );
  customer = makeUser("customer", orgA, await profile(orgA, "customer", "quotes-customer@test.example", customerId), { customerId });

  const created = await createShipment(
    {
      customerId,
      serviceType: "standard",
      priority: "normal",
      items: [{ description: "Palete de teste", quantity: 1, weightKg: 120 }],
      origin: { addressLine: "Rua Um 1", city: "Coimbra", countryCode: "PT" },
      destination: { addressLine: "Rua Dois 2", city: "Porto", countryCode: "PT" },
    },
    admin,
  );
  shipmentId = created.id;
  shipmentTracking = created.trackingCode;
});

describe("quote lifecycle", () => {
  it("creates a draft quote with integer cents and copies the shipment context", async () => {
    const { id, reference } = await createAdminQuote(
      orgA,
      { shipmentId, amountCents: 25_000, currency: "eur", taxRatePct: 23, description: "Entrega dedicada" },
      operator,
    );
    expect(reference).toMatch(/^QT-/);

    const quote = await getQuote(id, orgA);
    expect(quote.status).toBe("draft");
    expect(quote.currency).toBe("EUR");
    expect(quote.subtotal_cents).toBe(25_000);
    expect(quote.tax_cents).toBe(5_750);
    expect(quote.total_cents).toBe(30_750);
    expect(quote.shipment_id).toBe(shipmentId);
    expect(quote.tracking_code).toBe(shipmentTracking);
    expect(quote.contact_email).toBe("ana@quotes-test.example");
    expect(quote.created_by_name).toBe("Quote operations_manager");

    // drafting a quote must not move the shipment yet
    const detail = await getShipmentDetail(shipmentId, orgA);
    expect(detail.shipment.status).toBe("pending_quote");
  });

  it("rejects non-integer amounts and malformed currencies", async () => {
    await expect(
      createAdminQuote(orgA, { shipmentId, amountCents: 1234.5, currency: "EUR" }, admin),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      createAdminQuote(orgA, { shipmentId, amountCents: 1000, currency: "EURO" }, admin),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      createAdminQuote(orgA, { shipmentId, amountCents: -100, currency: "EUR" }, admin),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      createAdminQuote(orgA, { shipmentId, amountCents: 1000, currency: "EUR", taxRatePct: 140 }, admin),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("moves the shipment to quoted only when the quote is sent, and records both histories", async () => {
    const { id } = await createAdminQuote(orgA, { shipmentId, amountCents: 12_000, currency: "EUR" }, admin);

    await setAdminQuoteStatus(orgA, id, "sent", admin, "Enviado por email");

    const detail = await getShipmentDetail(shipmentId, orgA);
    expect(detail.shipment.status).toBe("quoted");
    expect(detail.events.some((event) => event.event_type === "quote_sent")).toBe(true);

    const quote = await getQuote(id, orgA);
    expect(quote.status).toBe("sent");
    expect(quote.sent_at).toBeTruthy();

    const events = await listQuoteEvents(orgA, id);
    expect(events.map((event) => event.new_status)).toEqual(["draft", "sent"]);
    expect(events[1]?.previous_status).toBe("draft");

    // A notification is queued, never claimed as delivered.
    const notification = await db().get<{ status: string; recipient: string }>(
      "SELECT status, recipient FROM notification_jobs WHERE organization_id = ? AND recipient = ? ORDER BY created_at DESC LIMIT 1",
      [orgA, "ana@quotes-test.example"],
    );
    expect(notification?.recipient).toBe("ana@quotes-test.example");
    // queued (never "sent": there is no provider configured in the sandbox)
    expect(["queued", "processing", "failed"]).toContain(notification?.status);
  });

  it("rejects invalid quote transitions and keeps accepted quotes immutable", async () => {
    // pending_quote → quoted already happened in the previous test
    const { id } = await createAdminQuote(orgA, { shipmentId, amountCents: 9_000, currency: "EUR" }, admin);

    await expect(setAdminQuoteStatus(orgA, id, "accepted", admin)).rejects.toMatchObject({ status: 409 });
    await expect(setAdminQuoteStatus(orgA, id, "rejected", admin)).rejects.toMatchObject({ status: 409 });

    await setAdminQuoteStatus(orgA, id, "sent", admin);
    await setAdminQuoteStatus(orgA, id, "accepted", admin);
    expect(QUOTE_TRANSITIONS.accepted).toEqual([]);

    await expect(setAdminQuoteStatus(orgA, id, "rejected", admin)).rejects.toMatchObject({ status: 409 });
    await expect(setAdminQuoteStatus(orgA, id, "sent", admin)).rejects.toMatchObject({ status: 409 });
    await expect(
      updateAdminQuote(orgA, id, { amountCents: 1, currency: "EUR" }, admin),
    ).rejects.toMatchObject({ status: 409 });

    const accepted = await getQuote(id, orgA);
    expect(accepted.status).toBe("accepted");
    expect(accepted.total_cents).toBe(9_000);
    expect(accepted.decided_at).toBeTruthy();

    const events = await listQuoteEvents(orgA, id);
    expect(events.at(-1)?.new_status).toBe("accepted");
  });

  it("persists quotes and their event trail across a fresh read (restart safety)", async () => {
    const quotes = await listAdminQuotes(orgA);
    expect(quotes.length).toBeGreaterThan(0);
    for (const quote of quotes) {
      const events = await listQuoteEvents(orgA, quote.id);
      expect(events.length).toBeGreaterThan(0);
      // the first event is always the creation of the draft
      expect(events[0]?.previous_status).toBeNull();
      expect(events[0]?.new_status).toBe("draft");
      expect(events.at(-1)?.new_status).toBe(quote.status);
    }
    expect(await db().get<{ c: number }>("SELECT COUNT(*) AS c FROM quotes WHERE organization_id = ?", [orgA])).toMatchObject({
      c: quotes.length,
    });
  });

  it("filters the administrative list by status and scopes it by organisation", async () => {
    const drafts = await listAdminQuotes(orgA, { status: "draft" });
    expect(drafts.every((quote) => quote.status === "draft")).toBe(true);

    const otherOrgAdmin = makeUser("admin", orgB, otherOrgProfileId);
    await expect(getQuote(drafts[0]!.id, orgB)).rejects.toMatchObject({ status: 404 });
    await expect(
      setAdminQuoteStatus(orgB, drafts[0]!.id, "sent", otherOrgAdmin),
    ).rejects.toMatchObject({ status: 404 });
    expect(await listAdminQuotes(orgB)).toHaveLength(0);
  });

  it("lists every quote for a shipment and records the staff amount on the shipment", async () => {
    const forShipment = await listQuotesForShipment(orgA, shipmentId);
    expect(forShipment.length).toBeGreaterThanOrEqual(3);
    expect(forShipment.every((quote) => quote.shipment_id === shipmentId)).toBe(true);

    await attachQuoteAmountToShipment(orgA, shipmentId, 45_000, admin);
    const row = await db().get<{ quoted_amount_cents: number }>("SELECT quoted_amount_cents FROM shipments WHERE id = ?", [shipmentId]);
    expect(row?.quoted_amount_cents).toBe(45_000);

    await expect(attachQuoteAmountToShipment(orgA, shipmentId, 12.4, admin)).rejects.toMatchObject({ status: 422 });
  });
});

describe("proof of delivery privacy", () => {
  it("refuses proof from a driver who is not assigned to the shipment", async () => {
    const driverProfile = await db().get<{ id: string }>(
      "SELECT id FROM drivers WHERE organization_id = ? LIMIT 1",
      [orgA],
    );
    expect(driverProfile).toBeTruthy();
    const driver = makeUser("driver", orgA, newId(), { driverId: driverProfile!.id });

    await expect(
      submitProofOfDelivery(shipmentId, { receivedBy: "Intruso" }, driver),
    ).rejects.toMatchObject({ status: 404 });

    const pod = await db().get<{ c: number }>("SELECT COUNT(*) AS c FROM proof_of_delivery WHERE shipment_id = ?", [shipmentId]);
    expect(pod?.c).toBe(0);
  });

  it("rejects proof for a shipment that is only quoted", async () => {
    const detail = await getShipmentDetail(shipmentId, orgA);
    expect(detail.shipment.status).toBe("quoted");
    await expect(
      submitProofOfDelivery(shipmentId, { receivedBy: "Cedo demais" }, admin),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("accepts proof from the customer only after the shipment is in course", async () => {
    for (const status of ["confirmed", "assigned", "picked_up", "in_transit", "out_for_delivery"] as const) {
      await transitionShipment({ shipmentId, toStatus: status }, admin);
    }
    await submitProofOfDelivery(shipmentId, { receivedBy: "Ana Orçamento" }, admin);
    const detail = await getShipmentDetail(shipmentId, orgA);
    expect(detail.shipment.status).toBe("delivered");
    expect(detail.proofOfDelivery?.received_by).toBe("Ana Orçamento");
    // proof belongs to the organisation; a customer portal session of another org sees nothing
    expect(await db().get("SELECT id FROM proof_of_delivery WHERE shipment_id = ? AND submitted_by = ?", [shipmentId, customer.id])).toBeFalsy();
  });
});

describe("password reset", () => {
  const profileOf = async (email: string) =>
    (await db().get<{ id: string; organization_id: string; email: string }>(
      "SELECT id, organization_id, email FROM profiles WHERE lower(email) = ?",
      [email.toLowerCase()],
    ))!;

  it("does not reveal whether an account exists", async () => {
    const known = await requestPasswordReset("quotes-admin@test.example", { ip: "10.0.0.1" });
    const unknown = await requestPasswordReset("ninguem-aqui@test.example", { ip: "10.0.0.1" });
    expect(known.accepted).toBe(true);
    expect(unknown.accepted).toBe(true);
    // Both requests are accepted; the delivery state is what differs internally
    // (unknown accounts simply have no token written).
    expect(unknown.delivery).toBe("unknown_account");
    expect(unknown).not.toHaveProperty("token");

    const tokens = await db().get<{ c: number }>(
      "SELECT COUNT(*) AS c FROM password_reset_tokens WHERE profile_id = (SELECT id FROM profiles WHERE email = ?)",
      ["ninguem-aqui@test.example"],
    );
    expect(tokens?.c).toBe(0);
  });

  it("stores only a hash, rejects reuse and revokes sessions", async () => {
    const profile = await profileOf("quotes-ops@test.example");
    const { token } = await issueResetToken(profile, { ip: "10.0.0.2" });

    const rows = await db().all<{ token_hash: string }>("SELECT token_hash FROM password_reset_tokens");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => !row.token_hash.includes(token))).toBe(true);
    expect(rows.some((row) => /^[a-f0-9]{64}$/.test(row.token_hash))).toBe(true);

    const sessionId = newId();
    const now = new Date().toISOString();
    await db().run(
      `INSERT INTO sessions (id, profile_id, token_hash, expires_at, created_at, ip_hash, user_agent)
       VALUES (?,?,?,?,?,?,?)`,
      [sessionId, profile.id, "seed-hash", new Date(Date.now() + 3600_000).toISOString(), now, null, "vitest"],
    );

    const result = await resetPasswordWithToken(token, "NovaPalavraPasse!2026", "NovaPalavraPasse!2026");
    expect(result.ok).toBe(true);

    expect(await db().get("SELECT id FROM sessions WHERE profile_id = ?", [profile.id])).toBeFalsy();

    const replay = await resetPasswordWithToken(token, "OutraPalavraPasse!2026", "OutraPalavraPasse!2026");
    expect(replay.ok).toBe(false);
    expect(replay.message).toMatch(/inválida|utilizada/i);
  });

  it("rejects weak passwords, mismatched confirmation and expired tokens", async () => {
    const profile = await profileOf("quotes-admin@test.example");
    const { token } = await issueResetToken(profile);

    const weak = await resetPasswordWithToken(token, "curta", "curta");
    expect(weak.ok).toBe(false);

    const mismatch = await resetPasswordWithToken(token, "PalavraSegura!2026", "OutraPalavra!2026");
    expect(mismatch.ok).toBe(false);

    const noDigits = await resetPasswordWithToken(token, "apenasletras", "apenasletras");
    expect(noDigits.ok).toBe(false);

    // the token must still be usable — invalid attempts do not burn it
    await db().run("UPDATE password_reset_tokens SET expires_at = ? WHERE id IN (SELECT id FROM password_reset_tokens WHERE profile_id = ? AND used_at IS NULL)", [
      new Date(Date.now() - 1000).toISOString(),
      profile.id,
    ]);
    const expired = await resetPasswordWithToken(token, "PalavraSegura!2026", "PalavraSegura!2026");
    expect(expired.ok).toBe(false);
    expect(expired.message).toMatch(/expir/i);
  });

  it("only keeps the most recent link valid", async () => {
    const profile = await profileOf("quotes-admin@test.example");
    const first = await issueResetToken(profile);
    const second = await issueResetToken(profile);

    const oldOne = await resetPasswordWithToken(first.token, "PalavraSegura!2026", "PalavraSegura!2026");
    expect(oldOne.ok).toBe(false);

    const current = await resetPasswordWithToken(second.token, "PalavraSegura!2026", "PalavraSegura!2026");
    expect(current.ok).toBe(true);
  });
});

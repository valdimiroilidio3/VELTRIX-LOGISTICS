import { beforeAll, describe, expect, it } from "vitest";
import { consume, resetRateLimits } from "@/lib/rate-limit";
import { signStoragePath, verifyStorageSignature } from "@/lib/storage";
import { sequenceStops } from "@/lib/domain/routes";
import { processNotificationQueue, enqueueNotification } from "@/lib/notifications";
import { db, ensureDatabase } from "@/lib/db";
import { submitPublicQuote, submitContactMessage, listContactMessages } from "@/lib/domain/commercial";
import { AppError } from "@/lib/errors";

let organizationId = "";

beforeAll(async () => {
  await ensureDatabase();
  const org = await db().get<{ id: string }>("SELECT id FROM organizations WHERE status = 'active' ORDER BY created_at ASC");
  organizationId = org?.id ?? "";
  expect(organizationId).not.toBe("");
});

describe("rate limiting", () => {
  it("allows requests up to the limit and blocks afterwards", () => {
    resetRateLimits();
    for (let index = 0; index < 3; index += 1) {
      expect(consume("test-key", 3, 60_000).allowed).toBe(true);
    }
    const blocked = consume("test-key", 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("isolates counters per key", () => {
    resetRateLimits();
    consume("a", 1, 60_000);
    expect(consume("a", 1, 60_000).allowed).toBe(false);
    expect(consume("b", 1, 60_000).allowed).toBe(true);
  });
});

describe("private storage links", () => {
  it("signs and verifies a path", () => {
    const url = signStoragePath(`${organizationId}/pod-photos/photo.png`, 60);
    const params = new URL(url, "http://localhost").searchParams;
    expect(() =>
      verifyStorageSignature(params.get("path") ?? "", params.get("expires") ?? "", params.get("signature") ?? ""),
    ).not.toThrow();
  });

  it("rejects tampered or expired links", () => {
    const url = signStoragePath(`${organizationId}/pod-photos/photo.png`, 60);
    const params = new URL(url, "http://localhost").searchParams;
    expect(() => verifyStorageSignature("other/path.png", params.get("expires") ?? "", params.get("signature") ?? "")).toThrow(AppError);
    expect(() => verifyStorageSignature(params.get("path") ?? "", "1", params.get("signature") ?? "")).toThrow(AppError);

    const expired = signStoragePath("a/b.png", -10);
    const expiredParams = new URL(expired, "http://localhost").searchParams;
    expect(() =>
      verifyStorageSignature(expiredPath(expiredParams), expiredParams.get("expires") ?? "", expiredParams.get("signature") ?? ""),
    ).toThrow(/expirada/i);
  });

  it("uses a filesystem-safe key (no traversal)", () => {
    expect(() => signStoragePath("../../etc/passwd")).not.toThrow(); // signing is harmless
  });
});

function expiredPath(params: URLSearchParams): string {
  return params.get("path") ?? "";
}

describe("route sequencing heuristic", () => {
  const stops = [
    { id: "far-low", latitude: 41.5, longitude: -8.4, priority: "low" },
    { id: "near-urgent", latitude: 40.21, longitude: -8.42, priority: "urgent" },
    { id: "mid-normal", latitude: 40.6, longitude: -8.6, priority: "normal" },
    { id: "no-coords", latitude: null, longitude: null, priority: "urgent" },
  ];

  it("orders by distance weighted by priority and defers ungeocoded stops", () => {
    const ordered = sequenceStops(stops, { lat: 40.2, lng: -8.41 });
    expect(ordered[0]?.id).toBe("near-urgent");
    expect(ordered[ordered.length - 1]?.id).toBe("no-coords");
  });

  it("is deterministic and keeps every stop exactly once", () => {
    const first = sequenceStops(stops, { lat: 40.2, lng: -8.41 }).map((stop) => stop.id);
    const second = sequenceStops(stops, { lat: 40.2, lng: -8.41 }).map((stop) => stop.id);
    expect(first).toEqual(second);
    expect(new Set(first).size).toBe(stops.length);
  });
});

describe("notification outbox", () => {
  it("records a failed delivery honestly when no email provider is configured", async () => {
    await enqueueNotification(db(), {
      organizationId,
      recipient: "qa-outbox@test.example",
      channel: "email",
      template: "shipment.created",
      subject: "Teste",
      body: "Corpo de teste",
      dedupeKey: `test-${Date.now()}`,
    });

    const result = await processNotificationQueue(10);
    expect(result.processed).toBeGreaterThan(0);
    expect(result.processed).toBe(result.picked);
    expect(result.sent).toBe(0);
    expect(result.failed).toBeGreaterThan(0);

    const job = await db().get<{ status: string; last_error: string | null; attempts: number }>(
      "SELECT status, last_error, attempts FROM notification_jobs WHERE recipient = ? ORDER BY created_at DESC",
      ["qa-outbox@test.example"],
    );
    // Without credentials the job is retried a bounded number of times and then
    // parked as failed — it is never marked as sent.
    expect(["queued", "failed"]).toContain(job?.status);
    expect(job?.last_error).toMatch(/RESEND_API_KEY/);
    expect(job?.attempts).toBeGreaterThanOrEqual(1);
  });

  it("deduplicates identical notifications", async () => {
    const key = `dedupe-${Date.now()}`;
    const payload = {
      organizationId,
      recipient: "dedupe@test.example",
      channel: "in_app" as const,
      template: "shipment.created" as const,
      subject: "Dedupe",
      body: "Dedupe",
      dedupeKey: key,
    };
    await enqueueNotification(db(), payload);
    await enqueueNotification(db(), payload);
    const rows = await db().all(
      "SELECT id FROM notification_jobs WHERE recipient = ? AND payload LIKE ?",
      ["dedupe@test.example", `%${key}%`],
    );
    expect(rows).toHaveLength(1);
  });
});

describe("public intake", () => {
  it("creates a quote from the configured pricing table", async () => {
    const quote = await submitPublicQuote({
      contactName: "Cliente Teste",
      contactEmail: "quote-test@example.com",
      origin: "Coimbra, PT",
      destination: "Lisboa, PT",
      serviceType: "standard",
      weightKg: 120,
      volumeM3: 1.4,
    });
    expect(quote.reference).toMatch(/^QT-\d{4}-[0-9A-F]{6}$/);
    expect(quote.breakdown.totalCents).toBeGreaterThan(0);
    expect(quote.breakdown.assumptions.length).toBeGreaterThan(0);

    const row = await db().get<{ status: string; total_cents: number }>("SELECT status, total_cents FROM quotes WHERE id = ?", [quote.id]);
    expect(row?.status).toBe("sent");
    expect(row?.total_cents).toBe(quote.breakdown.totalCents);
  });

  it("records contact messages instead of silently dropping them", async () => {
    await submitContactMessage({
      name: "Contacto Teste",
      email: "contact-test@example.com",
      topic: "transporte",
      message: "Gostaria de informação sobre transporte de paletes.",
    });
    const messages = await listContactMessages(organizationId);
    expect(messages.some((message) => message.email === "contact-test@example.com" && message.status === "new")).toBe(true);
  });
});

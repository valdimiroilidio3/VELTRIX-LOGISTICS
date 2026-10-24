import { randomBytes, randomUUID, createHash } from "node:crypto";

export function newId(): string {
  return randomUUID();
}

const TRACKING_ALPHABET = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I/O to avoid confusion

/**
 * Tracking codes must be hard to enumerate: 10 random characters from a
 * 32-symbol alphabet (~50 bits) plus a readable prefix. The public tracking
 * endpoint is additionally rate limited and returns only whitelisted fields.
 */
export function newTrackingCode(): string {
  const bytes = randomBytes(10);
  let code = "";
  for (const byte of bytes) {
    code += TRACKING_ALPHABET[byte % TRACKING_ALPHABET.length];
  }
  return `VX${code}`;
}

export function newReference(prefix: string): string {
  const year = new Date().getUTCFullYear();
  return `${prefix}-${year}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Deterministic ids for seed data and tests (UUID-shaped, never used in live orgs). */
export function demoId(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

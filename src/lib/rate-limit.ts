/**
 * Fixed-window in-memory rate limiter.
 *
 * Limitation (documented in docs/SECURITY.md): the counter lives in the
 * process memory, so on a multi-instance deployment each instance keeps its
 * own window. For strict global limits, back this with Upstash Redis / Vercel KV
 * by swapping `consume` for a Redis INCR implementation — the interface is kept
 * deliberately tiny for that reason.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function consume(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }
  existing.count += 1;
  const allowed = existing.count <= limit;
  return { allowed, remaining: Math.max(0, limit - existing.count), resetAt: existing.resetAt };
}

/** Removes expired buckets; called opportunistically to keep memory bounded. */
export function sweep(): void {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

let lastSweep = 0;
export function consumeWithSweep(key: string, limit: number, windowMs: number): RateLimitResult {
  if (Date.now() - lastSweep > 60_000) {
    sweep();
    lastSweep = Date.now();
  }
  return consume(key, limit, windowMs);
}

export function resetRateLimits(): void {
  buckets.clear();
}

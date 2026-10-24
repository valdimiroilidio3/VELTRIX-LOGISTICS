import { NextResponse, type NextRequest } from "next/server";
import { processNotificationQueue } from "@/lib/notifications";
import { env } from "@/lib/env";
import { createHmac, timingSafeEqual } from "node:crypto";

export const dynamic = "force-dynamic";

/**
 * Drains the notification outbox. Protected by a shared secret header so it can
 * be called by a scheduler (Vercel Cron sends the CRON_SECRET as a bearer token).
 * Repeated invocations are safe: only due jobs are processed, each with an
 * attempt counter, so a double fire does not duplicate sends for sent jobs.
 */
export async function GET(request: NextRequest) {
  const secret = env.authSecret;
  if (!secret) {
    return NextResponse.json({ error: "AUTH_SECRET não configurado" }, { status: 503 });
  }
  const provided =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    request.headers.get("x-cron-secret") ??
    "";
  const expected = createHmac("sha256", secret).update("cron:notifications").digest("hex");
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const result = await processNotificationQueue(50);
  return NextResponse.json({ ok: true, ...result });
}

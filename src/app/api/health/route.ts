import { NextResponse } from "next/server";
import { db, ensureDatabase } from "@/lib/db";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Readiness probe: verifies the database answers and reports the active data mode. */
export async function GET() {
  const startedAt = Date.now();
  try {
    await ensureDatabase();
    const row = await db().get<{ ok: number }>("SELECT 1 AS ok");
    return NextResponse.json({
      status: "ok",
      database: row?.ok === 1 ? "reachable" : "unexpected",
      dialect: env.dataMode,
      environment: env.nodeEnv,
      latencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      { status: "degraded", database: "unreachable", dialect: env.dataMode, timestamp: new Date().toISOString() },
      { status: 503 },
    );
  }
}

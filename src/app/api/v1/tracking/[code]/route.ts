import { NextResponse, type NextRequest } from "next/server";
import { lookupTracking } from "@/lib/domain/tracking";
import { clientIp, ok, withApi, routeParam } from "@/lib/api/http";
import { tooManyRequests, AppError } from "@/lib/errors";
import { consumeWithSweep } from "@/lib/rate-limit";

/**
 * Public tracking endpoint.
 * - 30 requests / minute / IP, plus a stricter per-code limit to slow down
 *   enumeration attempts against a valid code.
 * - Returns only the allowlisted payload from lib/domain/tracking.ts.
 * - Always 404-shaped for unknown codes (no distinction between formats).
 */
export const GET = withApi(async (request: NextRequest, context) => {
  const code = (await routeParam(context, "code")).toUpperCase();
  const ip = clientIp(request);

  if (!consumeWithSweep(`tracking:ip:${ip}`, 30, 60_000).allowed) throw tooManyRequests();
  if (code && !consumeWithSweep(`tracking:code:${code}`, 10, 60_000).allowed) throw tooManyRequests();

  const result = await lookupTracking(code);
  if (!result) {
    throw new AppError("Código de rastreio não encontrado.", 404, "not_found");
  }
  const response = ok(result);
  response.headers.set("Cache-Control", "no-store");
  return response;
});

export const POST = withApi(async (request: NextRequest) => {
  const ip = clientIp(request);
  if (!consumeWithSweep(`tracking:post:${ip}`, 15, 60_000).allowed) throw tooManyRequests();
  const body = (await request.json().catch(() => ({}))) as { code?: string };
  if (!body.code || typeof body.code !== "string") {
    return NextResponse.json({ error: { code: "validation_error", message: "Indique o código de rastreio." } }, { status: 422 });
  }
  const result = await lookupTracking(body.code);
  if (!result) throw new AppError("Código de rastreio não encontrado.", 404, "not_found");
  return ok(result);
});


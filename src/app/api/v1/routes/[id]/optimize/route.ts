import type { NextRequest } from "next/server";
import { ok, requireApiPermission, withApi, routeParam } from "@/lib/api/http";
import { routeOptimizeSchema } from "@/lib/validation/schemas";
import { optimizeRoute } from "@/lib/domain/routes";

export const POST = withApi(async (request: NextRequest, context) => {
  const user = await requireApiPermission("routes:optimize");
  const id = await routeParam(context, "id");
  const body = await request.json().catch(() => ({}));
  const parsed = routeOptimizeSchema.parse(body);
  const result = await optimizeRoute(id, user, {
    startLatitude: parsed.startLatitude,
    startLongitude: parsed.startLongitude,
  });
  return ok(result);
});

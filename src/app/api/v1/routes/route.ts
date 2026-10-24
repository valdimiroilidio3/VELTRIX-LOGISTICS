import type { NextRequest } from "next/server";
import { created, ok, requireApiPermission, withApi } from "@/lib/api/http";
import { routeSchema } from "@/lib/validation/schemas";
import { createRoute, listRoutes } from "@/lib/domain/routes";

export const GET = withApi(async () => {
  const user = await requireApiPermission("routes:read");
  return ok(await listRoutes(user.organizationId));
});

export const POST = withApi(async (request: NextRequest) => {
  const user = await requireApiPermission("routes:write");
  const parsed = routeSchema.parse(await request.json());
  const result = await createRoute(
    {
      routeDate: parsed.routeDate,
      name: parsed.name || undefined,
      driverId: parsed.driverId ?? null,
      vehicleId: parsed.vehicleId ?? null,
      shipmentIds: parsed.shipmentIds,
    },
    user,
  );
  return created(result);
});

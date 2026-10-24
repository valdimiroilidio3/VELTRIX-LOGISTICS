import type { NextRequest } from "next/server";
import { ok, requireApiPermission, withApi } from "@/lib/api/http";
import { getWarehouseOverview } from "@/lib/domain/warehouse";

/**
 * Warehouse zones with occupancy.
 * Occupancy is registered manually by operators (no sensor integration): the
 * payload states its source so consumers never mistake it for telemetry.
 */
export const GET = withApi(async (request: NextRequest) => {
  const user = await requireApiPermission("warehouse:read");
  const overview = await getWarehouseOverview(user.organizationId);
  const zones = request.nextUrl.searchParams.get("zoneType")
    ? overview.zones.filter((zone) => zone.zoneType === request.nextUrl.searchParams.get("zoneType"))
    : overview.zones;
  return ok(zones, { warehouse: overview.warehouse?.name ?? null, occupancySource: "manual" });
});

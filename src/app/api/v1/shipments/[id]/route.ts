import type { NextRequest } from "next/server";
import { ok, requireApiPermission, withApi, routeParam } from "@/lib/api/http";
import { getShipmentDetail } from "@/lib/domain/shipments";
import { forbidden } from "@/lib/errors";

export const GET = withApi(async (_request: NextRequest, context) => {
  const user = await requireApiPermission("shipments:read");
  const id = await routeParam(context, "id");
  if (!id) throw forbidden();

  const detail = await getShipmentDetail(id, user.organizationId, {
    customerId: user.role === "customer" ? user.customerId : null,
    driverId: user.role === "driver" ? user.driverId : null,
  });
  return ok(detail);
});

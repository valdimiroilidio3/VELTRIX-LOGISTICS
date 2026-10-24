import type { NextRequest } from "next/server";
import { clientIp, ok, requireApiPermission, withApi, routeParam } from "@/lib/api/http";
import { transitionSchema } from "@/lib/validation/schemas";
import { transitionShipment } from "@/lib/domain/shipments";

export const POST = withApi(async (request: NextRequest, context) => {
  const user = await requireApiPermission("shipments:transition");
  const id = await routeParam(context, "id");
  const parsed = transitionSchema.parse(await request.json());
  const result = await transitionShipment({ shipmentId: id, ...parsed }, user, { ip: clientIp(request) });
  return ok(result);
});

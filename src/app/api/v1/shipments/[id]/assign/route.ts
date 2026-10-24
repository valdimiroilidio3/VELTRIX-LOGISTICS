import type { NextRequest } from "next/server";
import { clientIp, ok, requireApiPermission, withApi, routeParam } from "@/lib/api/http";
import { assignSchema } from "@/lib/validation/schemas";
import { assignShipment } from "@/lib/domain/shipments";

export const POST = withApi(async (request: NextRequest, context) => {
  const user = await requireApiPermission("shipments:assign");
  const id = await routeParam(context, "id");
  const parsed = assignSchema.parse(await request.json());
  const result = await assignShipment(id, parsed, user, { ip: clientIp(request) });
  return ok(result);
});

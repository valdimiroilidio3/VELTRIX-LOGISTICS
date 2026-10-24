import type { NextRequest } from "next/server";
import { z } from "zod";
import { created, ok, requireApiPermission, withApi, routeParam } from "@/lib/api/http";
import { getShipmentDetail } from "@/lib/domain/shipments";
import { addShipmentEvent } from "@/lib/domain/shipments";

const schema = z.object({
  eventType: z.string().trim().min(3).max(60),
  description: z.string().trim().min(3).max(500),
  location: z.string().trim().max(160).optional(),
  latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
  longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
});

export const GET = withApi(async (_request: NextRequest, context) => {
  const user = await requireApiPermission("shipments:read");
  const id = await routeParam(context, "id");
  const detail = await getShipmentDetail(id, user.organizationId, {
    customerId: user.role === "customer" ? user.customerId : null,
    driverId: user.role === "driver" ? user.driverId : null,
  });
  return ok(detail.events);
});

export const POST = withApi(async (request: NextRequest, context) => {
  const user = await requireApiPermission("shipments:update");
  const id = await routeParam(context, "id");
  const parsed = schema.parse(await request.json());
  return created(await addShipmentEvent(id, parsed, user));
});

import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, requireApiPermission, withApi, routeParam } from "@/lib/api/http";
import { setZoneOccupancy } from "@/lib/domain/warehouse";

const schema = z.object({
  occupiedPallets: z.coerce.number().int().min(0).max(100_000),
  reason: z.string().trim().min(5).max(300),
});

export const POST = withApi(async (request: NextRequest, context) => {
  const user = await requireApiPermission("warehouse:write");
  const id = await routeParam(context, "id");
  const parsed = schema.parse(await request.json());
  return ok(await setZoneOccupancy(id, parsed.occupiedPallets, user, parsed.reason));
});

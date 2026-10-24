import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, requireApiPermission, withApi, routeParam } from "@/lib/api/http";
import { updateRouteStatus } from "@/lib/domain/routes";

const schema = z.object({ status: z.enum(["draft", "planned", "dispatched", "in_progress", "completed", "cancelled"]) });

export const POST = withApi(async (request: NextRequest, context) => {
  const user = await requireApiPermission("routes:write");
  const id = await routeParam(context, "id");
  const parsed = schema.parse(await request.json());
  return ok(await updateRouteStatus(id, parsed.status, user));
});

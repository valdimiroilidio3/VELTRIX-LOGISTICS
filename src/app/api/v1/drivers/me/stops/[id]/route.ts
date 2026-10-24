import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, requireApiPermission, withApi, routeParam } from "@/lib/api/http";
import { updateStopStatus } from "@/lib/domain/shipments";

const schema = z.object({ status: z.enum(["en_route", "arrived", "completed", "failed"]) });

export const PATCH = withApi(async (request: NextRequest, context) => {
  const user = await requireApiPermission("tasks:read_own");
  const id = await routeParam(context, "id");
  const parsed = schema.parse(await request.json());
  return ok(await updateStopStatus(id, parsed.status, user));
});

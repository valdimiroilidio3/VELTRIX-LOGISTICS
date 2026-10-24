import type { NextRequest } from "next/server";
import { ok, requireApiPermission, withApi } from "@/lib/api/http";
import { listDriverTasks } from "@/lib/domain/shipments";
import { conflict } from "@/lib/errors";

export const GET = withApi(async (_request: NextRequest) => {
  const user = await requireApiPermission("tasks:read_own");
  if (!user.driverId) throw conflict("O utilizador não está associado a um motorista.");
  return ok(await listDriverTasks(user.driverId, user.organizationId));
});

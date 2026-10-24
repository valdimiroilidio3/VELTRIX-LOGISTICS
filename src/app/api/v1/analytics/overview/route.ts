import type { NextRequest } from "next/server";
import { ok, requireApiPermission, withApi } from "@/lib/api/http";
import { getAnalyticsOverview } from "@/lib/domain/analytics";
import { z } from "zod";

const rangeSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  days: z.coerce.number().int().min(1).max(365).default(30),
});

export const GET = withApi(async (request: NextRequest) => {
  const user = await requireApiPermission("analytics:read");
  const parsed = rangeSchema.parse(Object.fromEntries(request.nextUrl.searchParams));
  const to = parsed.to ? new Date(parsed.to) : new Date();
  const from = parsed.from ? new Date(parsed.from) : new Date(to.getTime() - parsed.days * 24 * 3600_000);
  const overview = await getAnalyticsOverview(user.organizationId, { from: from.toISOString(), to: to.toISOString() });
  return ok(overview);
});

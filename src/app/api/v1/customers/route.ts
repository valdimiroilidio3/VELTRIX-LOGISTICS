import type { NextRequest } from "next/server";
import { created, ok, requireApiPermission, withApi } from "@/lib/api/http";
import { customerSchema } from "@/lib/validation/schemas";
import { createCustomer } from "@/lib/domain/people";
import { listCustomers } from "@/lib/domain/commercial";

export const GET = withApi(async (request: NextRequest) => {
  const user = await requireApiPermission("customers:read");
  const rows = await listCustomers(user.organizationId, request.nextUrl.searchParams.get("q"));
  return ok(rows, { total: rows.length });
});

export const POST = withApi(async (request: NextRequest) => {
  const user = await requireApiPermission("customers:write");
  const parsed = customerSchema.parse(await request.json());
  return created(await createCustomer(user.organizationId, parsed, user));
});

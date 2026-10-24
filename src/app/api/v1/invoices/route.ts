import type { NextRequest } from "next/server";
import { created, ok, requireApiPermission, withApi } from "@/lib/api/http";
import { createInvoice, listInvoices } from "@/lib/domain/commercial";
import { invoiceSchema } from "@/lib/validation/schemas";

export const GET = withApi(async () => {
  const user = await requireApiPermission("invoices:read");
  return ok(await listInvoices(user.organizationId));
});

export const POST = withApi(async (request: NextRequest) => {
  const user = await requireApiPermission("invoices:write");
  const parsed = invoiceSchema.parse(await request.json());
  return created(await createInvoice(user.organizationId, parsed, user));
});

import type { NextRequest } from "next/server";
import { created, ok, pagination, orderBy, requireApiPermission, withApi } from "@/lib/api/http";
import { createShipmentSchema } from "@/lib/validation/schemas";
import { createShipment, listShipments } from "@/lib/domain/shipments";
import { clientIp } from "@/lib/api/http";
import { forbidden } from "@/lib/errors";

export const GET = withApi(async (request: NextRequest) => {
  const user = await requireApiPermission("shipments:read");
  const page = pagination(request);
  const params = request.nextUrl.searchParams;
  const result = await listShipments(
    {
      status: params.get("status"),
      search: params.get("q"),
      priority: params.get("priority"),
      customerId: params.get("customerId"),
      driverId: params.get("driverId"),
      page: page.page,
      pageSize: page.pageSize,
      orderBy: orderBy("shipments", params.get("sort"), "created_at"),
    },
    {
      organizationId: user.organizationId,
      restrictCustomerId: user.role === "customer" ? user.customerId : null,
      restrictDriverId: user.role === "driver" ? user.driverId : null,
    },
  );
  return ok(result.items, { total: result.total, page: result.page, pageSize: result.pageSize, totalPages: result.totalPages });
});

export const POST = withApi(async (request: NextRequest) => {
  // Staff create orders; customer portal accounts create their own requests.
  const session = await requireApiPermission("shipments:read");
  const isCustomer = session.role === "customer";
  if (!isCustomer && !session.permissions.includes("shipments:create")) throw forbidden("Sem permissão para criar encomendas.");
  if (isCustomer && !session.permissions.includes("shipments:request")) throw forbidden("Sem permissão para criar pedidos.");
  const user = session;
  const parsed = createShipmentSchema.parse(await request.json());
  if (isCustomer && parsed.customerId !== user.customerId) {
    throw forbidden("Só pode criar pedidos para a sua própria conta.");
  }
  const result = await createShipment(parsed, user, { ip: clientIp(request) });
  return created(result);
});

import type { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth/session";
import { listShipments } from "@/lib/domain/shipments";
import { orderBy } from "@/lib/api/http";
import { writeAudit } from "@/lib/audit";
import { ensureDatabase } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Authorised CSV export. Scoped to the organisation and to the caller's permissions. */
export async function GET(request: NextRequest) {
  await ensureDatabase();
  const user = await requirePermission("shipments:read");
  const params = request.nextUrl.searchParams;

  const result = await listShipments(
    {
      status: params.get("status"),
      search: params.get("q"),
      priority: params.get("priority"),
      customerId: params.get("customerId"),
      page: 1,
      pageSize: 100,
      orderBy: orderBy("shipments", params.get("sort"), "created_at"),
    },
    {
      organizationId: user.organizationId,
      restrictCustomerId: user.role === "customer" ? user.customerId : null,
      restrictDriverId: user.role === "driver" ? user.driverId : null,
    },
  );

  await writeAudit({
    organizationId: user.organizationId,
    actorId: user.id,
    actorEmail: user.email,
    action: "shipments.exported",
    resourceType: "shipment",
    metadata: { rows: result.items.length, filters: Object.fromEntries(params) },
    ip: request.headers.get("x-forwarded-for")?.split(",")[0] ?? null,
  });

  const header = ["tracking_code", "status", "customer", "origin", "destination", "service", "priority", "created_at", "estimated_delivery_at", "quoted_amount", "currency"];
  const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const rows = result.items.map((shipment) =>
    [
      shipment.trackingCode,
      shipment.status,
      shipment.customer.name,
      `${shipment.origin.city}/${shipment.origin.country}`,
      `${shipment.destination.city}/${shipment.destination.country}`,
      shipment.serviceType,
      shipment.priority,
      shipment.createdAt,
      shipment.estimatedDeliveryAt ?? "",
      shipment.quotedAmount.toFixed(2),
      shipment.currency,
    ]
      .map(escape)
      .join(","),
  );

  const csv = [header.join(","), ...rows].join("\r\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="veltrix-encomendas-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

import Link from "next/link";
import { ArrowUpRight, Route as RouteIcon } from "lucide-react";
import { requirePagePermission } from "@/lib/auth/page-guard";
import { listRoutes } from "@/lib/domain/routes";
import { listShipments } from "@/lib/domain/shipments";
import { listDrivers, listVehicles } from "@/lib/domain/people";
import { Badge, EmptyState, Notice, Panel, PanelHeader } from "@/components/ui";
import { RouteForm } from "@/components/app/route-form";
import { ROUTE_STATUS_LABELS, formatDate } from "@/lib/utils";

export const metadata = { title: "Rotas" };

export default async function RoutesPage() {
  const user = await requirePagePermission("routes:read");
  const canWrite = user.permissions.includes("routes:write");

  const [routes, confirmed, assigned, drivers, vehicles] = await Promise.all([
    listRoutes(user.organizationId),
    listShipments({ page: 1, pageSize: 40, status: "confirmed", orderBy: "created_at DESC" }, { organizationId: user.organizationId }),
    listShipments({ page: 1, pageSize: 40, status: "assigned", orderBy: "created_at DESC" }, { organizationId: user.organizationId }),
    canWrite ? listDrivers(user.organizationId) : Promise.resolve([]),
    canWrite ? listVehicles(user.organizationId) : Promise.resolve([]),
  ]);

  const eligible = [...confirmed.items, ...assigned.items];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Rotas</h1>
          <p className="mt-1 text-xs text-muted">{routes.length} rotas · {eligible.length} encomendas elegíveis para planeamento</p>
        </div>
        <RouteForm
          canWrite={canWrite}
          shipments={eligible.map((shipment) => ({
            id: shipment.id,
            trackingCode: shipment.trackingCode,
            city: shipment.destination.city,
            weightKg: shipment.weightKg,
            volumeM3: shipment.volumeM3,
            priority: shipment.priority,
            customer: shipment.customer.name,
          }))}
          drivers={drivers.map((driver) => ({ id: driver.id, name: driver.full_name }))}
          vehicles={vehicles
            .filter((vehicle) => vehicle.status !== "retired" && vehicle.status !== "maintenance")
            .map((vehicle) => ({
              id: vehicle.id,
              registration: vehicle.registration_number,
              capacityKg: vehicle.capacity_weight_kg,
              capacityM3: vehicle.capacity_volume_m3,
            }))}
        />
      </div>

      <Notice tone="info" title="Planeamento e otimização">
        A sequência de paragens é gerada por uma heurística de vizinho mais próximo com ponderação de prioridade. Se
        não existir motor de rotas configurado, as distâncias são apresentadas como <strong>estimativa</strong> (linha
        reta ajustada) — nunca como rota otimizada.
      </Notice>

      <Panel>
        <PanelHeader title="Rotas planeadas" description="Ordenadas por data" actions={<Badge tone="neutral">{routes.length}</Badge>} />
        {routes.length === 0 ? (
          <EmptyState icon={<RouteIcon className="h-4 w-4" />} title="Sem rotas" description="Crie uma rota a partir de encomendas confirmadas." />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th scope="col">Rota</th>
                  <th scope="col">Data</th>
                  <th scope="col">Motorista</th>
                  <th scope="col">Veículo</th>
                  <th scope="col" className="text-right">Paragens</th>
                  <th scope="col" className="text-right">Distância</th>
                  <th scope="col">Estado</th>
                  <th scope="col" />
                </tr>
              </thead>
              <tbody>
                {routes.map((route) => (
                  <tr key={route.id}>
                    <td className="text-xs">{route.name ?? route.id.slice(0, 8)}</td>
                    <td className="text-[11px] text-muted">{formatDate(`${route.route_date}T08:00:00.000Z`)}</td>
                    <td className="text-[11px] text-muted">{route.driver_name ?? "—"}</td>
                    <td className="font-mono text-[10px] text-muted">{route.vehicle ?? "—"}</td>
                    <td className="text-right text-xs tabular-nums">
                      {route.completed_stops}/{route.stops}
                    </td>
                    <td className="text-right text-[11px] tabular-nums text-muted">
                      {route.planned_distance_km !== null ? `${route.planned_distance_km} km` : "não calculada"}
                    </td>
                    <td>
                      <Badge tone={route.status === "completed" ? "success" : route.status === "in_progress" ? "info" : route.status === "cancelled" ? "danger" : "neutral"}>
                        {ROUTE_STATUS_LABELS[route.status] ?? route.status}
                      </Badge>
                    </td>
                    <td className="text-right">
                      <Link href={`/app/routes/${route.id}`} className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline">
                        Abrir <ArrowUpRight className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

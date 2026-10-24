import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { requirePagePermission } from "@/lib/auth/page-guard";
import { getRouteDetail } from "@/lib/domain/routes";
import { getRoutingProvider } from "@/lib/routing/provider";
import { Badge, EmptyState, Notice, Panel, PanelHeader, StatusBadge } from "@/components/ui";
import { RouteMap } from "@/components/app/route-map";
import { RouteActions } from "@/components/app/route-actions";
import { ROUTE_STATUS_LABELS, formatDateTime } from "@/lib/utils";

export const metadata = { title: "Detalhe da rota" };

export default async function RouteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePagePermission("routes:read");
  const { id } = await params;

  let detail;
  try {
    detail = await getRouteDetail(id, user.organizationId);
  } catch {
    notFound();
  }

  const provider = getRoutingProvider();
  const canOptimize = user.permissions.includes("routes:optimize");
  const canWrite = user.permissions.includes("routes:write");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/app/routes" className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink">
            <ArrowLeft className="h-3.5 w-3.5" /> Rotas
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{detail.route.name ?? "Rota"}</h1>
            <Badge tone={detail.route.status === "completed" ? "success" : detail.route.status === "in_progress" ? "info" : "neutral"}>
              {ROUTE_STATUS_LABELS[detail.route.status] ?? detail.route.status}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted">
            {detail.route.routeDate} · {detail.stops.length} paragens ·{" "}
            {detail.route.plannedDistanceKm !== null ? `${detail.route.plannedDistanceKm} km · ${detail.route.plannedDurationMin} min` : "distância não calculada"}
          </p>
        </div>
        <RouteActions routeId={detail.route.id} status={detail.route.status} canOptimize={canOptimize} canWrite={canWrite} />
      </div>

      {!provider ? (
        <Notice tone="warning" title="Motor de rotas não configurado">
          Sem fornecedor de rotas (OSRM, openrouteservice ou GraphHopper) configurado, o recálculo devolve uma
          estimativa geométrica identificada como tal. Distâncias reais exigem credenciais válidas.
        </Notice>
      ) : null}

      {!detail.capacity.withinCapacity ? (
        <Notice tone="danger" title="Capacidade excedida">
          <span className="inline-flex items-start gap-1.5">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Carga de {detail.capacity.loadWeightKg} kg / {detail.capacity.loadVolumeM3} m³ excede a capacidade do
            veículo {detail.capacity.vehicle ?? ""} ({detail.capacity.maxWeightKg} kg / {detail.capacity.maxVolumeM3} m³).
          </span>
        </Notice>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.15fr_1fr] xl:items-start">
        <RouteMap
          className="h-[380px]"
          stops={detail.stops.map((stop) => ({
            id: stop.id,
            sequence: stop.sequenceNumber,
            city: stop.city,
            latitude: stop.latitude,
            longitude: stop.longitude,
            trackingCode: stop.trackingCode,
          }))}
        />

        <Panel>
          <PanelHeader
            title="Paragens"
            description={`Carga: ${detail.capacity.loadWeightKg} kg · ${detail.capacity.loadVolumeM3} m³`}
            actions={<Badge tone={detail.capacity.withinCapacity ? "success" : "danger"}>{detail.capacity.withinCapacity ? "capacidade OK" : "excede"}</Badge>}
          />
          {detail.stops.length === 0 ? (
            <EmptyState title="Sem paragens" description="Esta rota não tem encomendas associadas." />
          ) : (
            <ol className="divide-y divide-line/40">
              {detail.stops.map((stop) => (
                <li key={stop.id} className="px-5 py-3">
                  <div className="flex items-start gap-3">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-line/80 text-[10px] font-semibold text-accent">
                      {stop.sequenceNumber}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/app/shipments/${stop.shipmentId}`} className="font-mono text-[11px] text-ink hover:text-accent">
                          {stop.trackingCode}
                        </Link>
                        <StatusBadge status={stop.shipmentStatus} />
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted">
                        {stop.city}, {stop.countryCode} · {stop.weightKg} kg · {stop.volumeM3} m³
                      </p>
                      <p className="text-[10px] text-muted/70">
                        Chegada prevista: {stop.plannedArrivalAt ? formatDateTime(stop.plannedArrivalAt) : "—"} · paragem {stop.status}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>

      <p className="text-[10px] leading-relaxed text-muted/70">
        A sequência pode ser recalculada enquanto a rota não estiver em execução. Recalcular não confirma entregas nem
        altera estados de encomenda: apenas reordena paragens e atualiza distância/duração quando existe um motor de
        rotas configurado.
      </p>
    </div>
  );
}

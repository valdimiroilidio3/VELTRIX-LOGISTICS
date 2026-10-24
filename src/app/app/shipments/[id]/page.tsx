import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock3, FileText, MapPin, Package, Truck, User } from "lucide-react";
import { requirePagePermission } from "@/lib/auth/page-guard";
import { getShipmentDetail } from "@/lib/domain/shipments";
import { listDrivers, listVehicles } from "@/lib/domain/people";
import { nextStatuses, STATUS_LABELS } from "@/lib/domain/shipment-status";
import { roleCanTransitionTo, type Role } from "@/lib/auth/rbac";
import { Badge, ButtonLink, DataRow, EmptyState, Notice, Panel, PanelHeader, StatusBadge } from "@/components/ui";
import { PRIORITY_LABELS, SERVICE_LABELS, formatCurrency, formatDateTime, formatRelative } from "@/lib/utils";
import { TransitionPanel } from "@/components/app/transition-panel";
import { AssignPanel } from "@/components/app/assign-panel";
import { PodPanel } from "@/components/app/pod-panel";
import { signStoragePath } from "@/lib/storage";
import { listQuotesForShipment } from "@/lib/domain/quotes";
import { QuotePanel } from "@/components/app/quote-panel";

export const metadata = { title: "Detalhe da encomenda" };

export default async function ShipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePagePermission("shipments:read");
  const { id } = await params;

  let detail;
  try {
    detail = await getShipmentDetail(id, user.organizationId, {
      customerId: user.role === "customer" ? user.customerId : null,
      driverId: user.role === "driver" ? user.driverId : null,
    });
  } catch {
    notFound();
  }

  const canReadQuotes = user.permissions.includes("quotes:read");
  const [quotes, drivers, vehicles] = await Promise.all([
    canReadQuotes ? listQuotesForShipment(user.organizationId, id) : Promise.resolve([]),
    user.permissions.includes("drivers:read") ? listDrivers(user.organizationId) : Promise.resolve([]),
    user.permissions.includes("fleet:read") ? listVehicles(user.organizationId) : Promise.resolve([]),
  ]);

  const shipment = detail.shipment;
  const canTransition = user.permissions.includes("shipments:transition");
  const canOverride = user.role === "admin" || user.role === "super_admin";
  const allowed = nextStatuses(shipment.status).filter((status) => roleCanTransitionTo(user.role as Role, status) || canOverride);
  const canSubmitPod = user.permissions.includes("pod:submit") && shipment.status !== "delivered" && shipment.status !== "cancelled";
  const podPhotos = detail.proofOfDelivery?.photo_paths ? (JSON.parse(detail.proofOfDelivery.photo_paths) as string[]) : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/app/shipments" className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink">
            <ArrowLeft className="h-3.5 w-3.5" /> Encomendas
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-xl tracking-[0.06em]">{shipment.trackingCode}</h1>
            <StatusBadge status={shipment.status} />
            <Badge tone={shipment.priority === "urgent" || shipment.priority === "high" ? "warning" : "neutral"}>
              {PRIORITY_LABELS[shipment.priority] ?? shipment.priority}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted">
            {SERVICE_LABELS[shipment.serviceType] ?? shipment.serviceType} · {shipment.origin.city} → {shipment.destination.city} · criada {formatRelative(shipment.createdAt)}
          </p>
        </div>
        <div className="flex gap-2">
          <ButtonLink href={`/tracking/${shipment.trackingCode}`} target="_blank" size="sm" variant="secondary">
            Ver rastreio público
          </ButtonLink>
        </div>
      </div>

      {shipment.exceptionReason ? (
        <Notice tone="danger" title="Ocorrência registada">
          <span className="inline-flex items-start gap-1.5">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {shipment.exceptionReason}
          </span>
        </Notice>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr] xl:items-start">
        <div className="space-y-4">
          <Panel>
            <PanelHeader title="Resumo" description="Dados operacionais e comerciais do envio" />
            <div className="grid gap-x-8 px-5 py-3 sm:grid-cols-2">
              <dl>
                <DataRow label="Cliente" value={detail.customer.company_name ?? detail.customer.contact_name} />
                <DataRow label="Contacto" value={detail.customer.email} />
                <DataRow label="Peso total" value={`${shipment.weightKg} kg`} />
                <DataRow label="Volume" value={`${shipment.volumeM3} m³`} />
                <DataRow
                  label="Valor cotado"
                  value={
                    shipment.quotedAmount > 0 ? (
                      formatCurrency(shipment.quotedAmount, shipment.currency)
                    ) : (
                      <span className="text-warning">A orçamentar</span>
                    )
                  }
                />
              </dl>
              <dl>
                <DataRow label="Recolha pretendida" value={formatDateTime(shipment.requestedPickupAt)} />
                <DataRow label="Entrega estimada" value={formatDateTime(shipment.estimatedDeliveryAt)} />
                <DataRow label="Entrega confirmada" value={shipment.actualDeliveryAt ? formatDateTime(shipment.actualDeliveryAt) : "—"} />
                <DataRow label="Rota" value={detail.assignment ? `${detail.assignment.routeDate} · ${detail.assignment.driverName ?? "sem motorista"}` : "Não atribuída"} />
                <DataRow label="Veículo" value={detail.assignment?.vehicle ?? "—"} />
              </dl>
            </div>
          </Panel>

          {canReadQuotes ? (
            <QuotePanel
              shipmentId={shipment.id}
              quotes={quotes}
              canWrite={user.permissions.includes("quotes:write")}
              defaultCurrency={shipment.currency}
            />
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { title: "Origem", address: detail.origin },
              { title: "Destino", address: detail.destination },
            ].map((block) => {
              return (
                <Panel key={block.title} className="p-5">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                    <MapPin className="h-3.5 w-3.5" /> {block.title}
                  </p>
                  <p className="mt-2 text-sm text-ink">{block.address.address_line}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {block.address.postal_code ? `${block.address.postal_code} ` : ""}
                    {block.address.city}, {block.address.country_code}
                  </p>
                  <p className="mt-2 text-[10px] text-muted/70">
                    {block.address.latitude !== null && block.address.longitude !== null ? (
                      <>Coordenadas validadas: {block.address.latitude.toFixed(4)}, {block.address.longitude.toFixed(4)}</>
                    ) : (
                      "Sem coordenadas validadas — não será apresentada localização no mapa."
                    )}
                  </p>
                </Panel>
              );
            })}
          </div>

          <Panel>
            <PanelHeader title="Artigos" description={`${detail.items.length} linha(s) de carga`} />
            {detail.items.length === 0 ? (
              <EmptyState title="Sem artigos" description="Esta encomenda não tem linhas de carga registadas." />
            ) : (
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th scope="col">Descrição</th>
                      <th scope="col" className="text-right">Qtd.</th>
                      <th scope="col" className="text-right">Peso</th>
                      <th scope="col">Dimensões</th>
                      <th scope="col">Instruções</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items.map((item) => (
                      <tr key={item.id}>
                        <td className="text-xs">{item.description}</td>
                        <td className="text-right text-xs tabular-nums">{item.quantity}</td>
                        <td className="text-right text-xs tabular-nums">{item.weight_kg} kg</td>
                        <td className="text-[11px] text-muted">
                          {item.length_cm && item.width_cm && item.height_cm ? `${item.length_cm}×${item.width_cm}×${item.height_cm} cm` : "—"}
                        </td>
                        <td className="text-[11px] text-muted">{item.handling_instructions ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel>
            <PanelHeader
              title="Histórico de eventos"
              description="Registo imutável de transições, atribuições e ações administrativas"
              actions={<Badge tone="neutral">{detail.events.length}</Badge>}
            />
            <ol className="px-5 py-4">
              {detail.events.map((event, index) => (
                <li key={event.id} className="relative flex gap-4 pb-5 last:pb-0">
                  {index < detail.events.length - 1 ? <span className="absolute left-[7px] top-4 h-full w-px bg-line/60" aria-hidden /> : null}
                  <span className={`relative mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 ${event.event_type === "status_override" ? "border-warning bg-warning/20" : index === 0 ? "border-accent bg-accent/20" : "border-line bg-bg"}`} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-medium text-ink">
                        {event.previous_status ? `${STATUS_LABELS[event.previous_status as keyof typeof STATUS_LABELS] ?? event.previous_status} → ` : ""}
                        {event.new_status ? STATUS_LABELS[event.new_status as keyof typeof STATUS_LABELS] ?? event.new_status : event.event_type}
                      </p>
                      {event.event_type === "status_override" ? <Badge tone="warning">forçada</Badge> : null}
                      <span className="text-[10px] text-muted">{formatDateTime(event.occurred_at)}</span>
                    </div>
                    {event.description ? <p className="mt-1 text-[11px] leading-relaxed text-muted">{event.description}</p> : null}
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted/80">
                      <span className="inline-flex items-center gap-1">
                        <User className="h-3 w-3" /> {event.actor_name ?? "sistema"}
                      </span>
                      {event.location ? (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> {event.location}
                        </span>
                      ) : null}
                      {event.latitude !== null && event.longitude !== null ? (
                        <span className="font-mono">
                          {event.latitude.toFixed(4)}, {event.longitude.toFixed(4)}
                        </span>
                      ) : null}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        <div className="space-y-4">
          {canTransition ? (
            <Panel>
              <PanelHeader title="Alterar estado" description={`Atual: ${STATUS_LABELS[shipment.status]}`} actions={<Clock3 className="h-3.5 w-3.5 text-muted" />} />
              <TransitionPanel
                shipmentId={shipment.id}
                currentStatus={shipment.status}
                options={allowed}
                canOverride={canOverride}
                hasProofOfDelivery={Boolean(detail.proofOfDelivery)}
              />
            </Panel>
          ) : null}

          <Panel>
            <PanelHeader title="Prova de entrega" description={detail.proofOfDelivery ? "Registada" : "Pendente"} actions={detail.proofOfDelivery ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : null} />
            {detail.proofOfDelivery ? (
              <div className="space-y-3 px-5 py-4">
                <dl>
                  <DataRow label="Recebido por" value={detail.proofOfDelivery.received_by} />
                  <DataRow label="Data" value={formatDateTime(detail.proofOfDelivery.delivered_at)} />
                  <DataRow
                    label="Localização"
                    value={
                      detail.proofOfDelivery.latitude !== null && detail.proofOfDelivery.longitude !== null
                        ? `${detail.proofOfDelivery.latitude.toFixed(4)}, ${detail.proofOfDelivery.longitude.toFixed(4)}`
                        : "Não registada"
                    }
                  />
                  <DataRow label="Notas" value={detail.proofOfDelivery.notes ?? "—"} />
                </dl>
                <div className="flex flex-wrap gap-2">
                  {detail.proofOfDelivery.signature_path ? (
                    <a
                      href={signStoragePath(detail.proofOfDelivery.signature_path)}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-line px-2.5 py-1.5 text-[11px] text-accent hover:bg-surface-raised/60"
                    >
                      Ver assinatura (ligação 5 min)
                    </a>
                  ) : null}
                  {podPhotos.map((photo, index) => (
                    <a
                      key={photo}
                      href={signStoragePath(photo)}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-line px-2.5 py-1.5 text-[11px] text-accent hover:bg-surface-raised/60"
                    >
                      Fotografia {index + 1}
                    </a>
                  ))}
                </div>
                <p className="text-[10px] leading-relaxed text-muted/80">
                  Ficheiros privados: cada ligação é assinada e expira em 5 minutos, exigindo sessão autorizada.
                </p>
              </div>
            ) : canSubmitPod ? (
              <PodPanel shipmentId={shipment.id} disabled={false} />
            ) : (
              <p className="px-5 py-4 text-xs text-muted">Sem prova de entrega registada.</p>
            )}
          </Panel>

          {user.permissions.includes("shipments:assign") ? (
            <Panel>
              <PanelHeader title="Atribuição" description={detail.assignment ? `Rota ${detail.assignment.routeDate}` : "Sem rota ativa"} actions={<Truck className="h-3.5 w-3.5 text-muted" />} />
              <AssignPanel
                shipmentId={shipment.id}
                drivers={drivers.map((driver) => ({ id: driver.id, name: driver.full_name, activeTasks: Number(driver.active_tasks) }))}
                vehicles={vehicles.map((vehicle) => ({
                  id: vehicle.id,
                  registration: vehicle.registration_number,
                  capacityKg: vehicle.capacity_weight_kg,
                  capacityM3: vehicle.capacity_volume_m3,
                  status: vehicle.status,
                }))}
                currentDriverId={null}
                weightKg={shipment.weightKg}
                volumeM3={shipment.volumeM3}
              />
            </Panel>
          ) : null}

          <Panel>
            <PanelHeader title="Documentos" description="Ligações assinadas de curta duração" actions={<FileText className="h-3.5 w-3.5 text-muted" />} />
            <div className="px-5 py-4">
              <p className="text-xs text-muted">
                {detail.proofOfDelivery
                  ? "Os comprovativos desta encomenda estão disponíveis no bloco de prova de entrega."
                  : "Sem documentos anexados. O upload é feito na prova de entrega ou pela API de documentos."}
              </p>
              <p className="mt-2 flex items-center gap-1.5 text-[10px] text-muted/70">
                <Package className="h-3 w-3" /> Nenhum documento é publicamente acessível.
              </p>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

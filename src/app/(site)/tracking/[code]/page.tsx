import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, Circle, Clock, MapPin, Package } from "lucide-react";
import { lookupTracking } from "@/lib/domain/tracking";
import { ensureDatabase } from "@/lib/db";
import { Badge, Panel } from "@/components/ui";
import { STATUS_LABELS, type ShipmentStatus } from "@/lib/domain/shipment-status";
import { SERVICE_LABELS, formatDateTime, cn } from "@/lib/utils";
import { TrackForm } from "@/components/site/track-form";

export const metadata: Metadata = {
  title: "Detalhe do rastreio",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const PROGRESS: ShipmentStatus[] = [
  "quoted",
  "confirmed",
  "assigned",
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "delivered",
];

export default async function TrackingDetailPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  await ensureDatabase();
  const tracking = await lookupTracking(decodeURIComponent(code));
  if (!tracking) notFound();

  const currentIndex = PROGRESS.indexOf(tracking.status);
  const failed = ["exception", "failed_delivery", "returned", "cancelled"].includes(tracking.status);

  return (
    <div className="container-page py-12 lg:py-16">
      <Link href="/tracking" className="inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> Novo rastreio
      </Link>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.5fr_1fr] lg:items-start">
        <div className="space-y-6">
          <Panel className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.14em] text-muted">Código de rastreio</p>
                <p className="mt-1 font-mono text-lg tracking-[0.1em] text-ink">{tracking.trackingCode}</p>
              </div>
              <Badge tone={failed ? "danger" : tracking.status === "delivered" ? "success" : "info"}>
                {tracking.status === "delivered" ? <CheckCircle2 className="h-3 w-3" /> : failed ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                {tracking.statusLabel}
              </Badge>
            </div>

            <div className="mt-6 flex items-center gap-3 text-xs text-muted">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted/70">Origem</p>
                <p className="mt-0.5 font-medium text-ink">
                  {tracking.origin.city}, {tracking.origin.country}
                </p>
              </div>
              <div className="h-px flex-1 bg-line/70" />
              <Package className="h-4 w-4 text-accent/70" aria-hidden />
              <div className="h-px flex-1 bg-line/70" />
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wide text-muted/70">Destino</p>
                <p className="mt-0.5 font-medium text-ink">
                  {tracking.destination.city}, {tracking.destination.country}
                </p>
              </div>
            </div>

            {failed || tracking.hasException ? (
              <div className="mt-5 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-xs text-danger">
                Existe uma ocorrência associada a esta encomenda. A equipa operacional está a acompanhar o caso.
              </div>
            ) : null}

            <div className="mt-6">
              <div className="flex items-center justify-between text-[10px] text-muted">
                <span>Criada {formatDateTime(tracking.createdAt)}</span>
                <span>Atualizada {formatDateTime(tracking.lastEventAt ?? tracking.updatedAt)}</span>
              </div>
              <ol className="mt-3 flex items-center gap-1">
                {PROGRESS.map((step, index) => {
                  const done = currentIndex >= index && currentIndex !== -1;
                  const current = tracking.status === step;
                  return (
                    <li key={step} className="flex-1" aria-current={current ? "step" : undefined}>
                      <div className={cn("h-1 rounded-full", done ? "bg-accent" : "bg-line/70", current && "bg-accent shadow-[0_0_12px_rgba(184,243,106,0.5)]")} />
                      <p className="mt-1.5 hidden text-[9px] uppercase tracking-wide text-muted sm:block">{STATUS_LABELS[step]}</p>
                    </li>
                  );
                })}
              </ol>
            </div>
          </Panel>

          <Panel>
            <div className="panel-header">
              <div>
                <h2 className="text-sm font-semibold">Histórico de eventos</h2>
                <p className="mt-0.5 text-xs text-muted">Registo cronológico imutável — mais recente primeiro.</p>
              </div>
              <span className="text-[11px] text-muted">{tracking.events.length} eventos</span>
            </div>
            <ol className="space-y-0 px-5 py-4">
              {tracking.events.map((event, index) => (
                <li key={`${event.occurredAt}-${index}`} className="relative flex gap-4 pb-5 last:pb-0">
                  {index < tracking.events.length - 1 ? <span className="absolute left-[7px] top-4 h-full w-px bg-line/60" aria-hidden /> : null}
                  <span className={cn("relative mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full border-2", index === 0 ? "border-accent bg-accent/20" : "border-line bg-bg")} aria-hidden>
                    {index === 0 ? <Circle className="h-1.5 w-1.5" /> : null}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-medium text-ink">{event.label}</p>
                      <span className="text-[10px] text-muted">{formatDateTime(event.occurredAt)}</span>
                    </div>
                    {event.description ? <p className="mt-1 text-[11px] leading-relaxed text-muted">{event.description}</p> : null}
                    {event.location ? (
                      <p className="mt-1 flex items-center gap-1 text-[10px] text-muted/80">
                        <MapPin className="h-3 w-3" /> {event.location}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        <div className="space-y-4 lg:sticky lg:top-24">
          <Panel className="p-5">
            <h2 className="text-sm font-semibold">Detalhes do envio</h2>
            <dl className="mt-3">
              {[
                ["Serviço", SERVICE_LABELS[tracking.serviceType] ?? tracking.serviceType],
                ["Criada", formatDateTime(tracking.createdAt)],
                ["Última atualização", formatDateTime(tracking.lastEventAt ?? tracking.updatedAt)],
                ["Entrega estimada", tracking.estimatedDeliveryAt ? formatDateTime(tracking.estimatedDeliveryAt) : "—"],
                ["Entrega confirmada", tracking.deliveredAt ? formatDateTime(tracking.deliveredAt) : "—"],
              ].map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-3 border-b border-line/40 py-2.5 last:border-0">
                  <dt className="text-xs text-muted">{label}</dt>
                  <dd className="text-right text-xs font-medium text-ink">{value}</dd>
                </div>
              ))}
            </dl>
            {tracking.estimatedDeliveryNote ? (
              <p className="mt-3 text-[10px] leading-relaxed text-muted/80">{tracking.estimatedDeliveryNote}</p>
            ) : null}
          </Panel>

          <Panel className="p-5">
            <h2 className="text-sm font-semibold">Consultar outro envio</h2>
            <div className="mt-3">
              <TrackForm compact />
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Loader2, MapPin, Navigation, Phone, Package, Truck } from "lucide-react";
import { toast } from "sonner";
import { stopStatusAction, transitionAction } from "@/app/app/actions";
import { PodPanel } from "@/components/app/pod-panel";
import { Badge, Notice } from "@/components/ui";
import { formatDateTime, cn } from "@/lib/utils";
import { STATUS_LABELS, type ShipmentStatus } from "@/lib/domain/shipment-status";

export interface DriverTask {
  stopId: string;
  routeId: string;
  routeDate: string;
  sequence: number;
  stopStatus: string;
  shipmentId: string;
  trackingCode: string;
  shipmentStatus: string;
  priority: string;
  customerName: string;
  contactName: string;
  phone: string | null;
  address: { line: string; city: string; postalCode: string | null; country: string };
  coordinates: { lat: number; lng: number } | null;
  estimatedDeliveryAt: string | null;
  weightKg: number;
  vehicle: string | null;
}

export function DriverTaskList({ tasks }: { tasks: DriverTask[] }) {
  const [expanded, setExpanded] = useState<string | null>(tasks[0]?.stopId ?? null);
  const [online, setOnline] = useState(true);

  return (
    <div className="space-y-3">
      {!online ? (
        <Notice tone="warning" title="Sem ligação">
          Está offline. As ações ficam bloqueadas para evitar registos duplicados — reconecte para continuar. Não é
          simulada uma entrega sem confirmação do servidor.
        </Notice>
      ) : null}

      <div className="flex items-center justify-between rounded-xl border border-line/60 bg-surface/50 px-3 py-2 text-[11px] text-muted">
        <span>{tasks.length} paragens atribuídas</span>
        <button
          type="button"
          onClick={() => setOnline((value) => !value)}
          className="rounded-lg border border-line/70 px-2 py-1 text-[10px] hover:text-ink"
        >
          {online ? "Simular offline" : "Voltar online"}
        </button>
      </div>

      {tasks.map((task) => {
        const isOpen = expanded === task.stopId;
        return (
          <article key={task.stopId} className="overflow-hidden rounded-2xl border border-line/70 bg-surface/60">
            <button
              type="button"
              onClick={() => setExpanded(isOpen ? null : task.stopId)}
              aria-expanded={isOpen}
              className="flex w-full items-start gap-3 p-4 text-left"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line/80 bg-bg/60 text-xs font-semibold text-accent">
                {task.sequence}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] text-ink">{task.trackingCode}</span>
                  <Badge tone={task.shipmentStatus === "delivered" ? "success" : task.priority === "urgent" ? "danger" : "info"}>
                    {STATUS_LABELS[task.shipmentStatus as ShipmentStatus] ?? task.shipmentStatus}
                  </Badge>
                </div>
                <p className="mt-1 truncate text-sm text-ink">{task.customerName}</p>
                <p className="mt-0.5 flex items-start gap-1 text-[11px] leading-relaxed text-muted">
                  <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                  {task.address.line}, {task.address.postalCode ?? ""} {task.address.city}
                </p>
                <p className="mt-0.5 text-[10px] text-muted/70">
                  {task.weightKg} kg · entrega estimada {task.estimatedDeliveryAt ? formatDateTime(task.estimatedDeliveryAt) : "—"}
                  {task.vehicle ? ` · ${task.vehicle}` : ""}
                </p>
              </div>
              <ChevronDown className={cn("mt-1 h-4 w-4 shrink-0 text-muted transition-transform", isOpen && "rotate-180")} />
            </button>

            {isOpen ? (
              <div className="border-t border-line/60 bg-bg/30">
                <div className="flex flex-wrap gap-2 p-3">
                  <TaskAction stopId={task.stopId} status="en_route" current={task.stopStatus} label="Iniciar deslocação" icon={Truck} />
                  <TaskAction stopId={task.stopId} status="arrived" current={task.stopStatus} label="Cheguei ao local" icon={MapPin} />
                  {task.coordinates ? (
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${task.coordinates.lat},${task.coordinates.lng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[11px] text-ink hover:border-accent/40"
                    >
                      <Navigation className="h-3.5 w-3.5" /> Navegar
                    </a>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-line/60 px-2.5 py-1.5 text-[10px] text-muted/70">
                      <Navigation className="h-3.5 w-3.5" /> Sem coordenadas validadas
                    </span>
                  )}
                  {task.phone ? (
                    <a href={`tel:${task.phone}`} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[11px] text-ink hover:border-accent/40">
                      <Phone className="h-3.5 w-3.5" /> Contactar
                    </a>
                  ) : null}
                  <OccurrenceButton shipmentId={task.shipmentId} />
                  <Link
                    href={`/app/shipments/${task.shipmentId}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[11px] text-muted hover:text-ink"
                  >
                    <Package className="h-3.5 w-3.5" /> Detalhe
                  </Link>
                </div>

                <div className="border-t border-line/50">
                  <p className="px-4 pt-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">Prova de entrega</p>
                  <PodPanel shipmentId={task.shipmentId} disabled={task.shipmentStatus === "delivered"} />
                </div>
              </div>
            ) : null}
          </article>
        );
      })}

      {tasks.length === 0 ? (
        <div className="rounded-2xl border border-line/70 bg-surface/50 p-8 text-center">
          <CheckCircle2 className="mx-auto h-5 w-5 text-success" />
          <p className="mt-2 text-sm text-ink">Sem tarefas atribuídas</p>
          <p className="mt-1 text-xs text-muted">As paragens aparecem aqui quando o despachante atribuir uma rota.</p>
        </div>
      ) : null}
    </div>
  );
}

function TaskAction({
  stopId,
  status,
  current,
  label,
  icon: Icon,
}: {
  stopId: string;
  status: "en_route" | "arrived";
  current: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const already = current === status || (status === "en_route" && ["arrived", "completed"].includes(current));

  return (
    <button
      type="button"
      disabled={pending || already}
      onClick={() =>
        startTransition(async () => {
          const result = await stopStatusAction({ stopId, status });
          if (!result.ok) toast.error(result.message);
          else toast.success(result.message);
          router.refresh();
        })
      }
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] transition-colors",
        already ? "border-line/50 text-muted/50" : "border-accent/40 text-accent hover:bg-accent/10",
      )}
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
      {label}
    </button>
  );
}

/**
 * Records an operational occurrence (exception) on the shipment.
 * A reason is mandatory: the transition writes the reason into the shipment
 * record, the event history and the audit log.
 */
function OccurrenceButton({ shipmentId }: { shipmentId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-warning/40 px-2.5 py-1.5 text-[11px] text-warning hover:bg-warning/10"
      >
        <AlertTriangle className="h-3.5 w-3.5" /> Ocorrência
      </button>
    );
  }

  return (
    <div className="w-full rounded-lg border border-line/70 bg-bg/50 p-2.5">
      <label htmlFor={`reason-${shipmentId}`} className="text-[10px] font-medium uppercase tracking-wide text-muted">
        Motivo da ocorrência
      </label>
      <textarea
        id={`reason-${shipmentId}`}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        rows={2}
        placeholder="Ex.: destinatário ausente, morada não localizada, mercadoria recusada"
        className="mt-1 w-full rounded-md border border-line/70 bg-surface/60 px-2 py-1.5 text-[11px] text-ink placeholder:text-muted/60 focus:border-accent/50 focus:outline-none"
      />
      {error ? <p className="mt-1 text-[10px] text-danger">{error}</p> : null}
      <div className="mt-2 flex justify-end gap-1.5">
        <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-line px-2 py-1 text-[10px] text-muted">
          Cancelar
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setError(null);
            if (reason.trim().length < 10) {
              setError("Descreva a ocorrência com pelo menos 10 caracteres.");
              return;
            }
            startTransition(async () => {
              const result = await transitionAction({
                shipmentId,
                toStatus: "exception",
                justification: reason.trim(),
                description: reason.trim(),
              });
              if (!result.ok) {
                setError(result.message);
                toast.error(result.message);
                return;
              }
              toast.success("Ocorrência registada");
              setOpen(false);
              setReason("");
              router.refresh();
            });
          }}
          className="inline-flex items-center gap-1 rounded-md bg-warning px-2 py-1 text-[10px] font-medium text-warning-foreground disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Registar
        </button>
      </div>
    </div>
  );
}

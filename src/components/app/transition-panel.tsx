"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowRight, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { transitionAction } from "@/app/app/actions";
import { Button, Field, Input, Notice, Select, Textarea } from "@/components/ui";
import { STATUS_LABELS, type ShipmentStatus } from "@/lib/domain/shipment-status";

export interface TransitionOption {
  status: ShipmentStatus;
  enabled: boolean;
}

export function TransitionPanel({
  shipmentId,
  currentStatus,
  options,
  canOverride,
  hasProofOfDelivery,
}: {
  shipmentId: string;
  currentStatus: ShipmentStatus;
  options: ShipmentStatus[];
  canOverride: boolean;
  hasProofOfDelivery: boolean;
}) {
  const router = useRouter();
  const [target, setTarget] = useState<string>(options[0] ?? "");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [override, setOverride] = useState(false);
  const [justification, setJustification] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    if (!target) {
      setError("Selecione o estado de destino.");
      return;
    }
    if (override && justification.trim().length < 10) {
      setError("A justificação precisa de pelo menos 10 caracteres.");
      return;
    }
    startTransition(async () => {
      const result = await transitionAction({
        shipmentId,
        toStatus: target,
        description: description || undefined,
        location: location || undefined,
        override,
        justification: justification || undefined,
      });
      if (!result.ok) {
        setError(result.message);
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      setDescription("");
      setJustification("");
      setOverride(false);
      router.refresh();
    });
  }

  if (options.length === 0) {
    return (
      <div className="px-5 py-4 text-xs text-muted">
        Nenhuma transição disponível a partir de <strong className="text-ink">{STATUS_LABELS[currentStatus]}</strong>.
        {canOverride ? " Um administrador pode forçar uma transição com justificação registada." : ""}
      </div>
    );
  }

  return (
    <div className="space-y-3 px-5 py-4">
      {error ? <Notice tone="danger">{error}</Notice> : null}

      {target === "delivered" && !hasProofOfDelivery ? (
        <Notice tone="warning" title="Prova de entrega em falta">
          Sem prova de entrega registada, a confirmação de entrega é recusada pelo servidor. Registe a prova no painel
          de entrega (ou use uma transição administrativa justificada).
        </Notice>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <div>
          <label className="label" htmlFor="target-status">
            Novo estado
          </label>
          <Select id="target-status" value={target} onChange={(event) => setTarget(event.target.value)} disabled={pending}>
            {options.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-end">
          <Button onClick={submit} disabled={pending} className="w-full sm:w-auto">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            Aplicar
          </Button>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Descrição (opcional)" htmlFor="transition-description">
          <Input
            id="transition-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Contexto registado no histórico"
            disabled={pending}
          />
        </Field>
        <Field label="Local (opcional)" htmlFor="transition-location">
          <Input id="transition-location" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Hub, cidade, instalação" disabled={pending} />
        </Field>
      </div>

      {canOverride ? (
        <details className="rounded-xl border border-warning/25 bg-warning/5 px-3.5 py-3">
          <summary className="flex cursor-pointer items-center gap-2 text-[11px] font-medium text-warning">
            <ShieldAlert className="h-3.5 w-3.5" /> Ação administrativa (transição forçada)
          </summary>
          <div className="mt-3 space-y-2">
            <label className="flex items-start gap-2 text-[11px] text-warning/90">
              <input type="checkbox" checked={override} onChange={(event) => setOverride(event.target.checked)} className="mt-0.5 accent-[#B8F36A]" />
              Forçar uma transição não prevista pela máquina de estados
            </label>
            <Textarea
              value={justification}
              onChange={(event) => setJustification(event.target.value)}
              placeholder="Justificação obrigatória — fica registada na auditoria com o seu utilizador."
              className="min-h-16 text-xs"
              disabled={!override}
            />
          </div>
        </details>
      ) : null}

      {override ? (
        <p className="text-[10px] text-warning/80">
          Transições forçadas são registadas com o seu utilizador, IP e justificação. Use apenas em exceções
          operacionais documentadas.
        </p>
      ) : null}
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, PackagePlus, PencilRuler } from "lucide-react";
import { toast } from "sonner";
import { inventoryMovementAction, zoneOccupancyAction } from "@/app/app/actions";
import { Button, Field, Input, Notice, Select } from "@/components/ui";

export function InventoryMovementForm({
  warehouseId,
  zones,
  items,
  disabled,
}: {
  warehouseId: string;
  zones: { id: string; name: string }[];
  items: { id: string; label: string }[];
  disabled?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await inventoryMovementAction(formData);
      if (!result.ok) {
        setError(result.message);
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      router.refresh();
    });
  }

  if (disabled) return null;

  return (
    <form action={onSubmit} className="space-y-3 px-5 py-4" noValidate>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <input type="hidden" name="warehouseId" value={warehouseId} />
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Artigo" htmlFor="movement-item">
          <Select id="movement-item" name="inventoryItemId" required>
            <option value="">Selecionar…</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Tipo" htmlFor="movement-type">
          <Select id="movement-type" name="movementType" defaultValue="receipt">
            <option value="receipt">Receção (+)</option>
            <option value="putaway">Armazenagem (+)</option>
            <option value="pick">Picking (−)</option>
            <option value="dispatch">Expedição (−)</option>
            <option value="transfer">Transferência</option>
            <option value="return">Devolução (+)</option>
            <option value="adjustment">Ajuste (±)</option>
          </Select>
        </Field>
        <Field label="Quantidade" htmlFor="movement-qty" hint="Negativo apenas em ajustes">
          <Input id="movement-qty" name="quantity" type="number" step="1" required defaultValue={1} />
        </Field>
        <Field label="Zona" htmlFor="movement-zone">
          <Select id="movement-zone" name="zoneId" defaultValue="">
            <option value="">Sem zona</option>
            {zones.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Referência" htmlFor="movement-ref" className="sm:col-span-2">
          <Input id="movement-ref" name="reference" placeholder="Documento, guia ou nota" />
        </Field>
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PackagePlus className="h-3.5 w-3.5" />}
        Registar movimento
      </Button>
    </form>
  );
}

export function OccupancyForm({ zoneId, current, capacity, disabled }: { zoneId: string; current: number; capacity: number; disabled?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(current));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (disabled) return null;

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-[10px] text-accent hover:underline">
        ajustar ocupação
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-1.5 rounded-lg border border-line/70 bg-bg/50 p-2">
      {error ? <p className="text-[10px] text-danger">{error}</p> : null}
      <div className="flex gap-1">
        <Input
          type="number"
          min={0}
          max={capacity}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="h-7 w-16 px-2 py-0 text-[11px]"
          aria-label="Paletes ocupadas"
        />
        <Input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Motivo do ajuste"
          className="h-7 flex-1 px-2 py-0 text-[10px]"
          aria-label="Motivo"
        />
        <Button
          size="sm"
          className="h-7 px-2 text-[10px]"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await zoneOccupancyAction({ zoneId, occupiedPallets: Number(value), reason });
              if (!result.ok) {
                setError(result.message);
                return;
              }
              toast.success(result.message);
              setOpen(false);
              router.refresh();
            })
          }
        >
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <PencilRuler className="h-3 w-3" />}
        </Button>
      </div>
      <p className="text-[9px] leading-relaxed text-muted/70">Ajuste auditado: fica registado com autor e motivo.</p>
    </div>
  );
}

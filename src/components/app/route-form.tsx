"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Route as RouteIcon } from "lucide-react";
import { toast } from "sonner";
import { createRouteAction } from "@/app/app/actions";
import { Button, Field, Input, Notice, Select } from "@/components/ui";

export function RouteForm({
  shipments,
  drivers,
  vehicles,
  canWrite,
}: {
  shipments: { id: string; trackingCode: string; city: string; weightKg: number; volumeM3: number; priority: string; customer: string }[];
  drivers: { id: string; name: string }[];
  vehicles: { id: string; registration: string; capacityKg: number; capacityM3: number }[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [vehicleId, setVehicleId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const loadWeight = shipments.filter((shipment) => selected.includes(shipment.id)).reduce((sum, shipment) => sum + shipment.weightKg, 0);
  const loadVolume = shipments.filter((shipment) => selected.includes(shipment.id)).reduce((sum, shipment) => sum + shipment.volumeM3, 0);
  const vehicle = vehicles.find((item) => item.id === vehicleId);
  const overloaded = vehicle ? loadWeight > vehicle.capacityKg || loadVolume > vehicle.capacityM3 : false;

  function onSubmit(formData: FormData) {
    setError(null);
    if (selected.length === 0) {
      setError("Selecione pelo menos uma encomenda.");
      return;
    }
    startTransition(async () => {
      const result = await createRouteAction(formData);
      if (!result.ok) {
        setError(result.message);
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      setOpen(false);
      setSelected([]);
      router.refresh();
    });
  }

  if (!canWrite) return null;

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <RouteIcon className="h-3.5 w-3.5" /> Nova rota
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-line bg-surface p-5 shadow-lift">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Nova rota</h2>
          <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted hover:text-ink">
            Fechar
          </button>
        </div>

        <form action={onSubmit} className="mt-4 space-y-3" noValidate>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Data da rota" htmlFor="routeDate">
              <Input id="routeDate" name="routeDate" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
            </Field>
            <Field label="Nome (opcional)" htmlFor="routeName">
              <Input id="routeName" name="name" placeholder="Rota Norte" />
            </Field>
            <Field label="Motorista" htmlFor="routeDriver">
              <Select id="routeDriver" name="driverId" defaultValue="">
                <option value="">Atribuir depois</option>
                {drivers.map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    {driver.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Veículo" htmlFor="routeVehicle">
              <Select id="routeVehicle" name="vehicleId" value={vehicleId} onChange={(event) => setVehicleId(event.target.value)}>
                <option value="">Sem veículo</option>
                {vehicles.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.registration} · {item.capacityKg} kg · {item.capacityM3} m³
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div>
            <p className="label">Encomendas elegíveis (confirmadas ou agendadas)</p>
            {shipments.length === 0 ? (
              <p className="rounded-lg border border-line/60 bg-bg/40 px-3 py-2 text-[11px] text-muted">
                Não existem encomendas confirmadas sem rota ativa.
              </p>
            ) : (
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-line/60 bg-bg/40 p-2">
                {shipments.map((shipment) => (
                  <label key={shipment.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] hover:bg-surface/60">
                    <input
                      type="checkbox"
                      name="shipmentIds"
                      value={shipment.id}
                      checked={selected.includes(shipment.id)}
                      onChange={(event) =>
                        setSelected((current) => (event.target.checked ? [...current, shipment.id] : current.filter((id) => id !== shipment.id)))
                      }
                      className="accent-[#B8F36A]"
                    />
                    <span className="font-mono text-ink">{shipment.trackingCode}</span>
                    <span className="text-muted">{shipment.city}</span>
                    <span className="ml-auto text-muted/80">
                      {shipment.weightKg} kg · {shipment.volumeM3} m³
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line/60 bg-bg/40 px-3 py-2 text-[11px]">
            <span className="text-muted">
              Carga selecionada: {Math.round(loadWeight * 100) / 100} kg · {Math.round(loadVolume * 1000) / 1000} m³
            </span>
            {overloaded ? <span className="text-danger">Excede a capacidade do veículo</span> : <span className="text-muted/70">capacidade validada no servidor</span>}
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || overloaded}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Criar rota
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

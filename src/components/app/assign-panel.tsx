"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { assignAction } from "@/app/app/actions";
import { Button, Field, Notice, Select } from "@/components/ui";

export function AssignPanel({
  shipmentId,
  drivers,
  vehicles,
  currentDriverId,
  weightKg,
  volumeM3,
}: {
  shipmentId: string;
  drivers: { id: string; name: string; activeTasks: number }[];
  vehicles: { id: string; registration: string; capacityKg: number; capacityM3: number; status: string }[];
  currentDriverId: string | null;
  weightKg: number;
  volumeM3: number;
}) {
  const router = useRouter();
  const [driverId, setDriverId] = useState(currentDriverId ?? "");
  const [vehicleId, setVehicleId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selectedVehicle = vehicles.find((vehicle) => vehicle.id === vehicleId);
  const exceeds = selectedVehicle ? weightKg > selectedVehicle.capacityKg || volumeM3 > selectedVehicle.capacityM3 : false;

  function submit() {
    setError(null);
    if (!driverId) {
      setError("Selecione um motorista.");
      return;
    }
    startTransition(async () => {
      const result = await assignAction({ shipmentId, driverId, vehicleId: vehicleId || null });
      if (!result.ok) {
        setError(result.message);
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      router.refresh();
    });
  }

  if (drivers.length === 0) {
    return <p className="px-5 py-4 text-xs text-muted">Sem motoristas registados. Crie um utilizador com a função «Motorista».</p>;
  }

  return (
    <div className="space-y-3 px-5 py-4">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Motorista" htmlFor="assign-driver">
          <Select id="assign-driver" value={driverId} onChange={(event) => setDriverId(event.target.value)} disabled={pending}>
            <option value="">Selecionar…</option>
            {drivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driver.name} · {driver.activeTasks} tarefas
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Veículo (opcional)" htmlFor="assign-vehicle">
          <Select id="assign-vehicle" value={vehicleId} onChange={(event) => setVehicleId(event.target.value)} disabled={pending}>
            <option value="">Sem veículo</option>
            {vehicles.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id} disabled={vehicle.status === "maintenance" || vehicle.status === "retired"}>
                {vehicle.registration} · {vehicle.capacityKg} kg · {vehicle.capacityM3} m³
                {vehicle.status === "maintenance" ? " (manutenção)" : ""}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <p className="text-[11px] text-muted">
        Carga: {weightKg} kg · {volumeM3} m³
        {selectedVehicle ? ` · capacidade ${selectedVehicle.capacityKg} kg / ${selectedVehicle.capacityM3} m³` : ""}
      </p>

      {exceeds ? (
        <Notice tone="danger">A carga excede a capacidade do veículo selecionado — a atribuição será recusada pelo servidor.</Notice>
      ) : null}

      <Button onClick={submit} disabled={pending || exceeds} size="sm">
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />}
        Atribuir e agendar
      </Button>
    </div>
  );
}

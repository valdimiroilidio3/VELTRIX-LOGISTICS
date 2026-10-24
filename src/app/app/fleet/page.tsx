import { requirePagePermission } from "@/lib/auth/page-guard";
import { listDrivers, listVehicles } from "@/lib/domain/people";
import { Badge, EmptyState, Notice, Panel, PanelHeader } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { ShieldCheck, Truck, Users } from "lucide-react";

export const metadata = { title: "Frota e motoristas" };

const VEHICLE_STATUS: Record<string, { label: string; tone: "success" | "info" | "warning" | "neutral" }> = {
  available: { label: "Disponível", tone: "success" },
  in_use: { label: "Em serviço", tone: "info" },
  maintenance: { label: "Manutenção", tone: "warning" },
  retired: { label: "Abatido", tone: "neutral" },
};

export default async function FleetPage() {
  const user = await requirePagePermission("fleet:read");
  const [vehicles, drivers] = await Promise.all([listVehicles(user.organizationId), listDrivers(user.organizationId)]);

  const totalCapacity = vehicles.filter((vehicle) => vehicle.status !== "retired").reduce((sum, vehicle) => sum + vehicle.capacity_weight_kg, 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Frota e motoristas</h1>
        <p className="mt-1 text-xs text-muted">
          Capacidade registada: {totalCapacity} kg · {vehicles.length} veículos · {drivers.length} motoristas
        </p>
      </div>

      <Notice tone="info" title="Dados de frota">
        A capacidade é usada para bloquear atribuições incompatíveis. A manutenção e inspeções são registadas aqui; não
        existe telemetria — nenhuma posição de veículo é apresentada sem fonte real.
      </Notice>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel>
          <PanelHeader title="Veículos" description="Capacidade de peso e volume" actions={<Truck className="h-3.5 w-3.5 text-muted" />} />
          {vehicles.length === 0 ? (
            <EmptyState title="Sem veículos" description="Nenhum veículo registado nesta organização." />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th scope="col">Matrícula</th>
                    <th scope="col">Tipo</th>
                    <th scope="col" className="text-right">Capacidade</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Inspeção</th>
                  </tr>
                </thead>
                <tbody>
                  {vehicles.map((vehicle) => {
                    const status = VEHICLE_STATUS[vehicle.status] ?? { label: vehicle.status, tone: "neutral" as const };
                    return (
                      <tr key={vehicle.id}>
                        <td className="font-mono text-xs">{vehicle.registration_number}</td>
                        <td className="text-[11px] text-muted">{vehicle.vehicle_type}</td>
                        <td className="text-right text-[11px] tabular-nums">
                          {vehicle.capacity_weight_kg} kg
                          <br />
                          <span className="text-muted">{vehicle.capacity_volume_m3} m³</span>
                        </td>
                        <td>
                          <Badge tone={status.tone}>{status.label}</Badge>
                        </td>
                        <td className="text-[11px] text-muted">{formatDate(vehicle.last_inspection_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel>
          <PanelHeader title="Motoristas" description="Perfis com acesso ao portal móvel" actions={<Users className="h-3.5 w-3.5 text-muted" />} />
          {drivers.length === 0 ? (
            <EmptyState title="Sem motoristas" description="Crie um utilizador com a função «Motorista» para gerar o perfil de condução." />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th scope="col">Motorista</th>
                    <th scope="col">Carta</th>
                    <th scope="col">Validade</th>
                    <th scope="col" className="text-right">Tarefas</th>
                    <th scope="col">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {drivers.map((driver) => {
                    const expired = driver.licence_expiry ? new Date(driver.licence_expiry) < new Date() : false;
                    return (
                      <tr key={driver.id}>
                        <td>
                          <p className="text-xs">{driver.full_name}</p>
                          <p className="text-[10px] text-muted">{driver.email}</p>
                        </td>
                        <td className="font-mono text-[11px] text-muted">{driver.licence_number ?? "—"}</td>
                        <td className="text-[11px] text-muted">
                          {driver.licence_expiry ? (
                            <span className={expired ? "text-danger" : undefined}>
                              {formatDate(driver.licence_expiry)} {expired ? "(expirada)" : ""}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="text-right text-xs tabular-nums">{driver.active_tasks}</td>
                        <td>
                          <Badge tone={driver.employment_status === "active" ? "success" : "neutral"}>
                            {driver.employment_status === "active" ? "Ativo" : driver.employment_status}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      <Panel className="p-4">
        <p className="flex items-start gap-2 text-[11px] leading-relaxed text-muted">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
          A validade de cartas e inspeções é apresentada a partir da base de dados. Não existe verificação automática
          junto de entidades externas; a atualização é manual e auditada.
        </p>
      </Panel>
    </div>
  );
}

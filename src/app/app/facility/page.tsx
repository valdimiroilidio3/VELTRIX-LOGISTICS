import { requirePagePermission } from "@/lib/auth/page-guard";
import { getFacilityLayout } from "@/lib/domain/warehouse";
import { FacilityViewer } from "@/components/three/facility-viewer";
import { Badge, Notice, Panel, PanelHeader } from "@/components/ui";

export const metadata = { title: "Centro logístico 3D" };

export default async function FacilityPage() {
  const user = await requirePagePermission("warehouse:read");
  const layout = await getFacilityLayout(user.organizationId);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Centro logístico 3D</h1>
          <p className="mt-1 text-xs text-muted">
            {layout.warehouse?.name ?? "Sem armazém"} · {layout.zones.length} zonas representadas
          </p>
        </div>
        <Badge tone={user.organizationDataMode === "demo" ? "warning" : "success"}>
          {user.organizationDataMode === "demo" ? "Dados de demonstração" : "Dados operacionais"}
        </Badge>
      </div>

      <Notice tone="info" title="O que este modelo representa">
        Layout esquemático gerado a partir das zonas de armazenagem registadas: docas, corredores, racking e paletes
        derivados da ocupação. Os veículos e o empilhador animados são decorativos (sem
        telemetria) e não há localizações GPS de encomendas. A planta certificada das instalações é a referência legal.
      </Notice>

      <FacilityViewer zones={layout.zones} height={580} isDemo={layout.isDemo || user.organizationDataMode === "demo"} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Zonas e capacidade" description="Fonte: warehouse_zones" />
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th scope="col">Zona</th>
                  <th scope="col">Tipo</th>
                  <th scope="col" className="text-right">Ocupação</th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                {layout.zones.map((zone) => (
                  <tr key={zone.id}>
                    <td className="text-xs">{zone.name}</td>
                    <td className="text-[10px] uppercase tracking-wide text-muted">{zone.zoneType}</td>
                    <td className="text-right text-xs tabular-nums">
                      {zone.occupiedPallets}/{zone.capacityPallets}
                      <span className="ml-1 text-[10px] text-muted">({zone.utilizationPct}%)</span>
                    </td>
                    <td>
                      <Badge tone={zone.status === "full" ? "danger" : zone.status === "maintenance" ? "warning" : "success"}>
                        {zone.status === "full" ? "Cheia" : zone.status === "maintenance" ? "Manutenção" : "Ativa"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel className="p-5">
          <h2 className="text-sm font-semibold">Notas de implementação</h2>
          <ul className="mt-3 space-y-2 text-[11px] leading-relaxed text-muted">
            <li>• Geometria instanciada para paletes e prateleiras (menos draw calls, carregamento progressivo).</li>
            <li>• Modo operacional oculta paredes; modo arquitetónico mostra o involucro do edifício.</li>
            <li>• Filtros por tipo de zona e seleção com painel de ocupação.</li>
            <li>• Fallback estático em SVG quando WebGL não está disponível.</li>
            <li>• Nenhum indicador do modelo é calculado no cliente: os valores vêm do servidor.</li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}

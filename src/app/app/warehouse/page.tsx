import Link from "next/link";
import { Boxes, PackageSearch, Warehouse } from "lucide-react";
import { requirePagePermission } from "@/lib/auth/page-guard";
import { getWarehouseOverview } from "@/lib/domain/warehouse";
import { Badge, ButtonLink, EmptyState, Notice, Panel, PanelHeader, StatCard } from "@/components/ui";
import { InventoryMovementForm, OccupancyForm } from "@/components/app/inventory-forms";
import { formatDateTime, formatNumber, cn } from "@/lib/utils";

export const metadata = { title: "Armazém e inventário" };

const MOVEMENT_LABELS: Record<string, string> = {
  receipt: "Receção",
  putaway: "Armazenagem",
  transfer: "Transferência",
  pick: "Picking",
  dispatch: "Expedição",
  adjustment: "Ajuste",
  return: "Devolução",
};

export default async function WarehousePage() {
  const user = await requirePagePermission("warehouse:read");
  const overview = await getWarehouseOverview(user.organizationId);
  const canWrite = user.permissions.includes("inventory:write");
  const canAdjust = user.permissions.includes("warehouse:write");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Armazém e inventário</h1>
          <p className="mt-1 text-xs text-muted">
            {overview.warehouse?.name ?? "Sem armazém ativo"} · {overview.zones.length} zonas
          </p>
        </div>
        <ButtonLink href="/app/facility" size="sm" variant="secondary">
          <Boxes className="h-3.5 w-3.5" /> Ver centro 3D
        </ButtonLink>
      </div>

      {!overview.warehouse ? (
        <Notice tone="warning" title="Sem armazém registado">
          Nenhum armazém ativo nesta organização. As operações de inventário requerem um armazém com zonas definidas.
        </Notice>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Ocupação registada" value={`${overview.totals.utilizationPct}%`} hint={`${overview.totals.occupiedPallets}/${overview.totals.capacityPallets} paletes`} icon={<Warehouse className="h-4 w-4" />} />
        <StatCard label="Zonas" value={overview.zones.length} hint={`${overview.zones.filter((zone) => zone.status === "full").length} em capacidade máxima`} icon={<Boxes className="h-4 w-4" />} />
        <StatCard label="Artigos com stock" value={overview.inventory.filter((item) => item.onHand > 0).length} hint={`${overview.inventory.length} SKUs registados`} icon={<PackageSearch className="h-4 w-4" />} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <Panel>
          <PanelHeader title="Zonas" description="Ocupação física registada manualmente e auditada" />
          <ul className="divide-y divide-line/40">
            {overview.zones.map((zone) => (
              <li key={zone.id} className="px-5 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-ink">{zone.name}</p>
                    <p className="text-[10px] uppercase tracking-wide text-muted/70">{zone.zoneType}</p>
                  </div>
                  <Badge tone={zone.utilizationPct > 90 ? "danger" : zone.utilizationPct > 70 ? "warning" : "success"}>{zone.utilizationPct}%</Badge>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-line/50">
                  <div
                    className={cn("h-full rounded-full", zone.utilizationPct > 90 ? "bg-danger" : zone.utilizationPct > 70 ? "bg-warning" : "bg-accent")}
                    style={{ width: `${Math.min(100, zone.utilizationPct)}%` }}
                  />
                </div>
                <div className="mt-1 flex items-center justify-between text-[10px] text-muted">
                  <span>
                    {zone.occupiedPallets}/{zone.capacityPallets} paletes · {formatNumber(zone.unitsOnHand)} unidades
                  </span>
                  <OccupancyForm zoneId={zone.id} current={zone.occupiedPallets} capacity={zone.capacityPallets} disabled={!canAdjust} />
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel>
          <PanelHeader title="Stock por artigo" description="Saldo calculado a partir das movimentações" />
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th scope="col">SKU</th>
                  <th scope="col">Artigo</th>
                  <th scope="col" className="text-right">Saldo</th>
                  <th scope="col">Último movimento</th>
                </tr>
              </thead>
              <tbody>
                {overview.inventory.map((item) => (
                  <tr key={item.itemId}>
                    <td className="font-mono text-[10px] text-muted">{item.sku}</td>
                    <td className="max-w-[160px] truncate text-xs">{item.name}</td>
                    <td className={cn("text-right text-xs tabular-nums", item.onHand < 0 ? "text-danger" : "text-ink")}>
                      {formatNumber(item.onHand)} <span className="text-[9px] text-muted">{item.unitOfMeasure}</span>
                    </td>
                    <td className="text-[10px] text-muted">{item.lastMovementAt ? formatDateTime(item.lastMovementAt) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
        <Panel>
          <PanelHeader title="Registar movimento" description="Transacional: verifica stock antes de aplicar" />
          {overview.warehouse ? (
            <InventoryMovementForm
              warehouseId={overview.warehouse.id}
              zones={overview.zones.map((zone) => ({ id: zone.id, name: zone.name }))}
              items={overview.inventory.map((item) => ({ id: item.itemId, label: `${item.sku} — ${item.name}` }))}
              disabled={!canWrite}
            />
          ) : (
            <EmptyState title="Sem armazém" description="Crie um armazém para registar movimentos." />
          )}
        </Panel>

        <Panel>
          <PanelHeader title="Movimentos recentes" description="Últimos 40 registos" />
          {overview.movements.length === 0 ? (
            <EmptyState title="Sem movimentos" description="Nenhuma entrada ou saída registada." />
          ) : (
            <div className="max-h-[420px] overflow-y-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th scope="col">Data</th>
                    <th scope="col">Tipo</th>
                    <th scope="col">Artigo</th>
                    <th scope="col" className="text-right">Qtd.</th>
                    <th scope="col">Zona</th>
                    <th scope="col">Autor</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.movements.map((movement) => (
                    <tr key={movement.id}>
                      <td className="whitespace-nowrap text-[10px] text-muted">{formatDateTime(movement.createdAt)}</td>
                      <td className="text-[10px] text-muted">{MOVEMENT_LABELS[movement.movementType] ?? movement.movementType}</td>
                      <td className="max-w-[130px] truncate text-[11px]">{movement.sku}</td>
                      <td className={cn("text-right text-xs tabular-nums", movement.quantity < 0 ? "text-warning" : "text-success")}>{movement.quantity}</td>
                      <td className="text-[10px] text-muted">{movement.zoneName ?? "—"}</td>
                      <td className="text-[10px] text-muted">{movement.actorName ?? "sistema"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      <p className="text-[10px] leading-relaxed text-muted/70">
        Ocupação em paletes é um valor físico registado por operadores com auditoria; as movimentações contabilizam
        unidades. Não existe conversão automática entre as duas grandezas para não fabricar indicadores de capacidade.
        Ver <Link href="/app/audit" className="text-accent underline underline-offset-2">auditoria</Link>.
      </p>
    </div>
  );
}

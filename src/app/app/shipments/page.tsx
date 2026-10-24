import Link from "next/link";
import { Download, PackageSearch, Plus, Search } from "lucide-react";
import { requirePagePermission } from "@/lib/auth/page-guard";
import { listShipments } from "@/lib/domain/shipments";
import { listCustomers } from "@/lib/domain/commercial";
import { orderBy } from "@/lib/api/http";
import { SHIPMENT_STATUSES, STATUS_LABELS } from "@/lib/domain/shipment-status";
import { Badge, ButtonLink, EmptyState, Panel, Select, StatusBadge } from "@/components/ui";
import { SERVICE_LABELS, PRIORITY_LABELS, formatCurrency, formatDate, formatRelative } from "@/lib/utils";

export const metadata = { title: "Encomendas" };

interface SearchParams {
  q?: string;
  status?: string;
  priority?: string;
  customerId?: string;
  page?: string;
  sort?: string;
}

export default async function ShipmentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePagePermission("shipments:read");
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1) || 1);

  const [result, customers] = await Promise.all([
    listShipments(
      {
        status: params.status || null,
        search: params.q || null,
        priority: params.priority || null,
        customerId: params.customerId || null,
        page,
        pageSize: 20,
        orderBy: orderBy("shipments", params.sort ?? null, "created_at"),
      },
      {
        organizationId: user.organizationId,
        restrictCustomerId: user.role === "customer" ? user.customerId : null,
        restrictDriverId: user.role === "driver" ? user.driverId : null,
      },
    ),
    user.role === "customer" ? Promise.resolve([]) : listCustomers(user.organizationId, null),
  ]);

  const canCreate = user.permissions.includes("shipments:create");
  const canRequest = user.permissions.includes("shipments:request");
  const queryBase = new URLSearchParams(
    Object.entries(params).filter(([, value]) => Boolean(value)) as [string, string][],
  );
  const exportHref = `/app/shipments/export?${queryBase.toString()}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Encomendas</h1>
          <p className="mt-1 text-xs text-muted">
            {result.total} registos · filtros validados no servidor · {result.totalPages} página(s)
          </p>
        </div>
        <div className="flex gap-2">
          <ButtonLink href={exportHref} size="sm" variant="secondary">
            <Download className="h-3.5 w-3.5" /> Exportar CSV
          </ButtonLink>
          {canCreate || canRequest ? (
            <ButtonLink href="/app/shipments/new" size="sm">
              <Plus className="h-3.5 w-3.5" /> {canCreate ? "Nova encomenda" : "Novo pedido"}
            </ButtonLink>
          ) : null}
        </div>
      </div>

      <Panel>
        <form className="flex flex-wrap items-end gap-2 border-b border-line/70 p-4" action="/app/shipments" role="search">
          <div className="min-w-[220px] flex-1">
            <label className="label" htmlFor="q">
              Pesquisar
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" aria-hidden />
              <input
                id="q"
                name="q"
                defaultValue={params.q ?? ""}
                placeholder="Código, cliente ou contacto"
                className="field h-10 pl-9"
              />
            </div>
          </div>
          <div className="w-[170px]">
            <label className="label" htmlFor="status">
              Estado
            </label>
            <Select id="status" name="status" defaultValue={params.status ?? ""} className="h-10">
              <option value="">Todos</option>
              {SHIPMENT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          </div>
          {customers.length > 0 ? (
            <div className="w-[200px]">
              <label className="label" htmlFor="customerId">
                Cliente
              </label>
              <Select id="customerId" name="customerId" defaultValue={params.customerId ?? ""} className="h-10">
                <option value="">Todos</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.company_name ?? customer.contact_name}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          <div className="flex gap-2">
            <button type="submit" className="h-10 rounded-xl bg-accent px-3.5 text-sm font-medium text-accent-foreground">
              Filtrar
            </button>
            <Link href="/app/shipments" className="grid h-10 place-items-center rounded-xl border border-line px-3 text-xs text-muted hover:text-ink">
              Limpar
            </Link>
          </div>
        </form>

        {result.items.length === 0 ? (
          <EmptyState
            icon={<PackageSearch className="h-4 w-4" />}
            title="Sem resultados"
            description="Nenhuma encomenda corresponde aos filtros aplicados. Ajuste a pesquisa ou crie uma nova encomenda."
            action={canCreate ? <ButtonLink href="/app/shipments/new" size="sm">Criar encomenda</ButtonLink> : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th scope="col">Código</th>
                  <th scope="col">Cliente</th>
                  <th scope="col">Serviço</th>
                  <th scope="col">Rota</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Entrega</th>
                  <th scope="col" className="text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((shipment) => (
                  <tr key={shipment.id}>
                    <td>
                      <Link href={`/app/shipments/${shipment.id}`} className="font-mono text-xs text-ink hover:text-accent">
                        {shipment.trackingCode}
                      </Link>
                      <p className="mt-0.5 text-[10px] text-muted">{formatRelative(shipment.createdAt)}</p>
                    </td>
                    <td className="max-w-[190px]">
                      <p className="truncate text-xs">{shipment.customer.name}</p>
                      <p className="truncate text-[10px] text-muted">{shipment.customer.email}</p>
                    </td>
                    <td className="text-[11px] text-muted">
                      {SERVICE_LABELS[shipment.serviceType] ?? shipment.serviceType}
                      <p className="text-[10px] text-muted/70">{PRIORITY_LABELS[shipment.priority] ?? shipment.priority}</p>
                    </td>
                    <td className="text-[11px] text-muted">
                      {shipment.origin.city} → {shipment.destination.city}
                    </td>
                    <td>
                      <StatusBadge status={shipment.status} />
                    </td>
                    <td className="text-[11px] text-muted">
                      {shipment.actualDeliveryAt ? formatDate(shipment.actualDeliveryAt) : shipment.estimatedDeliveryAt ? formatDate(shipment.estimatedDeliveryAt) : "—"}
                    </td>
                    <td className="text-right text-xs tabular-nums">
                      {shipment.quotedAmount > 0 ? (
                        formatCurrency(shipment.quotedAmount, shipment.currency)
                      ) : (
                        <span className="text-[10px] text-warning">A orçamentar</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-line/70 px-4 py-3 text-xs text-muted">
          <span>
            Página {result.page} de {result.totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link
                href={{ pathname: "/app/shipments", query: { ...params, page: String(page - 1) } }}
                className="rounded-lg border border-line px-2.5 py-1 hover:text-ink"
              >
                Anterior
              </Link>
            ) : null}
            {page < result.totalPages ? (
              <Link
                href={{ pathname: "/app/shipments", query: { ...params, page: String(page + 1) } }}
                className="rounded-lg border border-line px-2.5 py-1 hover:text-ink"
              >
                Seguinte
              </Link>
            ) : null}
          </div>
        </div>
      </Panel>

      <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted">
        <Badge tone="neutral">Estados: {SHIPMENT_STATUSES.length}</Badge>
        <span>·</span>
        <span>A exportação CSV respeita os filtros e as permissões da sua função.</span>
      </div>
    </div>
  );
}

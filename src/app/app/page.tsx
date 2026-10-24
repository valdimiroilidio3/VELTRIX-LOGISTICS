import Link from "next/link";
import {
  AlertTriangle,
  ClipboardList,
  FileText,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Gauge,
  PackageCheck,
  Receipt,
  Truck,
  Warehouse,
} from "lucide-react";
import { redirect } from "next/navigation";
import { requirePagePermission } from "@/lib/auth/page-guard";
import { getAnalyticsOverview } from "@/lib/domain/analytics";
import { listShipments } from "@/lib/domain/shipments";
import { Badge, ButtonLink, EmptyState, Panel, PanelHeader, StatCard, StatusBadge } from "@/components/ui";
import { formatCurrency, formatDateTime, formatNumber, formatRelative } from "@/lib/utils";
import { VolumeChart } from "@/components/app/charts";
import { CustomerPortal } from "@/components/app/customer-portal";

export const metadata = { title: "Painel operacional" };

export default async function DashboardPage() {
  // Drivers work from a task-first view; the organisation dashboard is not theirs.
  const user = await requirePagePermission("shipments:read", "/app");
  if (user.role === "driver") redirect("/app/driver");
  // Customers get a portal view limited to their own data, never org-wide metrics.
  if (user.role === "customer") return <CustomerPortal user={user} />;
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 24 * 3600_000);

  const [analytics, recent, exceptions] = await Promise.all([
    getAnalyticsOverview(user.organizationId, { from: from.toISOString(), to: to.toISOString() }),
    listShipments(
      { page: 1, pageSize: 6, orderBy: "created_at DESC" },
      { organizationId: user.organizationId },
    ),
    listShipments(
      { page: 1, pageSize: 4, status: "exception", orderBy: "updated_at DESC" },
      { organizationId: user.organizationId },
    ),
  ]);

  const metrics = analytics.metrics;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Painel operacional</h1>
          <p className="mt-1 text-xs text-muted">
            Período: {formatDateTime(from.toISOString())} → {formatDateTime(to.toISOString())} · todos os indicadores
            têm definição documentada em <span className="text-ink">Relatórios</span>.
          </p>
        </div>
        <div className="flex gap-2">
          <ButtonLink href="/app/shipments/new" size="sm">
            Nova encomenda
          </ButtonLink>
          <ButtonLink href="/app/analytics" size="sm" variant="secondary">
            Relatórios <ArrowUpRight className="h-3.5 w-3.5" />
          </ButtonLink>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Pedidos e orçamentos">
        <StatCard
          label="Pedidos sem orçamento"
          value={formatNumber(metrics.pendingQuoteRequests)}
          hint="Estado «Pedido de orçamento» — requer ação comercial"
          icon={<ClipboardList className="h-4 w-4" />}
          tone={(metrics.pendingQuoteRequests ?? 0) > 0 ? "warning" : "neutral"}
        />
        <StatCard
          label="Orçamentos enviados"
          value={formatNumber(metrics.quotesSent)}
          hint="À espera de decisão do cliente"
          icon={<FileText className="h-4 w-4" />}
        />
        <StatCard
          label="Encomendas confirmadas"
          value={formatNumber(metrics.shipmentsConfirmed)}
          hint="Confirmadas ou já atribuídas a motorista"
          icon={<PackageCheck className="h-4 w-4" />}
        />
        <StatCard
          label="Orçamentos aceites"
          value={formatNumber(metrics.quotesAccepted)}
          hint="Aceites nos últimos 30 dias"
          icon={<CheckCircle2 className="h-4 w-4" />}
          tone="accent"
        />
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores operacionais">
        <StatCard
          label="Encomendas criadas"
          value={formatNumber(metrics.shipmentsCreated)}
          hint="Criadas nos últimos 30 dias"
          icon={<PackageCheck className="h-4 w-4" />}
        />
        <StatCard
          label="Em trânsito agora"
          value={formatNumber(metrics.shipmentsInTransit)}
          hint="Recolhidas, em trânsito ou em distribuição"
          icon={<Truck className="h-4 w-4" />}
          tone="accent"
        />
        <StatCard
          label="Entregas concluídas"
          value={formatNumber(metrics.deliveriesCompleted)}
          hint={`Tempo médio ${metrics.averageDeliveryHours} h`}
          icon={<CheckCircle2 className="h-4 w-4" />}
          tone="success"
        />
        <StatCard
          label="Atrasadas"
          value={formatNumber(metrics.deliveriesLate)}
          hint="Estimativa ultrapassada ou entrega fora de prazo"
          icon={<Clock3 className="h-4 w-4" />}
          tone={(metrics.deliveriesLate ?? 0) > 0 ? "warning" : "neutral"}
        />
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores secundários">
        <StatCard
          label="Ocorrências abertas"
          value={formatNumber(metrics.openExceptions)}
          hint="Estado exception ou entrega falhada"
          icon={<AlertTriangle className="h-4 w-4" />}
          tone={(metrics.openExceptions ?? 0) > 0 ? "danger" : "neutral"}
        />
        <StatCard
          label="Taxa de sucesso"
          value={`${metrics.deliverySuccessRate}%`}
          hint="Entregues vs entregas falhadas/devoluções"
          icon={<Gauge className="h-4 w-4" />}
          tone="success"
        />
        <StatCard
          label="Ocupação do armazém"
          value={`${metrics.warehouseUtilization}%`}
          hint="Paletes ocupadas / capacidade registada"
          icon={<Warehouse className="h-4 w-4" />}
        />
        <StatCard
          label="Faturação emitida"
          value={formatCurrency(metrics.invoicedRevenue)}
          hint="Emitida no período · não representa recebimento"
          icon={<Receipt className="h-4 w-4" />}
        />
      </section>

      {analytics.metrics.shipmentsCreated === 0 && analytics.metrics.pendingQuoteRequests === 0 ? (
        <Panel className="p-6">
          <EmptyState
            icon={<PackageCheck className="h-4 w-4" />}
            title="Ainda não existem encomendas"
            description="Crie o primeiro pedido para começar a acompanhar a operação. Todos os indicadores acima são calculados a partir da base de dados — ficarão a zero até existir atividade real."
            action={
              <ButtonLink href="/app/shipments/new" size="sm">
                Criar primeira encomenda
              </ButtonLink>
            }
          />
        </Panel>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        <Panel>
          <PanelHeader
            title="Volume diário"
            description="Encomendas criadas vs entregas confirmadas no período"
            actions={<Badge tone="neutral">30 dias</Badge>}
          />
          <div className="px-2 py-4">
            <VolumeChart data={analytics.dailyVolume} />
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Distribuição por estado" description="Todas as encomendas da organização" />
          <ul className="divide-y divide-line/40 px-5 py-2">
            {analytics.statusBreakdown.slice(0, 8).map((row) => {
              const total = analytics.statusBreakdown.reduce((sum, item) => sum + item.count, 0) || 1;
              return (
                <li key={row.status} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <StatusBadge status={row.status} />
                      <span className="text-xs tabular-nums text-muted">{row.count}</span>
                    </div>
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-line/50">
                      <div className="h-full rounded-full bg-accent/60" style={{ width: `${Math.round((row.count / total) * 100)}%` }} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        <Panel>
          <PanelHeader
            title="Encomendas recentes"
            description="Atualizadas ou criadas mais recentemente"
            actions={
              <Link href="/app/shipments" className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
                Ver todas <ArrowRight className="h-3 w-3" />
              </Link>
            }
          />
          {recent.items.length === 0 ? (
            <EmptyState
              title="Sem encomendas"
              description="Ainda não existem encomendas registadas para esta organização."
              action={<ButtonLink href="/app/shipments/new" size="sm">Criar encomenda</ButtonLink>}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th scope="col">Código</th>
                    <th scope="col">Cliente</th>
                    <th scope="col">Rota</th>
                    <th scope="col">Estado</th>
                    <th scope="col" className="text-right">Atualizada</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.items.map((shipment) => (
                    <tr key={shipment.id}>
                      <td>
                        <Link href={`/app/shipments/${shipment.id}`} className="font-mono text-xs text-ink hover:text-accent">
                          {shipment.trackingCode}
                        </Link>
                      </td>
                      <td className="max-w-[180px] truncate text-xs">{shipment.customer.name}</td>
                      <td className="text-xs text-muted">
                        {shipment.origin.city} → {shipment.destination.city}
                      </td>
                      <td>
                        <StatusBadge status={shipment.status} />
                      </td>
                      <td className="text-right text-[11px] text-muted">{formatRelative(shipment.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel>
          <PanelHeader
            title="Ocorrências"
            description="Requerem ação operacional"
            actions={exceptions.items.length > 0 ? <Badge tone="danger">{exceptions.items.length}</Badge> : null}
          />
          {exceptions.items.length === 0 ? (
            <EmptyState title="Sem ocorrências abertas" description="Nenhuma encomenda em estado de exceção." icon={<CheckCircle2 className="h-4 w-4" />} />
          ) : (
            <ul className="divide-y divide-line/40">
              {exceptions.items.map((shipment) => (
                <li key={shipment.id} className="px-5 py-3">
                  <Link href={`/app/shipments/${shipment.id}`} className="group flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-ink group-hover:text-accent">{shipment.trackingCode}</p>
                      <p className="mt-0.5 truncate text-[11px] text-muted">{shipment.customer.name}</p>
                      <p className="mt-1 line-clamp-2 text-[11px] text-danger/90">{shipment.exceptionReason ?? "Sem motivo registado"}</p>
                    </div>
                    <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted group-hover:text-accent" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

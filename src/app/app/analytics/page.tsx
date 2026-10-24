import { requirePagePermission } from "@/lib/auth/page-guard";
import { getAnalyticsOverview } from "@/lib/domain/analytics";
import { Badge, Panel, PanelHeader, StatCard } from "@/components/ui";
import { StatusBarChart, DelayTrendChart } from "@/components/app/charts";
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/utils";

export const metadata = { title: "Relatórios" };

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const user = await requirePagePermission("analytics:read");
  const params = await searchParams;
  const days = Math.min(365, Math.max(7, Number(params.days ?? 30) || 30));
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 3600_000);
  const overview = await getAnalyticsOverview(user.organizationId, { from: from.toISOString(), to: to.toISOString() });
  const metrics = overview.metrics;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Relatórios operacionais</h1>
          <p className="mt-1 text-xs text-muted">
            {formatDateTime(from.toISOString())} → {formatDateTime(to.toISOString())} · dados de{" "}
            {overview.dataMode === "demo" ? "demonstração" : "operação real"}
          </p>
        </div>
        <form action="/app/analytics" className="flex items-center gap-2">
          <label htmlFor="days" className="text-[11px] text-muted">
            Período
          </label>
          <select id="days" name="days" defaultValue={String(days)} className="field h-9 w-auto py-0 text-xs">
            <option value="7">7 dias</option>
            <option value="30">30 dias</option>
            <option value="90">90 dias</option>
            <option value="180">180 dias</option>
          </select>
          <button type="submit" className="h-9 rounded-lg bg-accent px-3 text-xs font-medium text-accent-foreground">
            Aplicar
          </button>
        </form>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Encomendas criadas" value={formatNumber(metrics.shipmentsCreated)} hint="No período selecionado" />
        <StatCard label="Entregas concluídas" value={formatNumber(metrics.deliveriesCompleted)} hint={`Média ${metrics.averageDeliveryHours} h`} tone="success" />
        <StatCard label="Entregas atrasadas" value={formatNumber(metrics.deliveriesLate)} hint="Prazo ultrapassado" tone={(metrics.deliveriesLate ?? 0) > 0 ? "warning" : "neutral"} />
        <StatCard label="Taxa de sucesso" value={`${metrics.deliverySuccessRate}%`} hint="Entregues vs falhadas" tone="success" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel>
          <PanelHeader title="Distribuição por estado" description="Todas as encomendas da organização" />
          <div className="px-2 py-3">
            <StatusBarChart data={overview.statusBreakdown} />
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Entregas vs criação" description="Tendência diária no período" />
          <div className="px-2 py-3">
            <DelayTrendChart data={overview.dailyVolume} />
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <Panel>
          <PanelHeader title="Definições dos indicadores" description="Cada número tem origem, período e regra documentada" />
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th scope="col">Indicador</th>
                  <th scope="col">Definição</th>
                  <th scope="col">Origem</th>
                </tr>
              </thead>
              <tbody>
                {overview.definitions.map((definition) => (
                  <tr key={definition.key}>
                    <td className="whitespace-nowrap text-xs">{definition.label}</td>
                    <td className="text-[11px] leading-relaxed text-muted">{definition.definition}</td>
                    <td>
                      <code className="rounded bg-bg/60 px-1.5 py-0.5 font-mono text-[10px] text-muted">{definition.source}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel>
            <PanelHeader title="Faturação" description="Emitida no período e saldo em aberto" />
            <div className="space-y-3 px-5 py-4">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted">Faturação emitida</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{formatCurrency(metrics.invoicedRevenue)}</p>
                <p className="mt-0.5 text-[10px] text-muted/70">Não representa recebimento efetivo.</p>
              </div>
              <div className="rounded-xl border border-line/60 bg-bg/40 px-3.5 py-3">
                <p className="text-[11px] text-muted">Faturas pendentes</p>
                <p className="mt-1 text-base font-semibold tabular-nums text-warning">{formatCurrency(metrics.pendingInvoices)}</p>
              </div>
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Top clientes" description="Por encomendas no período" />
            <ul className="divide-y divide-line/40">
              {overview.topCustomers.map((customer) => (
                <li key={customer.id} className="flex items-center justify-between gap-2 px-5 py-2.5">
                  <span className="min-w-0 truncate text-xs text-ink">{customer.name}</span>
                  <span className="flex shrink-0 items-center gap-2 text-[11px] text-muted">
                    <Badge tone="neutral">{customer.shipments}</Badge>
                    {formatCurrency(customer.invoicedCents)}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}

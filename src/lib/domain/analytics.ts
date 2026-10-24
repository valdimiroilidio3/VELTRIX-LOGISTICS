import "server-only";
import { db, type Db } from "@/lib/db";

/**
 * Operational analytics.
 * Every metric carries its definition, period and data source so that no figure
 * on the dashboard is unexplained. Revenue figures are *registered billing*
 * (invoiced), never presented as cash received.
 */

export interface MetricDefinition {
  key: string;
  label: string;
  definition: string;
  source: string;
  unit: "count" | "currency" | "percent" | "hours";
}

export const METRIC_DEFINITIONS: MetricDefinition[] = [
  { key: "pendingQuoteRequests", label: "Pedidos sem orçamento", definition: "Encomendas no estado «Pedido de orçamento» (pending_quote), independentemente da data de criação.", source: "shipments", unit: "count" },
  { key: "quotesSent", label: "Orçamentos enviados", definition: "Orçamentos com estado «Enviado» (sent) e ainda sem decisão do cliente.", source: "quotes", unit: "count" },
  { key: "quotesAccepted", label: "Orçamentos aceites", definition: "Orçamentos com estado «Aceite» dentro do período (decided_at).", source: "quotes", unit: "count" },
  { key: "shipmentsCreated", label: "Encomendas criadas", definition: "Encomendas com created_at dentro do período.", source: "shipments", unit: "count" },
  { key: "shipmentsInTransit", label: "Em trânsito", definition: "Estado operacional atual: picked_up, in_transit ou out_for_delivery.", source: "shipments", unit: "count" },
  { key: "deliveriesCompleted", label: "Entregas concluídas", definition: "Encomendas com actual_delivery_at dentro do período.", source: "shipments", unit: "count" },
  { key: "deliveriesLate", label: "Entregas atrasadas", definition: "Não terminais com estimated_delivery_at já ultrapassada, ou entregues após a estimativa.", source: "shipments", unit: "count" },
  { key: "openExceptions", label: "Ocorrências abertas", definition: "Estado atual exception ou failed_delivery.", source: "shipments", unit: "count" },
  { key: "fleetUtilization", label: "Utilização da frota", definition: "Veículos em serviço / veículos ativos (exclui manutenção e abatidos).", source: "vehicles", unit: "percent" },
  { key: "warehouseUtilization", label: "Ocupação do armazém", definition: "Paletes ocupadas registadas / capacidade total registada.", source: "warehouse_zones", unit: "percent" },
  { key: "averageDeliveryHours", label: "Tempo médio de entrega", definition: "Média de (actual_delivery_at − created_at) para entregas concluídas no período.", source: "shipments", unit: "hours" },
  { key: "deliverySuccessRate", label: "Taxa de sucesso", definition: "Entregues / (entregues + entrega falhada + devolvidas) no período.", source: "shipments", unit: "percent" },
  { key: "invoicedRevenue", label: "Faturação emitida", definition: "Soma de invoices.total_cents emitidas no período (não representa recebimento).", source: "invoices", unit: "currency" },
  { key: "pendingInvoices", label: "Faturas pendentes", definition: "Faturas com estado issued ou overdue (saldo em aberto).", source: "invoices", unit: "currency" },
];

export interface AnalyticsOverview {
  period: { from: string; to: string };
  dataMode: "demo" | "live";
  metrics: Record<string, number>;
  statusBreakdown: { status: string; count: number }[];
  dailyVolume: { date: string; created: number; delivered: number }[];
  topCustomers: { id: string; name: string; shipments: number; invoicedCents: number }[];
  definitions: MetricDefinition[];
}

const num = (value: unknown) => Number(value ?? 0);

export async function getAnalyticsOverview(
  organizationId: string,
  range: { from: string; to: string },
  database: Db = db(),
): Promise<AnalyticsOverview> {
  const { from, to } = range;

  const created = await database.get<{ c: number }>(
    "SELECT COUNT(*) AS c FROM shipments WHERE organization_id = ? AND created_at >= ? AND created_at <= ?",
    [organizationId, from, to],
  );
  const inTransit = await database.get<{ c: number }>(
    "SELECT COUNT(*) AS c FROM shipments WHERE organization_id = ? AND status IN ('picked_up','in_transit','out_for_delivery')",
    [organizationId],
  );
  const delivered = await database.get<{ c: number }>(
    "SELECT COUNT(*) AS c FROM shipments WHERE organization_id = ? AND actual_delivery_at >= ? AND actual_delivery_at <= ? AND status = 'delivered'",
    [organizationId, from, to],
  );
  const late = await database.get<{ c: number }>(
    `SELECT COUNT(*) AS c FROM shipments WHERE organization_id = ?
     AND ((status NOT IN ('delivered','cancelled','returned') AND estimated_delivery_at IS NOT NULL AND estimated_delivery_at < ?)
       OR (status = 'delivered' AND actual_delivery_at > estimated_delivery_at))`,
    [organizationId, to],
  );
  const exceptions = await database.get<{ c: number }>(
    "SELECT COUNT(*) AS c FROM shipments WHERE organization_id = ? AND status IN ('exception','failed_delivery')",
    [organizationId],
  );
  const fleet = await database.get<{ total: number; active: number }>(
    `SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'in_use' THEN 1 ELSE 0 END) AS active
     FROM vehicles WHERE organization_id = ? AND status NOT IN ('retired')`,
    [organizationId],
  );
  const warehouse = await database.get<{ capacity: number; occupied: number }>(
    `SELECT COALESCE(SUM(z.capacity_pallets),0) AS capacity, COALESCE(SUM(z.occupied_pallets),0) AS occupied
     FROM warehouse_zones z JOIN warehouses w ON w.id = z.warehouse_id WHERE w.organization_id = ?`,
    [organizationId],
  );
  const deliveredRows = await database.all<{ created_at: string; actual_delivery_at: string | null }>(
    `SELECT created_at, actual_delivery_at FROM shipments
     WHERE organization_id = ? AND status = 'delivered' AND actual_delivery_at >= ? AND actual_delivery_at <= ?`,
    [organizationId, from, to],
  );
  const averageDeliveryHours = deliveredRows.length
    ? deliveredRows.reduce((sum, row) => {
        if (!row.actual_delivery_at) return sum;
        return sum + (new Date(row.actual_delivery_at).getTime() - new Date(row.created_at).getTime()) / 3_600_000;
      }, 0) / deliveredRows.length
    : 0;

  const success = await database.get<{ delivered: number; failed: number }>(
    `SELECT
       SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS delivered,
       SUM(CASE WHEN status IN ('failed_delivery','returned') THEN 1 ELSE 0 END) AS failed
     FROM shipments WHERE organization_id = ? AND created_at >= ? AND created_at <= ?`,
    [organizationId, from, to],
  );

  const invoiced = await database.get<{ total: number | null }>(
    `SELECT SUM(total_cents) AS total FROM invoices
     WHERE organization_id = ? AND status IN ('issued','paid','overdue') AND issued_at >= ? AND issued_at <= ?`,
    [organizationId, from, to],
  );
  const pending = await database.get<{ total: number | null }>(
    `SELECT SUM(total_cents) AS total FROM invoices WHERE organization_id = ? AND status IN ('issued','overdue')`,
    [organizationId],
  );

  const pendingQuotes = await database.get<{ c: number }>(
    "SELECT COUNT(*) AS c FROM shipments WHERE organization_id = ? AND status = 'pending_quote'",
    [organizationId],
  );
  const sentQuotes = await database.get<{ c: number }>(
    "SELECT COUNT(*) AS c FROM quotes WHERE organization_id = ? AND status = 'sent'",
    [organizationId],
  );
  const acceptedQuotes = await database.get<{ c: number }>(
    "SELECT COUNT(*) AS c FROM quotes WHERE organization_id = ? AND status = 'accepted' AND decided_at >= ? AND decided_at <= ?",
    [organizationId, from, to],
  );
  const confirmedShipments = await database.get<{ c: number }>(
    "SELECT COUNT(*) AS c FROM shipments WHERE organization_id = ? AND status IN ('confirmed','assigned')",
    [organizationId],
  );

  const statusBreakdown = await database.all<{ status: string; count: number }>(
    "SELECT status, COUNT(*) AS count FROM shipments WHERE organization_id = ? GROUP BY status ORDER BY count DESC",
    [organizationId],
  );

  const dailyCreated = await database.all<{ day: string; c: number }>(
    `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS c FROM shipments
     WHERE organization_id = ? AND created_at >= ? AND created_at <= ? GROUP BY day`,
    [organizationId, from, to],
  );
  const dailyDelivered = await database.all<{ day: string; c: number }>(
    `SELECT substr(actual_delivery_at, 1, 10) AS day, COUNT(*) AS c FROM shipments
     WHERE organization_id = ? AND status = 'delivered' AND actual_delivery_at >= ? AND actual_delivery_at <= ? GROUP BY day`,
    [organizationId, from, to],
  );
  const days = new Map<string, { date: string; created: number; delivered: number }>();
  for (const row of dailyCreated) {
    days.set(row.day, { date: row.day, created: num(row.c), delivered: 0 });
  }
  for (const row of dailyDelivered) {
    const existing = days.get(row.day) ?? { date: row.day, created: 0, delivered: 0 };
    existing.delivered = num(row.c);
    days.set(row.day, existing);
  }

  const topCustomers = await database.all<{ id: string; name: string; shipments: number; invoiced_cents: number | null }>(
    `SELECT c.id, COALESCE(c.company_name, c.contact_name) AS name,
            COUNT(DISTINCT s.id) AS shipments,
            (SELECT COALESCE(SUM(i.total_cents),0) FROM invoices i WHERE i.customer_id = c.id AND i.status IN ('issued','paid','overdue')) AS invoiced_cents
     FROM customers c LEFT JOIN shipments s ON s.customer_id = c.id AND s.created_at >= ? AND s.created_at <= ?
     WHERE c.organization_id = ?
     GROUP BY c.id, name ORDER BY shipments DESC, invoiced_cents DESC LIMIT 5`,
    [from, to, organizationId],
  );

  const totalFleet = num(fleet?.total);
  const successDelivered = num(success?.delivered);
  const successFailed = num(success?.failed);
  const capacity = num(warehouse?.capacity);
  const occupied = num(warehouse?.occupied);

  const org = await database.get<{ data_mode: "demo" | "live" }>("SELECT data_mode FROM organizations WHERE id = ?", [organizationId]);

  return {
    period: { from, to },
    dataMode: org?.data_mode ?? "live",
    metrics: {
      pendingQuoteRequests: num(pendingQuotes?.c),
      quotesSent: num(sentQuotes?.c),
      quotesAccepted: num(acceptedQuotes?.c),
      shipmentsConfirmed: num(confirmedShipments?.c),
      shipmentsCreated: num(created?.c),
      shipmentsInTransit: num(inTransit?.c),
      deliveriesCompleted: num(delivered?.c),
      deliveriesLate: num(late?.c),
      openExceptions: num(exceptions?.c),
      fleetUtilization: totalFleet > 0 ? Math.round((num(fleet?.active) / totalFleet) * 100) : 0,
      warehouseUtilization: capacity > 0 ? Math.round((occupied / capacity) * 100) : 0,
      averageDeliveryHours: Math.round(averageDeliveryHours * 10) / 10,
      deliverySuccessRate: successDelivered + successFailed > 0
        ? Math.round((successDelivered / (successDelivered + successFailed)) * 100)
        : 0,
      invoicedRevenue: num(invoiced?.total),
      pendingInvoices: num(pending?.total),
    },
    statusBreakdown: statusBreakdown.map((row) => ({ status: row.status, count: num(row.count) })),
    dailyVolume: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
    topCustomers: topCustomers.map((row) => ({
      id: row.id,
      name: row.name,
      shipments: num(row.shipments),
      invoicedCents: num(row.invoiced_cents),
    })),
    definitions: METRIC_DEFINITIONS,
  };
}

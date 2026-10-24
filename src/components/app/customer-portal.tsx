import Link from "next/link";
import { ArrowUpRight, FileText, PackageSearch } from "lucide-react";
import type { SessionUser } from "@/lib/auth/session";
import { listShipments } from "@/lib/domain/shipments";
import { listInvoices } from "@/lib/domain/commercial";
import { listAdminQuotes } from "@/lib/domain/quotes";
import { CopyTracking } from "@/components/app/copy-tracking";
import { Badge, EmptyState, Panel, PanelHeader, StatCard, StatusBadge } from "@/components/ui";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";

/**
 * Customer portal dashboard.
 * Scoped exclusively to records owned by the signed-in customer account: no
 * organisation-wide totals, no other customers' data, no internal metrics.
 */
export async function CustomerPortal({ user }: { user: SessionUser }) {
  const scope = { organizationId: user.organizationId, restrictCustomerId: user.customerId };

  const [all, invoices, quotes] = await Promise.all([
    listShipments({ page: 1, pageSize: 50, orderBy: "created_at DESC" }, scope),
    listInvoices(user.organizationId, { customerId: user.customerId }),
    listAdminQuotes(user.organizationId, { customerId: user.customerId }),
  ]);

  const inProgress = all.items.filter((shipment) => !["delivered", "cancelled", "returned"].includes(shipment.status));
  const delivered = all.items.filter((shipment) => shipment.status === "delivered");
  const outstanding = invoices
    .filter((invoice) => invoice.status === "issued" || invoice.status === "overdue")
    .reduce((sum, invoice) => sum + invoice.total_cents, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">A sua conta</h1>
        <p className="mt-1 text-xs text-muted">
          Encomendas e faturas da sua empresa. Só vê os registos associados à sua conta.
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Resumo da conta">
        <StatCard label="Encomendas ativas" value={formatNumber(inProgress.length)} hint="Em curso neste momento" icon={<PackageSearch className="h-4 w-4" />} />
        <StatCard label="Entregas concluídas" value={formatNumber(delivered.length)} hint="Histórico da conta" icon={<PackageSearch className="h-4 w-4" />} tone="accent" />
        <StatCard
          label="Faturas em aberto"
          value={formatCurrency(outstanding, user.currency)}
          hint={`${invoices.filter((invoice) => invoice.status === "issued" || invoice.status === "overdue").length} documentos`}
          icon={<FileText className="h-4 w-4" />}
        />
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr] xl:items-start">
        <Panel>
          <PanelHeader
            title="Encomendas"
            description="Últimas 50"
            actions={
              <Link href="/app/shipments" className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline">
                Ver todas <ArrowUpRight className="h-3 w-3" />
              </Link>
            }
          />
          {all.items.length === 0 ? (
            <EmptyState title="Sem encomendas" description="Ainda não existem encomendas associadas à sua conta." icon={<PackageSearch className="h-4 w-4" />} />
          ) : (
            <ul className="divide-y divide-line/40">
              {all.items.slice(0, 8).map((shipment) => (
                <li key={shipment.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <Link href={`/app/shipments/${shipment.id}`} className="font-mono text-[11px] text-ink hover:text-accent">
                        {shipment.trackingCode}
                      </Link>
                      <CopyTracking code={shipment.trackingCode} />
                    </div>
                    <p className="truncate text-[11px] text-muted">
                      {shipment.origin.city} → {shipment.destination.city} · {formatDate(shipment.createdAt)}
                    </p>
                  </div>
                  <StatusBadge status={shipment.status} />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel>
          <PanelHeader title="Faturação" description="Documentos emitidos à sua conta" />
          {invoices.length === 0 ? (
            <EmptyState title="Sem faturas" description="Não existem documentos emitidos." icon={<FileText className="h-4 w-4" />} />
          ) : (
            <ul className="divide-y divide-line/40">
              {invoices.slice(0, 8).map((invoice) => (
                <li key={invoice.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div>
                    <p className="font-mono text-[11px] text-ink">{invoice.invoice_number}</p>
                    <p className="text-[10px] text-muted">
                      {invoice.issued_at ? formatDate(invoice.issued_at) : "Não emitida"}
                      {invoice.due_at ? ` · vence ${formatDate(invoice.due_at)}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] tabular-nums text-ink">{formatCurrency(invoice.total_cents, invoice.currency)}</p>
                    <Badge tone={invoice.status === "paid" ? "success" : invoice.status === "overdue" ? "danger" : "neutral"}>
                      {invoice.status === "paid" ? "pago" : invoice.status === "overdue" ? "vencida" : invoice.status === "issued" ? "emitida" : invoice.status}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="Orçamentos" description="Propostas recebidas da equipa comercial" />
        {quotes.length === 0 ? (
          <EmptyState
            title="Sem orçamentos"
            description="Os orçamentos aparecem aqui assim que a equipa comercial os enviar."
            icon={<FileText className="h-4 w-4" />}
          />
        ) : (
          <ul className="divide-y divide-line/40">
            {quotes.map((quote) => (
              <li key={quote.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] text-ink">{quote.reference}</span>
                    <Badge tone={quote.status === "accepted" ? "success" : quote.status === "sent" ? "info" : quote.status === "rejected" ? "danger" : "neutral"}>
                      {quote.status === "draft"
                        ? "em preparação"
                        : quote.status === "sent"
                          ? "aguarda a sua decisão"
                          : quote.status === "accepted"
                            ? "aceite"
                            : quote.status === "rejected"
                              ? "recusado"
                              : "expirado"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-[11px] text-muted">
                    {quote.origin} → {quote.destination}
                    {quote.tracking_code ? ` · ${quote.tracking_code}` : ""}
                    {quote.valid_until ? ` · válido até ${formatDate(quote.valid_until)}` : ""}
                  </p>
                  {quote.description ? <p className="text-[10px] text-muted/80">{quote.description}</p> : null}
                </div>
                <div className="text-right">
                  <p className="text-[11px] tabular-nums text-ink">
                    {quote.status === "draft" ? "—" : formatCurrency(quote.total_cents, quote.currency)}
                  </p>
                  <p className="text-[10px] text-muted/70">{quote.status === "draft" ? "não enviado" : "valor com impostos"}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="border-t border-line/40 px-5 py-3 text-[10px] leading-relaxed text-muted/70">
          Orçamentos em preparação não têm valor visível. Para aceitar ou recusar, responda à equipa comercial — a
          decisão fica registada com autor e data.
        </p>
      </Panel>
    </div>
  );
}

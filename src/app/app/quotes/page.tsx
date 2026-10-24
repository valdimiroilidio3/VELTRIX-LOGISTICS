import Link from "next/link";
import { ClipboardList, FileText } from "lucide-react";
import { requirePagePermission } from "@/lib/auth/page-guard";
import { listAdminQuotes, QUOTE_STATUS_LABELS, QUOTE_STATUSES } from "@/lib/domain/quotes";
import { listShipments } from "@/lib/domain/shipments";
import { Badge, EmptyState, Notice, Panel, PanelHeader } from "@/components/ui";
import { QuoteAdminActions } from "@/components/app/quote-admin-actions";
import { formatCurrency, formatDate } from "@/lib/utils";

export const metadata = { title: "Orçamentos" };

const STATUS_TONE: Record<string, "neutral" | "info" | "success" | "warning" | "danger"> = {
  draft: "neutral",
  sent: "info",
  accepted: "success",
  rejected: "danger",
  expired: "warning",
};

export default async function QuotesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await requirePagePermission("quotes:read");
  const { status } = await searchParams;
  const canWrite = user.permissions.includes("quotes:write");

  const [quotes, pendingRequests] = await Promise.all([
    listAdminQuotes(user.organizationId, { status: status ?? null }),
    canWrite
      ? listShipments({ page: 1, pageSize: 20, status: "pending_quote", orderBy: "created_at DESC" }, { organizationId: user.organizationId })
      : Promise.resolve({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }),
  ]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Orçamentos</h1>
          <p className="mt-1 text-xs text-muted">
            {quotes.length} orçamentos · {pendingRequests.total} pedidos a aguardar proposta
          </p>
        </div>
        <Link
          href="/app/shipments?status=pending_quote"
          className="rounded-lg border border-line px-3 py-1.5 text-[11px] text-muted hover:text-ink"
        >
          Ver pedidos sem orçamento
        </Link>
      </div>

      <Notice tone="info" title="Como funcionam os orçamentos">
        O valor é sempre introduzido pela equipa comercial — a plataforma não aplica um tarifário automático a pedidos
        reais. O orçamento é criado em <strong>rascunho</strong> e só é comunicado ao cliente quando passa a{" "}
        <strong>enviado</strong>; nesse momento o pedido associado transita de «Pedido de orçamento» para
        «Orçamentada», tudo na mesma transação. Nesta fase não são emitidos documentos fiscais.
      </Notice>

      <nav className="flex flex-wrap gap-1.5" aria-label="Filtrar por estado">
        <Link
          href="/app/quotes"
          className={`rounded-lg border px-2.5 py-1 text-[11px] ${!status ? "border-accent/40 bg-accent/10 text-accent" : "border-line text-muted hover:text-ink"}`}
        >
          Todos
        </Link>
        {QUOTE_STATUSES.map((option) => (
          <Link
            key={option}
            href={`/app/quotes?status=${option}`}
            className={`rounded-lg border px-2.5 py-1 text-[11px] ${status === option ? "border-accent/40 bg-accent/10 text-accent" : "border-line text-muted hover:text-ink"}`}
          >
            {QUOTE_STATUS_LABELS[option]}
          </Link>
        ))}
      </nav>

      <Panel>
        <PanelHeader
          title="Orçamentos emitidos"
          description="Histórico com autor, valores e decisão"
          actions={<Badge tone="neutral">{quotes.length}</Badge>}
        />
        {quotes.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="h-4 w-4" />}
            title="Sem orçamentos"
            description={
              canWrite
                ? "Abra um pedido em Encomendas e crie o primeiro orçamento no painel da encomenda."
                : "Ainda não existem orçamentos nesta organização."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th scope="col">Referência</th>
                  <th scope="col">Cliente / encomenda</th>
                  <th scope="col">Rota</th>
                  <th scope="col" className="text-right">Valor</th>
                  <th scope="col">Validade</th>
                  <th scope="col">Estado</th>
                  <th scope="col" className="text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((quote) => (
                  <tr key={quote.id}>
                    <td className="font-mono text-[11px]">{quote.reference}</td>
                    <td>
                      <p className="text-xs">{quote.company_name ?? quote.contact_name}</p>
                      {quote.shipment_id ? (
                        <Link href={`/app/shipments/${quote.shipment_id}`} className="font-mono text-[10px] text-accent hover:underline">
                          {quote.tracking_code ?? "abrir encomenda"}
                        </Link>
                      ) : (
                        <p className="text-[10px] text-muted">{quote.contact_email}</p>
                      )}
                    </td>
                    <td className="text-[11px] text-muted">
                      {quote.origin} → {quote.destination}
                      {quote.description ? <p className="text-[10px] text-muted/70">{quote.description}</p> : null}
                    </td>
                    <td className="text-right text-[11px] tabular-nums">
                      {formatCurrency(quote.total_cents, quote.currency)}
                      <p className="text-[10px] text-muted/70">base {formatCurrency(quote.subtotal_cents, quote.currency)}</p>
                    </td>
                    <td className="text-[11px] text-muted">{quote.valid_until ? formatDate(quote.valid_until) : "—"}</td>
                    <td>
                      <Badge tone={STATUS_TONE[quote.status] ?? "neutral"}>{QUOTE_STATUS_LABELS[quote.status]}</Badge>
                    </td>
                    <td className="text-right">
                      <QuoteAdminActions quoteId={quote.id} status={quote.status} canWrite={canWrite} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {pendingRequests.total > 0 ? (
        <Panel>
          <PanelHeader
            title="Pedidos à espera de proposta"
            description="Criados pelo cliente ou pela equipa; ainda sem valor"
            actions={<FileText className="h-3.5 w-3.5 text-muted" />}
          />
          <ul className="divide-y divide-line/40">
            {pendingRequests.items.map((shipment) => (
              <li key={shipment.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                <div>
                  <Link href={`/app/shipments/${shipment.id}`} className="font-mono text-[11px] text-ink hover:text-accent">
                    {shipment.trackingCode}
                  </Link>
                  <p className="text-[10px] text-muted">
                    {shipment.customer.name} · {shipment.origin.city} → {shipment.destination.city} · {shipment.weightKg} kg
                  </p>
                </div>
                <Link
                  href={`/app/shipments/${shipment.id}`}
                  className="rounded-lg border border-accent/40 px-2.5 py-1 text-[10px] text-accent hover:bg-accent/10"
                >
                  Criar orçamento
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}

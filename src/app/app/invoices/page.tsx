import { requirePagePermission } from "@/lib/auth/page-guard";
import { listInvoices } from "@/lib/domain/commercial";
import { listCustomers } from "@/lib/domain/commercial";
import { db } from "@/lib/db";
import { Badge, EmptyState, Notice, Panel, PanelHeader, StatCard } from "@/components/ui";
import { InvoiceForm, PaymentButton } from "@/components/app/invoice-forms";
import { INVOICE_STATUS_LABELS, formatCurrency, formatDate } from "@/lib/utils";

export const metadata = { title: "Faturação" };

export default async function InvoicesPage() {
  const user = await requirePagePermission("invoices:read");
  const [invoices, customers] = await Promise.all([listInvoices(user.organizationId), listCustomers(user.organizationId, null)]);
  const payments = await db().all<{ invoice_id: string; paid: number }>(
    `SELECT p.invoice_id, SUM(p.amount_cents) AS paid FROM payments p
     JOIN invoices i ON i.id = p.invoice_id
     WHERE i.organization_id = ? AND p.status = 'succeeded' GROUP BY p.invoice_id`,
    [user.organizationId],
  );
  const paidByInvoice = new Map(payments.map((row) => [row.invoice_id, Number(row.paid)]));

  const issued = invoices.filter((invoice) => invoice.status !== "void");
  const totalIssued = issued.reduce((sum, invoice) => sum + invoice.total_cents, 0);
  const outstanding = issued
    .filter((invoice) => invoice.status !== "paid")
    .reduce((sum, invoice) => sum + Math.max(0, invoice.total_cents - (paidByInvoice.get(invoice.id) ?? 0)), 0);
  const received = [...paidByInvoice.values()].reduce((sum, value) => sum + value, 0);
  const canWrite = user.permissions.includes("invoices:write");
  const canPay = user.permissions.includes("payments:write");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Faturação</h1>
          <p className="mt-1 text-xs text-muted">Registo interno · não substitui faturação certificada</p>
        </div>
        {canWrite ? <InvoiceForm customers={customers.map((customer) => ({ id: customer.id, name: customer.company_name ?? customer.contact_name }))} /> : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Faturação emitida" value={formatCurrency(totalIssued)} hint="Total dos documentos ativos" />
        <StatCard label="Recebido" value={formatCurrency(received)} hint="Pagamentos registados com sucesso" tone="success" />
        <StatCard label="Em aberto" value={formatCurrency(outstanding)} hint="Emitidas ou vencidas por liquidar" tone={outstanding > 0 ? "warning" : "neutral"} />
      </div>

      <Notice tone="info" title="Fronteira fiscal">
        A geração de uma fatura nesta plataforma cria um registo comercial e um número sequencial interno. Não é
        emitido PDF certificado nem comunicação à AT. A integração com software de faturação certificado é um requisito
        antes de uso fiscal em Portugal.
      </Notice>

      <Panel>
        <PanelHeader title="Documentos" description="Estado vencido calculado a partir da data de vencimento" actions={<Badge tone="neutral">{invoices.length}</Badge>} />
        {invoices.length === 0 ? (
          <EmptyState title="Sem faturas" description="As faturas emitidas aparecem aqui." />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th scope="col">Número</th>
                  <th scope="col">Cliente</th>
                  <th scope="col">Emitida</th>
                  <th scope="col">Vencimento</th>
                  <th scope="col" className="text-right">Total</th>
                  <th scope="col" className="text-right">Em aberto</th>
                  <th scope="col">Estado</th>
                  {canPay ? <th scope="col" className="text-right">Ação</th> : null}
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => {
                  const outstandingCents = Math.max(0, invoice.total_cents - (paidByInvoice.get(invoice.id) ?? 0));
                  return (
                    <tr key={invoice.id}>
                      <td className="font-mono text-[11px]">{invoice.invoice_number}</td>
                      <td className="max-w-[180px] truncate text-xs">{invoice.company_name ?? invoice.contact_name}</td>
                      <td className="text-[11px] text-muted">{formatDate(invoice.issued_at)}</td>
                      <td className="text-[11px] text-muted">{formatDate(invoice.due_at)}</td>
                      <td className="text-right text-xs tabular-nums">{formatCurrency(invoice.total_cents, invoice.currency)}</td>
                      <td className="text-right text-xs tabular-nums text-warning">{formatCurrency(outstandingCents, invoice.currency)}</td>
                      <td>
                        <Badge tone={invoice.status === "paid" ? "success" : invoice.status === "overdue" ? "danger" : invoice.status === "void" ? "neutral" : "info"}>
                          {INVOICE_STATUS_LABELS[invoice.status] ?? invoice.status}
                        </Badge>
                      </td>
                      {canPay ? (
                        <td className="text-right">
                          {invoice.status !== "paid" && invoice.status !== "void" ? (
                            <PaymentButton invoiceId={invoice.id} outstandingCents={outstandingCents} />
                          ) : null}
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

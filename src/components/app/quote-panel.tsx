"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle2, Clock, FileText, Loader2, Pencil, Plus, Send, X } from "lucide-react";
import { toast } from "sonner";
import { createQuoteAction, quoteTransitionAction, updateQuoteAction } from "@/app/app/actions";
import { Badge, EmptyState, Field, Input, Notice, Panel, PanelHeader, Select, Textarea } from "@/components/ui";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { QUOTE_STATUS_LABELS, type QuoteStatus } from "@/lib/domain/quote-status";
import type { QuoteRecord } from "@/lib/domain/quotes";

const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "BRL", "MZN"];

const TONE: Record<QuoteStatus, "neutral" | "info" | "success" | "warning" | "danger"> = {
  draft: "neutral",
  sent: "info",
  accepted: "success",
  rejected: "danger",
  expired: "warning",
};

/**
 * Administrative quote panel.
 * Amounts are typed in major units and converted to integer cents on the
 * server; the API/service layer rejects non-integer or negative values.
 */
export function QuotePanel({
  shipmentId,
  quotes,
  canWrite,
  defaultCurrency,
}: {
  shipmentId: string;
  quotes: QuoteRecord[];
  canWrite: boolean;
  defaultCurrency: string;
}) {
  const [mode, setMode] = useState<"idle" | "create">(quotes.length === 0 ? "idle" : "idle");
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <Panel>
      <PanelHeader
        title="Orçamentos"
        description="Valor definido manualmente pela equipa comercial — nenhum tarifário é inventado"
        actions={
          canWrite ? (
            <button
              type="button"
              onClick={() => setMode(mode === "create" ? "idle" : "create")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1.5 text-[11px] font-medium text-accent-foreground"
            >
              {mode === "create" ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              {mode === "create" ? "Fechar" : "Novo orçamento"}
            </button>
          ) : (
            <Badge tone="neutral">{quotes.length}</Badge>
          )
        }
      />

      {mode === "create" ? (
        <QuoteForm
          shipmentId={shipmentId}
          defaultCurrency={defaultCurrency}
          onDone={() => setMode("idle")}
        />
      ) : null}

      {quotes.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-4 w-4" />}
          title="Sem orçamento"
          description={
            canWrite
              ? "Crie o primeiro orçamento para este pedido. O cliente só vê o valor depois de o enviar."
              : "A equipa comercial ainda não emitiu um orçamento para este pedido."
          }
        />
      ) : (
        <ul className="divide-y divide-line/40">
          {quotes.map((quote) => (
            <li key={quote.id}>
              <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] text-ink">{quote.reference}</span>
                    <Badge tone={TONE[quote.status]}>{QUOTE_STATUS_LABELS[quote.status]}</Badge>
                    {quote.status === "sent" && quote.valid_until ? (
                      <span className="inline-flex items-center gap-1 text-[10px] text-muted">
                        <Clock className="h-3 w-3" /> válido até {formatDate(quote.valid_until)}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm tabular-nums text-ink">
                    {formatCurrency(quote.total_cents, quote.currency)}
                    <span className="ml-2 text-[10px] font-normal text-muted">
                      base {formatCurrency(quote.subtotal_cents, quote.currency)} · imposto{" "}
                      {formatCurrency(quote.tax_cents, quote.currency)}
                    </span>
                  </p>
                  {quote.description ? <p className="mt-1 max-w-lg text-[11px] text-muted">{quote.description}</p> : null}
                  <p className="mt-1 text-[10px] text-muted/70">
                    Criado {formatDateTime(quote.created_at)}
                    {quote.created_by_name ? ` por ${quote.created_by_name}` : ""}
                    {quote.decided_at ? ` · decidido ${formatDateTime(quote.decided_at)}` : ""}
                  </p>
                </div>

                {canWrite && (quote.status === "draft" || quote.status === "sent") ? (
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setEditing(editing === quote.id ? null : quote.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[10px] text-muted hover:text-ink"
                    >
                      <Pencil className="h-3 w-3" /> Editar
                    </button>
                    {quote.status === "draft" ? (
                      <StatusButton quoteId={quote.id} status="sent" label="Enviar" icon={Send} />
                    ) : null}
                    {quote.status === "sent" ? (
                      <>
                        <StatusButton quoteId={quote.id} status="accepted" label="Aceite" icon={CheckCircle2} />
                        <StatusButton quoteId={quote.id} status="rejected" label="Recusado" icon={X} danger />
                        <StatusButton quoteId={quote.id} status="expired" label="Expirar" icon={Clock} />
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {editing === quote.id ? (
                <QuoteForm
                  shipmentId={shipmentId}
                  defaultCurrency={quote.currency}
                  quote={quote}
                  onDone={() => setEditing(null)}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <p className="border-t border-line/40 px-5 py-3 text-[10px] leading-relaxed text-muted/70">
        O envio de um orçamento move o pedido para «Orçamentada» e enfileira a notificação ao cliente. A confirmação
        comercial da encomenda é uma ação separada e auditada.
      </p>
    </Panel>
  );
}

function StatusButton({
  quoteId,
  status,
  label,
  icon: Icon,
  danger,
}: {
  quoteId: string;
  status: QuoteStatus;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  danger?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await quoteTransitionAction({ quoteId, status });
          if (!result.ok) toast.error(result.message);
          else toast.success(result.message);
          router.refresh();
        })
      }
      className={
        danger
          ? "inline-flex items-center gap-1 rounded-lg border border-danger/40 px-2 py-1 text-[10px] text-danger hover:bg-danger/10"
          : "inline-flex items-center gap-1 rounded-lg border border-accent/40 px-2 py-1 text-[10px] text-accent hover:bg-accent/10"
      }
    >
      {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Icon className="h-3 w-3" />}
      {label}
    </button>
  );
}

function QuoteForm({
  shipmentId,
  defaultCurrency,
  quote,
  onDone,
}: {
  shipmentId: string;
  defaultCurrency: string;
  quote?: QuoteRecord;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = quote
        ? await updateQuoteAction(formData)
        : await createQuoteAction(formData);
      if (!result.ok) {
        setError(result.message);
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      onDone();
      router.refresh();
    });
  }

  return (
    <form action={onSubmit} className="space-y-3 border-y border-line/40 bg-bg/30 px-5 py-4">
      <input type="hidden" name="shipmentId" value={shipmentId} />
      {quote ? <input type="hidden" name="quoteId" value={quote.id} /> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={quote ? "Novo valor (sem imposto)" : "Valor (sem imposto)"} htmlFor="quoteAmount" hint="Em unidades da moeda, ex.: 1250.00">
          <Input
            id="quoteAmount"
            name="amount"
            type="number"
            min="0"
            step="0.01"
            required
            defaultValue={quote ? (quote.subtotal_cents / 100).toFixed(2) : ""}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Moeda" htmlFor="quoteCurrency">
            <Select id="quoteCurrency" name="currency" defaultValue={quote?.currency ?? defaultCurrency}>
              {CURRENCIES.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Imposto %" htmlFor="quoteTax" hint="0 se não aplicável">
            <Input
              id="quoteTax"
              name="taxRatePct"
              type="number"
              min="0"
              max="100"
              step="0.01"
              defaultValue={
                quote && quote.subtotal_cents > 0
                  ? ((quote.tax_cents / quote.subtotal_cents) * 100).toFixed(2)
                  : "0"
              }
            />
          </Field>
        </div>
        <Field label="Validade" htmlFor="quoteValidity">
          <Input
            id="quoteValidity"
            name="validUntil"
            type="date"
            defaultValue={(quote?.valid_until ?? new Date(Date.now() + 15 * 24 * 3600_000).toISOString()).slice(0, 10)}
          />
        </Field>
        <Field label="Descrição" htmlFor="quoteDescription" hint="Visível ao cliente">
          <Input id="quoteDescription" name="description" defaultValue={quote?.description ?? ""} placeholder="Transporte dedicado, 1 palete" />
        </Field>
      </div>

      <Field label="Notas internas" htmlFor="quoteNotes">
        <Textarea id="quoteNotes" name="notes" rows={2} defaultValue={quote?.notes ?? ""} placeholder="Contexto para a equipa (não aparece no email ao cliente)" />
      </Field>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="rounded-lg border border-line px-3 py-1.5 text-[11px] text-muted hover:text-ink">
          Cancelar
        </button>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[11px] font-medium text-accent-foreground disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {quote ? "Guardar alterações" : "Criar orçamento"}
        </button>
      </div>
    </form>
  );
}

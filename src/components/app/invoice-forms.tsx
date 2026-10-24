"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Receipt } from "lucide-react";
import { toast } from "sonner";
import { invoiceAction, paymentAction } from "@/app/app/actions";
import { Button, Field, Input, Notice, Select } from "@/components/ui";

export function InvoiceForm({ customers }: { customers: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await invoiceAction(formData);
      if (!result.ok) {
        setError(result.message);
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <Receipt className="h-3.5 w-3.5" /> Emitir fatura
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-lift">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Emitir fatura</h2>
          <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted hover:text-ink">
            Fechar
          </button>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">
          Documento interno de registo. Não é emitido PDF fiscal certificado — a integração com software certificado
          deve ser validada antes de uso fiscal.
        </p>

        <form action={onSubmit} className="mt-4 space-y-3" noValidate>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <Field label="Cliente" htmlFor="invoice-customer">
            <Select id="invoice-customer" name="customerId" required>
              <option value="">Selecionar…</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Subtotal (EUR)" htmlFor="subtotal">
              <Input id="subtotal" name="subtotal" type="number" min="0" step="0.01" required />
            </Field>
            <Field label="IVA (%)" htmlFor="vatRatePct">
              <Input id="vatRatePct" name="vatRatePct" type="number" min="0" max="100" step="0.5" defaultValue="23" />
            </Field>
            <Field label="Vencimento (dias)" htmlFor="dueInDays">
              <Input id="dueInDays" name="dueInDays" type="number" min="0" max="180" defaultValue="30" />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Emitir
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function PaymentButton({ invoiceId, outstandingCents }: { invoiceId: string; outstandingCents: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending || outstandingCents <= 0}
      onClick={() =>
        startTransition(async () => {
          const result = await paymentAction({ invoiceId, amountCents: outstandingCents, reference: `manual-${Date.now()}` });
          if (!result.ok) toast.error(result.message);
          else toast.success(result.message);
          router.refresh();
        })
      }
      className="rounded-lg border border-accent/40 px-2 py-1 text-[10px] text-accent hover:bg-accent/10 disabled:opacity-40"
    >
      {pending ? <Loader2 className="inline h-3 w-3 animate-spin" /> : "Liquidar"}
    </button>
  );
}

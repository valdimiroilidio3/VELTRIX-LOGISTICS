"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { updateCustomerAction } from "@/app/app/actions";
import { Button, Field, Input, Notice, Textarea } from "@/components/ui";

export interface EditableCustomer {
  id: string;
  customer_type: string;
  company_name: string | null;
  contact_name: string;
  email: string;
  phone: string | null;
  tax_number: string | null;
  billing_city: string | null;
  billing_country_code: string;
}

/** Edits commercially maintained contact data; operational history is untouched. */
export function CustomerEdit({ customer }: { customer: EditableCustomer }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await updateCustomerAction(formData);
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
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-md border border-line/70 px-1.5 py-0.5 text-[10px] text-muted hover:text-ink"
      >
        <Pencil className="h-3 w-3" /> Editar
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4">
      <div className="w-full max-w-xl rounded-2xl border border-line bg-surface p-5 shadow-lift">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Editar cliente</h2>
          <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted hover:text-ink">
            Fechar
          </button>
        </div>

        <form action={onSubmit} className="mt-4 space-y-3" noValidate>
          <input type="hidden" name="customerId" value={customer.id} />
          {error ? <Notice tone="danger">{error}</Notice> : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Designação" htmlFor="edit-company">
              <Input id="edit-company" name="companyName" defaultValue={customer.company_name ?? ""} disabled={customer.customer_type === "individual"} />
            </Field>
            <Field label="Contacto" htmlFor="edit-contact">
              <Input id="edit-contact" name="contactName" defaultValue={customer.contact_name} required />
            </Field>
            <Field label="Email" htmlFor="edit-email">
              <Input id="edit-email" name="email" type="email" defaultValue={customer.email} required />
            </Field>
            <Field label="Telefone" htmlFor="edit-phone" hint="6 a 15 dígitos">
              <Input id="edit-phone" name="phone" type="tel" defaultValue={customer.phone ?? ""} />
            </Field>
            <Field label="NIF / VAT" htmlFor="edit-tax">
              <Input id="edit-tax" name="taxNumber" defaultValue={customer.tax_number ?? ""} />
            </Field>
            <Field label="Cidade de faturação" htmlFor="edit-city">
              <Input id="edit-city" name="billingCity" defaultValue={customer.billing_city ?? ""} />
            </Field>
            <Field label="Morada de faturação" htmlFor="edit-address" className="sm:col-span-2">
              <Input id="edit-address" name="billingAddress" placeholder="Não altera moradas de envios já criados" />
            </Field>
            <Field label="Código postal" htmlFor="edit-postal">
              <Input id="edit-postal" name="billingPostalCode" />
            </Field>
            <Field label="País (ISO-2)" htmlFor="edit-country">
              <Input id="edit-country" name="billingCountryCode" maxLength={2} defaultValue={customer.billing_country_code} />
            </Field>
          </div>

          <Field label="Notas internas" htmlFor="edit-notes">
            <Textarea id="edit-notes" name="notes" rows={2} />
          </Field>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Guardar
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

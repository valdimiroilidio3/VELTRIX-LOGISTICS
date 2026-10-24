"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { createCustomerAction } from "@/app/app/actions";
import { Button, Field, Input, Notice, Select, Textarea } from "@/components/ui";

export function CustomerForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("business");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createCustomerAction(formData);
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
        <UserPlus className="h-3.5 w-3.5" /> Novo cliente
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="w-full max-w-xl rounded-2xl border border-line bg-surface p-5 shadow-lift">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Novo cliente</h2>
          <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted hover:text-ink">
            Fechar
          </button>
        </div>

        <form action={onSubmit} className="mt-4 space-y-3" noValidate>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tipo" htmlFor="customerType">
              <Select id="customerType" name="customerType" value={type} onChange={(event) => setType(event.target.value)}>
                <option value="business">Empresa</option>
                <option value="individual">Particular</option>
              </Select>
            </Field>
            {type === "business" ? (
              <Field label="Designação" htmlFor="companyName">
                <Input id="companyName" name="companyName" required placeholder="Empresa, Lda." />
              </Field>
            ) : (
              <input type="hidden" name="companyName" value="" />
            )}
            <Field label="Contacto" htmlFor="contactName">
              <Input id="contactName" name="contactName" required autoComplete="name" />
            </Field>
            <Field label="Email" htmlFor="email">
              <Input id="email" name="email" type="email" required autoComplete="email" />
            </Field>
            <Field label="Telefone" htmlFor="phone">
              <Input id="phone" name="phone" type="tel" autoComplete="tel" />
            </Field>
            <Field label="NIF (opcional)" htmlFor="taxNumber">
              <Input id="taxNumber" name="taxNumber" inputMode="numeric" />
            </Field>
            <Field label="Morada de faturação" htmlFor="billingAddress" className="sm:col-span-2">
              <Input id="billingAddress" name="billingAddress" />
            </Field>
            <Field label="Código postal" htmlFor="billingPostalCode">
              <Input id="billingPostalCode" name="billingPostalCode" />
            </Field>
            <Field label="Cidade" htmlFor="billingCity">
              <Input id="billingCity" name="billingCity" />
            </Field>
            <Field label="País (ISO-2)" htmlFor="billingCountryCode">
              <Input id="billingCountryCode" name="billingCountryCode" defaultValue="PT" maxLength={2} />
            </Field>
          </div>
          <Field label="Notas internas" htmlFor="notes">
            <Textarea id="notes" name="notes" className="min-h-16" maxLength={1000} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Criar cliente
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

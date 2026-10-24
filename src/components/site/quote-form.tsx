"use client";

import { useActionState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { requestQuoteAction, type QuoteFormState } from "@/app/(site)/request-quote/actions";
import { Button, Field, Input, Notice, Select, Textarea } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/utils";

const initialState: QuoteFormState = { status: "idle" };

const SERVICES = [
  { value: "standard", label: "Standard (2–4 dias)" },
  { value: "express", label: "Express (24–48 h)" },
  { value: "same_day", label: "Same day" },
  { value: "freight", label: "Freight / carga dedicada" },
  { value: "international", label: "Internacional" },
];

export function QuoteForm() {
  const [state, formAction, pending] = useActionState(requestQuoteAction, initialState);

  if (state.status === "success" && state.result) {
    return (
      <div className="panel p-6">
        <div className="flex items-center gap-2 text-success">
          <CheckCircle2 className="h-5 w-5" />
          <h2 className="text-sm font-semibold">Pedido registado</h2>
        </div>
        <p className="mt-2 text-xs text-muted">{state.message}</p>
        <dl className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-line/70 bg-bg/50 px-3.5 py-3">
            <dt className="text-[11px] uppercase tracking-wide text-muted">Referência</dt>
            <dd className="mt-1 font-mono text-sm text-ink">{state.result.reference}</dd>
          </div>
          <div className="rounded-xl border border-line/70 bg-bg/50 px-3.5 py-3">
            <dt className="text-[11px] uppercase tracking-wide text-muted">Estimativa</dt>
            <dd className="mt-1 text-sm font-semibold text-ink">
              {formatCurrency(state.result.totalCents, state.result.currency)} <span className="text-[10px] font-normal text-muted">c/ IVA</span>
            </dd>
          </div>
          <div className="rounded-xl border border-line/70 bg-bg/50 px-3.5 py-3">
            <dt className="text-[11px] uppercase tracking-wide text-muted">Validade</dt>
            <dd className="mt-1 text-sm text-ink">{formatDate(state.result.validUntil)}</dd>
          </div>
        </dl>
        <ul className="mt-4 space-y-1.5 rounded-xl border border-line/60 bg-surface/50 p-3.5 text-[11px] leading-relaxed text-muted">
          {state.result.assumptions.map((assumption) => (
            <li key={assumption}>• {assumption}</li>
          ))}
        </ul>
        <p className="mt-4 text-[11px] text-muted">
          Este valor é indicativo e não constitui proposta contratual. A confirmação comercial é feita pela equipa.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="panel p-6" noValidate>
      <h2 className="text-sm font-semibold text-ink">Dados do pedido</h2>
      <p className="mt-1 text-xs text-muted">Os campos marcados são necessários para calcular a estimativa.</p>

      {state.status === "error" ? (
        <Notice tone="danger" className="mt-4">
          {state.message}
        </Notice>
      ) : null}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Nome de contacto" htmlFor="contactName" error={state.fieldErrors?.contactName}>
          <Input id="contactName" name="contactName" required autoComplete="name" placeholder="Nome e apelido" />
        </Field>
        <Field label="Email" htmlFor="contactEmail" error={state.fieldErrors?.contactEmail}>
          <Input id="contactEmail" name="contactEmail" type="email" required autoComplete="email" placeholder="nome@empresa.pt" />
        </Field>
        <Field label="Telefone (opcional)" htmlFor="contactPhone" error={state.fieldErrors?.contactPhone}>
          <Input id="contactPhone" name="contactPhone" type="tel" autoComplete="tel" placeholder="+351 …" />
        </Field>
        <Field label="Tipo de serviço" htmlFor="serviceType" error={state.fieldErrors?.serviceType}>
          <Select id="serviceType" name="serviceType" defaultValue="standard" required>
            {SERVICES.map((service) => (
              <option key={service.value} value={service.value}>
                {service.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Origem" htmlFor="origin" error={state.fieldErrors?.origin} hint="Cidade e país">
          <Input id="origin" name="origin" required placeholder="Coimbra, PT" />
        </Field>
        <Field label="Destino" htmlFor="destination" error={state.fieldErrors?.destination} hint="Cidade e país">
          <Input id="destination" name="destination" required placeholder="Lisboa, PT" />
        </Field>
        <Field label="Peso total (kg)" htmlFor="weightKg" error={state.fieldErrors?.weightKg}>
          <Input id="weightKg" name="weightKg" type="number" min="0.1" step="0.1" required inputMode="decimal" placeholder="120" />
        </Field>
        <Field label="Volume (m³)" htmlFor="volumeM3" error={state.fieldErrors?.volumeM3} hint="Opcional, melhora a estimativa">
          <Input id="volumeM3" name="volumeM3" type="number" min="0" step="0.01" inputMode="decimal" placeholder="1.2" />
        </Field>
      </div>

      <Field label="Detalhes da mercadoria" htmlFor="notes" className="mt-4" error={state.fieldErrors?.notes}>
        <Textarea id="notes" name="notes" placeholder="Natureza da carga, requisitos de manuseamento, janelas horárias…" maxLength={1000} />
      </Field>

      {/* honeypot — hidden from users and assistive tech */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-md text-[11px] leading-relaxed text-muted">
          Ao submeter, os dados são usados apenas para responder ao pedido. Consulte a{" "}
          <a href="/privacy" className="text-accent underline underline-offset-2">
            política de privacidade
          </a>
          .
        </p>
        <Button type="submit" size="lg" disabled={pending} className="shrink-0">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Calcular estimativa
        </Button>
      </div>
    </form>
  );
}

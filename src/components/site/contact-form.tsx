"use client";

import { useActionState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { sendContactMessage, type ContactState } from "@/app/(site)/contact/actions";
import { Button, Field, Input, Notice, Select, Textarea } from "@/components/ui";

const initialState: ContactState = { status: "idle" };

/**
 * Contact form backed by a real write: every message is stored in
 * `contact_messages` and visible to staff. When the email integration is absent
 * the success message says so instead of implying a delivery that did not happen.
 */
export function ContactForm() {
  const [state, formAction, pending] = useActionState(sendContactMessage, initialState);

  return (
    <form action={formAction} className="panel p-6" noValidate>
      <h2 className="text-sm font-semibold">Enviar mensagem</h2>
      <p className="mt-1 text-xs text-muted">Campos essenciais apenas — não recolhemos dados que não sejam usados.</p>

      {state.status === "error" ? (
        <Notice tone="danger" className="mt-4">
          {state.message}
        </Notice>
      ) : null}

      {state.status === "success" ? (
        <Notice tone="success" title="Mensagem registada" className="mt-4">
          <span className="inline-flex items-start gap-1.5">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {state.message}
          </span>
        </Notice>
      ) : null}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Nome" htmlFor="name" error={state.fieldErrors?.name}>
          <Input id="name" name="name" required autoComplete="name" />
        </Field>
        <Field label="Email" htmlFor="email" error={state.fieldErrors?.email}>
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </Field>
        <Field label="Assunto" htmlFor="topic" className="sm:col-span-2">
          <Select id="topic" name="topic" defaultValue="geral">
            <option value="geral">Questão geral</option>
            <option value="transporte">Transporte e distribuição</option>
            <option value="armazem">Armazenagem</option>
            <option value="rastreio">Rastreio de encomenda</option>
            <option value="faturacao">Faturação</option>
            <option value="privacidade">Privacidade e dados pessoais</option>
          </Select>
        </Field>
      </div>
      <Field label="Mensagem" htmlFor="message" className="mt-4" error={state.fieldErrors?.message}>
        <Textarea id="message" name="message" required maxLength={1500} placeholder="Descreva o contexto e o que precisa." />
      </Field>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[11px] leading-relaxed text-muted">
          Sem cookies de marketing. Ver{" "}
          <a href="/privacy" className="text-accent underline underline-offset-2">
            privacidade
          </a>
          .
        </p>
        <Button type="submit" disabled={pending} className="shrink-0">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Enviar mensagem
        </Button>
      </div>
    </form>
  );
}

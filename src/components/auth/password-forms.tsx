"use client";

import Link from "next/link";
import { useActionState } from "react";
import { KeyRound, Loader2, Mail } from "lucide-react";
import { requestResetAction, resetPasswordAction, type RequestState, type ResetState } from "@/app/(auth)/recuperar-password/actions";
import { changePasswordAction, type ChangePasswordState } from "@/app/(auth)/definir-palavra-passe/actions";
import { Button, Field, Input, Notice } from "@/components/ui";

const initialRequest: RequestState = { status: "idle" };
const initialReset: ResetState = { status: "idle" };

export function RequestResetForm() {
  const [state, action, pending] = useActionState(requestResetAction, initialRequest);

  return (
    <form action={action} className="space-y-4" noValidate>
      {state.status === "done" ? (
        <Notice tone="info" title="Pedido recebido">
          {state.message}
        </Notice>
      ) : null}
      {state.status === "error" ? <Notice tone="danger">{state.message}</Notice> : null}

      <Field label="Email da conta" htmlFor="reset-email">
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input id="reset-email" name="email" type="email" required autoComplete="username" className="h-11 pl-10" placeholder="nome@empresa.pt" />
        </div>
      </Field>

      <Button type="submit" size="lg" className="w-full justify-center" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Enviar ligação de recuperação
      </Button>

      <p className="text-center text-[11px] text-muted">
        <Link href="/login" className="hover:text-ink">
          Voltar ao início de sessão
        </Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, initialReset);

  if (state.status === "done") {
    return (
      <div className="space-y-4">
        <Notice tone="success" title="Palavra-passe alterada">
          {state.message}
        </Notice>
        <Link
          href="/login"
          className="inline-flex w-full items-center justify-center rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground"
        >
          Iniciar sessão
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="token" value={token} />
      {state.status === "error" ? <Notice tone="danger">{state.message}</Notice> : null}

      <Field label="Nova palavra-passe" htmlFor="new-password" hint="Mínimo 10 caracteres, com letras e números">
        <div className="relative">
          <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input id="new-password" name="password" type="password" required minLength={10} autoComplete="new-password" className="h-11 pl-10" />
        </div>
      </Field>

      <Field label="Confirmar palavra-passe" htmlFor="confirm-password">
        <Input id="confirm-password" name="confirmPassword" type="password" required minLength={10} autoComplete="new-password" className="h-11" />
      </Field>

      <Button type="submit" size="lg" className="w-full justify-center" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Guardar nova palavra-passe
      </Button>

      <p className="text-[11px] leading-relaxed text-muted/80">
        Ao guardar, todas as sessões abertas desta conta são encerradas. A ligação deixa de funcionar depois de
        utilizada.
      </p>
    </form>
  );
}

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changePasswordAction, { status: "idle" } as ChangePasswordState);

  return (
    <form action={formAction} className="space-y-3 rounded-2xl border border-line bg-surface p-5">
      {state.status === "error" ? <Notice tone="danger">{state.message}</Notice> : null}
      {state.status === "done" ? (
        <Notice tone="success">
          {state.message}{" "}
          <a href="/app" className="underline">
            Continuar
          </a>
        </Notice>
      ) : null}

      <Field label="Palavra-passe atual" htmlFor="currentPassword">
        <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
      </Field>
      <Field label="Nova palavra-passe" htmlFor="newPassword" hint="Mínimo 10 caracteres, com letras e números">
        <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" minLength={10} required />
      </Field>
      <Field label="Confirmar nova palavra-passe" htmlFor="confirmPassword">
        <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" minLength={10} required />
      </Field>

      <Button type="submit" disabled={pending} className="w-full justify-center">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
        Guardar palavra-passe
      </Button>
    </form>
  );
}

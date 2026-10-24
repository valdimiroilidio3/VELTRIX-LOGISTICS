"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Loader2, Lock, Mail } from "lucide-react";
import { loginAction, type LoginState } from "@/lib/auth/actions";
import { Button, Field, Input, Notice } from "@/components/ui";

const initialState: LoginState = {};

export function LoginForm({
  demoAccounts,
  next,
}: {
  demoAccounts: { email: string; role: string; password: string }[];
  next?: string;
}) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const [email, setEmail] = useState(state.email ?? "");
  const [password, setPassword] = useState("");

  return (
    <div>
      <form action={formAction} className="space-y-4" noValidate>
        {next ? <input type="hidden" name="next" value={next} /> : null}
        {state.error ? (
          <Notice tone="danger">
            {state.error}
          </Notice>
        ) : null}

        <Field label="Email" htmlFor="email">
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="username"
              className="h-11 pl-10"
              placeholder="nome@empresa.pt"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
        </Field>

        <Field label="Palavra-passe" htmlFor="password">
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
            <Input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="h-11 pl-10"
              placeholder="••••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
        </Field>

        <Button type="submit" size="lg" className="w-full justify-center" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Entrar na plataforma
        </Button>
      </form>

      <p className="mt-4 text-center text-[11px] text-muted">
        <Link href="/recuperar-password" className="hover:text-ink">
          Esqueceu-se da palavra-passe?
        </Link>
      </p>

      {demoAccounts.length > 0 ? (
        <div className="mt-6 rounded-xl border border-warning/25 bg-warning/5 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-warning">Contas de demonstração</p>
          <p className="mt-1 text-[11px] leading-relaxed text-warning/80">
            Dados fictícios. Cada conta tem permissões diferentes — útil para verificar o controlo de acessos.
          </p>
          <div className="mt-3 grid gap-1.5">
            {demoAccounts.map((account) => (
              <button
                key={account.email}
                type="button"
                onClick={() => {
                  setEmail(account.email);
                  setPassword(account.password);
                }}
                className="flex items-center justify-between gap-3 rounded-lg border border-line/60 bg-bg/40 px-2.5 py-1.5 text-left text-[11px] text-muted transition-colors hover:border-accent/30 hover:text-ink"
              >
                <span className="font-mono">{account.email}</span>
                <span className="shrink-0 text-muted/80">{account.role}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-warning/70">Palavra-passe: {demoAccounts[0]?.password}</p>
        </div>
      ) : null}
    </div>
  );
}

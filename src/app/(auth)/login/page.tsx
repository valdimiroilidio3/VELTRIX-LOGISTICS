import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LoginForm } from "@/components/auth/login-form";
import { DEMO_PASSWORD } from "@/lib/db/seed";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "Entrar",
  description: "Acesso à plataforma operacional VELTRIX.",
  robots: { index: false, follow: false },
};

const DEMO_ACCOUNTS = [
  { email: "admin@veltrix.example", role: "Administrador" },
  { email: "dispatch@veltrix.example", role: "Despachante" },
  { email: "warehouse@veltrix.example", role: "Armazém" },
  { email: "driver@veltrix.example", role: "Motorista" },
  { email: "finance@veltrix.example", role: "Financeiro" },
  { email: "cliente@nordvolt.example", role: "Cliente" },
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const demoAccounts = env.demoMode
    ? DEMO_ACCOUNTS.map((account) => ({ ...account, password: DEMO_PASSWORD }))
    : [];

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden border-r border-line/60 bg-[radial-gradient(circle_at_20%_20%,rgba(184,243,106,0.09),transparent_45%),radial-gradient(circle_at_80%_70%,rgba(96,165,250,0.08),transparent_45%)] lg:block">
        <div className="grain absolute inset-0" aria-hidden />
        <div className="relative flex h-full flex-col justify-between p-12">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent text-sm font-black text-accent-foreground">V</span>
            <span className="text-sm font-semibold tracking-[0.22em]">VELTRIX</span>
          </Link>

          <div className="max-w-md">
            <h1 className="font-display text-4xl leading-tight tracking-tight">
              Controlo operacional,
              <br />
              <span className="text-accent">sem atalhos.</span>
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-muted">
              Acesso por função e por recurso. Cada transição de estado é validada no servidor e registada para
              auditoria.
            </p>
            <dl className="mt-8 grid grid-cols-3 gap-3 text-[11px]">
              {[
                ["Permissões", "8 funções"],
                ["Transições", "Validadas"],
                ["Auditoria", "Registada"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-line/60 bg-bg/40 px-3 py-2">
                  <dt className="text-muted">{label}</dt>
                  <dd className="mt-1 text-xs font-medium text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <p className="text-[11px] text-muted/70">© {new Date().getFullYear()} VELTRIX — Logistics &amp; Technology</p>
        </div>
      </div>

      <div className="flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-sm">
          <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-ink">
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao site
          </Link>
          <h2 className="mt-6 text-2xl font-semibold tracking-tight">Entrar na plataforma</h2>
          <p className="mt-1 text-xs text-muted">O acesso é criado por um administrador da sua organização.</p>

          <div className="mt-6">
            <LoginForm demoAccounts={demoAccounts} next={next} />
          </div>

          {!env.email.configured ? (
            <p className="mt-6 text-[11px] leading-relaxed text-muted/70">
              Recuperação de palavra-passe por email requer a integração Resend configurada. Nesta instância, um
              administrador pode redefinir credenciais na área de utilizadores.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

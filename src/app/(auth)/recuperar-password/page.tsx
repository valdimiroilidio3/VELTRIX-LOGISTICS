import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { RequestResetForm } from "@/components/auth/password-forms";
import { emailIsConfigured } from "@/lib/integrations/email";

export const metadata: Metadata = {
  title: "Recuperar palavra-passe",
  robots: { index: false, follow: false },
};

export default function RequestResetPage() {
  const configured = emailIsConfigured();

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-12">
      <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao site
      </Link>

      <h1 className="mt-6 text-2xl font-semibold tracking-tight">Recuperar acesso</h1>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        Indique o email da sua conta. Por segurança, a resposta é sempre a mesma, exista ou não uma conta associada.
      </p>

      <div className="mt-6">
        <RequestResetForm />
      </div>

      {!configured ? (
        <div className="mt-6 rounded-xl border border-line/60 bg-surface/40 p-4 text-[11px] leading-relaxed text-muted">
          <strong className="text-ink">Entrega de email não configurada.</strong> O pedido fica registado na
          plataforma, mas a ligação não é enviada. Um administrador pode repor o acesso em{" "}
          <span className="text-ink">Segurança → Utilizadores</span>, gerando uma palavra-passe temporária de uso
          único que deve ser alterada no primeiro acesso.
        </div>
      ) : null}
    </div>
  );
}

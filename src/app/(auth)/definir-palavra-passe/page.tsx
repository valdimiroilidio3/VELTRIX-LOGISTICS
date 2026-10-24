import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { ensureDatabase } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { ChangePasswordForm } from "@/components/auth/password-forms";

export const metadata: Metadata = {
  title: "Definir palavra-passe",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ChangePasswordPage() {
  await ensureDatabase();
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-12">
      <Link href="/app" className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> Voltar à plataforma
      </Link>

      <h1 className="mt-6 text-2xl font-semibold tracking-tight">Definir nova palavra-passe</h1>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        Sessão de <span className="text-ink">{user.email}</span>. A palavra-passe tem de ter pelo menos 10 caracteres,
        com letras e números. As restantes sessões desta conta serão terminadas.
      </p>

      {user.mustChangePassword ? (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-[11px] leading-relaxed text-warning">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Esta conta foi criada com uma palavra-passe temporária. Defina uma palavra-passe própria para continuar a
            usar a plataforma.
          </span>
        </div>
      ) : null}

      <div className="mt-6">
        <ChangePasswordForm />
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ResetPasswordForm } from "@/components/auth/password-forms";

export const metadata: Metadata = {
  title: "Definir nova palavra-passe",
  robots: { index: false, follow: false },
};

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-12">
      <Link href="/login" className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> Iniciar sessão
      </Link>

      <h1 className="mt-6 text-2xl font-semibold tracking-tight">Definir nova palavra-passe</h1>
      <p className="mt-1 text-xs text-muted">A ligação é de uso único e expira 60 minutos após o pedido.</p>

      <div className="mt-6">
        <ResetPasswordForm token={token} />
      </div>
    </div>
  );
}

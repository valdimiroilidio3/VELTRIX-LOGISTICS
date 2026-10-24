import Link from "next/link";
import { ShieldOff } from "lucide-react";

export const metadata = { title: "Sem permissão" };

export default function ForbiddenPage() {
  return (
    <div className="mx-auto grid min-h-[60dvh] max-w-md place-items-center text-center">
      <div>
        <span className="mx-auto grid h-10 w-10 place-items-center rounded-xl border border-line/70 bg-surface/60">
          <ShieldOff className="h-4 w-4 text-warning" />
        </span>
        <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.18em] text-muted">403 · acesso restrito</p>
        <h1 className="mt-2 text-lg font-semibold tracking-tight">A sua função não tem acesso a esta área</h1>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          As permissões são verificadas no servidor para cada pedido. Se precisa deste acesso, solicite a alteração de
          função a um administrador — a alteração fica registada na auditoria.
        </p>
        <Link
          href="/app"
          className="mt-5 inline-flex items-center rounded-lg bg-accent px-3.5 py-2 text-xs font-medium text-accent-foreground"
        >
          Voltar ao painel
        </Link>
      </div>
    </div>
  );
}

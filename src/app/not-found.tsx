import Link from "next/link";
import { SiteHeader } from "@/components/site/site-header";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="container-page flex flex-1 flex-col items-center justify-center py-24 text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">Erro 404</p>
        <h1 className="mt-3 font-display text-4xl tracking-tight">Página não encontrada</h1>
        <p className="mt-3 max-w-md text-sm text-muted">
          O endereço pode estar incorreto ou o recurso já não existe. Se procurava uma encomenda, use o código de
          rastreio.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-2">
          <Link href="/" className="rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground">
            Voltar ao início
          </Link>
          <Link href="/tracking" className="rounded-xl border border-line px-4 py-2.5 text-sm text-ink hover:border-accent/40">
            Rastrear encomenda
          </Link>
        </div>
      </main>
    </div>
  );
}

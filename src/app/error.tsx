"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Redacted client-side report; server logs carry the full stack.
    console.error("Application error", { digest: error.digest, name: error.name });
  }, [error]);

  return (
    <div className="container-page flex min-h-[70dvh] flex-col items-center justify-center py-20 text-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">Erro inesperado</p>
      <h1 className="mt-3 font-display text-3xl tracking-tight">Não foi possível concluir a operação</h1>
      <p className="mt-3 max-w-md text-sm text-muted">
        O erro foi registado. Se persistir, contacte o administrador indicando a referência{" "}
        <span className="font-mono text-ink">{error.digest ?? "n/d"}</span>.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground"
      >
        Tentar novamente
      </button>
    </div>
  );
}

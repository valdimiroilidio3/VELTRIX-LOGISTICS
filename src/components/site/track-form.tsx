"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Button, Input } from "@/components/ui";

export function TrackForm({ compact = false, defaultValue = "" }: { compact?: boolean; defaultValue?: string }) {
  const router = useRouter();
  const [code, setCode] = useState(defaultValue);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = code.trim().toUpperCase();
    if (value.length < 6) {
      setError("Introduza o código completo (mínimo 6 caracteres).");
      return;
    }
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/v1/tracking/${encodeURIComponent(value)}`, { cache: "no-store" });
      if (response.status === 404) {
        setError("Não encontrámos nenhuma encomenda com esse código. Verifique e tente novamente.");
        return;
      }
      if (response.status === 429) {
        setError("Demasiados pedidos. Aguarde um minuto.");
        return;
      }
      if (!response.ok) {
        setError("Serviço temporariamente indisponível. Tente novamente.");
        return;
      }
      router.push(`/tracking/${encodeURIComponent(value)}`);
    } catch {
      setError("Não foi possível contactar o serviço de rastreio.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="w-full" noValidate>
      <div className={compact ? "flex flex-col gap-2 sm:flex-row" : "flex flex-col gap-2 sm:flex-row"}>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <label htmlFor="tracking-code" className="sr-only">
        Código de rastreio
          </label>
          <Input
            id="tracking-code"
            name="code"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="Ex.: VX20260012BA"
            autoComplete="off"
            spellCheck={false}
            className="h-12 pl-10 font-mono tracking-[0.08em]"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "tracking-error" : undefined}
            maxLength={32}
          />
        </div>
        <Button type="submit" size="lg" disabled={pending} className="h-12 shrink-0">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Rastrear encomenda
        </Button>
      </div>
      {error ? (
        <p id="tracking-error" role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      ) : (
        <p className="mt-2 text-[11px] text-muted/80">O código consta no email ou SMS de confirmação da encomenda.</p>
      )}
    </form>
  );
}

"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * Copies the tracking code to the clipboard.
 * Falls back to a visible selection hint when the Clipboard API is blocked
 * (older browsers or non-secure contexts) instead of silently failing.
 */
export function CopyTracking({ code, className }: { code: string; className?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setState("copied");
      setTimeout(() => setState("idle"), 2000);
    } catch {
      setState("manual");
      setTimeout(() => setState("idle"), 6000);
    }
  }

  return (
    <span className={className}>
      <button
        type="button"
        onClick={copy}
        className="inline-flex items-center gap-1 rounded-md border border-line/70 px-1.5 py-0.5 text-[10px] text-muted transition-colors hover:text-ink"
        aria-label={`Copiar código de rastreio ${code}`}
      >
        {state === "copied" ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
        {state === "copied" ? "copiado" : "copiar"}
      </button>
      {state === "manual" ? (
        <span className="ml-1 select-all font-mono text-[10px] text-ink">{code}</span>
      ) : null}
    </span>
  );
}

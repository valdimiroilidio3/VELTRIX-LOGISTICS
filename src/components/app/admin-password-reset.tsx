"use client";

import { useState, useTransition } from "react";
import { Check, Copy, KeyRound, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { adminPasswordResetAction } from "@/app/app/actions";
import { Button } from "@/components/ui";

/**
 * Administrative password reset. The temporary password is shown exactly once,
 * in a modal, and never toasted or logged. The action revokes every session of
 * the target user and forces a password change at next sign-in.
 */
export function AdminPasswordResetButton({ profileId, userName }: { profileId: string; userName: string }) {
  const [pending, startTransition] = useTransition();
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() => {
          if (
            !window.confirm(
              `Repor a palavra-passe de ${userName}?\n\nTodas as sessões ativas serão revogadas e o utilizador terá de definir uma nova palavra-passe no próximo acesso.`,
            )
          ) {
            return;
          }
          startTransition(async () => {
            const result = await adminPasswordResetAction({ profileId });
            const data = result.data as { temporaryPassword?: unknown } | undefined;
            if (result.ok && typeof data?.temporaryPassword === "string") {
              setTemporaryPassword(data.temporaryPassword);
              setCopied(false);
            } else {
              toast.error(result.ok ? "Não foi possível repor a palavra-passe" : result.message);
            }
          });
        }}
      >
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <KeyRound className="h-3 w-3" />}
        Repor password
      </Button>

      {temporaryPassword ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-bg/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-reset-title"
        >
          <div className="panel w-full max-w-md space-y-3 p-5">
            <h2 id="admin-reset-title" className="text-sm font-semibold text-ink">
              Palavra-passe temporária de {userName}
            </h2>
            <p className="text-xs leading-relaxed text-muted">
              É mostrada apenas uma vez. Partilhe-a por um canal seguro — o utilizador terá de definir uma nova
              palavra-passe assim que entrar.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 select-all rounded-lg border border-line/70 bg-surface-raised px-3 py-2 font-mono text-sm text-ink">
                {temporaryPassword}
              </code>
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(temporaryPassword);
                    setCopied(true);
                  } catch {
                    toast.error("Não foi possível copiar — selecione o texto manualmente.");
                  }
                }}
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copiada" : "Copiar"}
              </Button>
            </div>
            <p className="flex items-start gap-1.5 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-[11px] leading-relaxed text-warning">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Todas as sessões ativas deste utilizador foram revogadas, incluindo dispositivos móveis.
            </p>
            <div className="flex justify-end">
              <Button size="sm" variant="secondary" onClick={() => setTemporaryPassword(null)}>
                Fechar
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

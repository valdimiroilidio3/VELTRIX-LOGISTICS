"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Check, Clock, Loader2, Send, X } from "lucide-react";
import { toast } from "sonner";
import { quoteTransitionAction } from "@/app/app/actions";

const OPTIONS = [
  { status: "sent" as const, label: "Enviar", icon: Send },
  { status: "accepted" as const, label: "Aceite", icon: Check },
  { status: "rejected" as const, label: "Recusado", icon: X },
  { status: "expired" as const, label: "Expirar", icon: Clock },
];

const ALLOWED: Record<string, string[]> = {
  draft: ["sent"],
  sent: ["accepted", "rejected", "expired"],
  rejected: ["sent"],
  expired: ["sent"],
  accepted: [],
};

export function QuoteAdminActions({ quoteId, status, canWrite }: { quoteId: string; status: string; canWrite: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const allowed = ALLOWED[status] ?? [];

  if (!canWrite) return <span className="text-[10px] text-muted">leitura</span>;
  if (allowed.length === 0) return <span className="text-[10px] text-muted">concluído</span>;

  return (
    <div className="flex justify-end gap-1">
      {pending ? <Loader2 className="mt-1 h-3.5 w-3.5 animate-spin text-muted" /> : null}
      {OPTIONS.filter((option) => allowed.includes(option.status)).map((option) => {
        const Icon = option.icon;
        return (
          <button
            key={option.status}
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await quoteTransitionAction({ quoteId, status: option.status });
                if (!result.ok) toast.error(result.message);
                else toast.success(result.message);
                router.refresh();
              })
            }
            className="inline-flex items-center gap-1 rounded-md border border-line/70 px-1.5 py-0.5 text-[10px] text-muted transition-colors hover:border-accent/40 hover:text-accent"
          >
            <Icon className="h-3 w-3" /> {option.label}
          </button>
        );
      })}
    </div>
  );
}

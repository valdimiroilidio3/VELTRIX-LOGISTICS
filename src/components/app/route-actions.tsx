"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loader2, Sparkles, TruckIcon } from "lucide-react";
import { toast } from "sonner";
import { optimizeRouteAction, routeStatusAction } from "@/app/app/actions";
import { Button } from "@/components/ui";

export function RouteActions({ routeId, status, canOptimize, canWrite }: { routeId: string; status: string; canOptimize: boolean; canWrite: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const locked = status === "completed" || status === "in_progress" || status === "cancelled";

  return (
    <div className="flex flex-wrap gap-2">
      {canOptimize && !locked ? (
        <Button
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await optimizeRouteAction(routeId);
              if (!result.ok) toast.error(result.message);
              else toast.success(result.message);
              router.refresh();
            })
          }
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          Recalcular sequência
        </Button>
      ) : null}

      {canWrite && status === "planned" ? (
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await routeStatusAction({ routeId, status: "dispatched" });
              if (!result.ok) toast.error(result.message);
              else toast.success(result.message);
              router.refresh();
            })
          }
        >
          <TruckIcon className="h-3.5 w-3.5" /> Despachar rota
        </Button>
      ) : null}

      {canWrite && status === "dispatched" ? (
        <Button
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await routeStatusAction({ routeId, status: "in_progress" });
              if (!result.ok) toast.error(result.message);
              else toast.success(result.message);
              router.refresh();
            })
          }
        >
          Iniciar execução
        </Button>
      ) : null}
    </div>
  );
}

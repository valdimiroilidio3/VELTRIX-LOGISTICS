"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loader2, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import { processNotificationsAction } from "@/app/app/actions";
import { Button } from "@/components/ui";

export function ProcessQueueButton({ queued, failed }: { queued: number; failed: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="secondary"
      disabled={pending || (queued === 0 && failed === 0)}
      onClick={() =>
        startTransition(async () => {
          const result = await processNotificationsAction();
          if (!result.ok) toast.error(result.message);
          else toast.success(result.message);
          router.refresh();
        })
      }
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />}
      Processar fila
    </Button>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loader2, ShieldOff, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { userStatusAction } from "@/app/app/actions";
import { Button } from "@/components/ui";

export function UserStatusButton({ profileId, status }: { profileId: string; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const suspending = status === "active";

  return (
    <Button
      size="sm"
      variant={suspending ? "danger" : "secondary"}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await userStatusAction({ profileId, status: suspending ? "suspended" : "active" });
          if (!result.ok) toast.error(result.message);
          else toast.success(result.message);
          router.refresh();
        })
      }
    >
      {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : suspending ? <ShieldOff className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
      {suspending ? "Revogar acesso" : "Reativar"}
    </Button>
  );
}

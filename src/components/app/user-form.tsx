"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { createUserAction } from "@/app/app/actions";
import { Button, Field, Input, Notice, Select } from "@/components/ui";
import { ROLE_LABELS, type Role } from "@/lib/auth/rbac";

const ASSIGNABLE: Role[] = ["admin", "operations_manager", "dispatcher", "warehouse_operator", "driver", "finance", "customer"];

export function UserForm({ customers }: { customers: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<Role>("dispatcher");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createUserAction(formData);
      if (!result.ok) {
        setError(result.message);
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <UserPlus className="h-3.5 w-3.5" /> Novo utilizador
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-line bg-surface p-5 shadow-lift">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Novo utilizador</h2>
          <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted hover:text-ink">
            Fechar
          </button>
        </div>
        <p className="mt-1 text-[11px] text-muted">
          As contas são criadas por administradores — não existe registo público privilegiado.
        </p>

        <form action={onSubmit} className="mt-4 space-y-3" noValidate>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome completo" htmlFor="fullName">
              <Input id="fullName" name="fullName" required autoComplete="name" />
            </Field>
            <Field label="Email" htmlFor="user-email">
              <Input id="user-email" name="email" type="email" required autoComplete="off" />
            </Field>
            <Field label="Função" htmlFor="role">
              <Select id="role" name="role" value={role} onChange={(event) => setRole(event.target.value as Role)}>
                {ASSIGNABLE.map((option) => (
                  <option key={option} value={option}>
                    {ROLE_LABELS[option]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Telefone" htmlFor="user-phone">
              <Input id="user-phone" name="phone" type="tel" />
            </Field>
            <Field label="Palavra-passe inicial" htmlFor="password" hint="Mínimo 10 caracteres; o utilizador terá de a alterar no primeiro acesso" className="sm:col-span-2">
              <Input id="password" name="password" type="password" required minLength={10} autoComplete="new-password" />
            </Field>
            {role === "customer" ? (
              <Field label="Cliente associado" htmlFor="customerId" className="sm:col-span-2">
                <Select id="customerId" name="customerId" required>
                  <option value="">Selecionar cliente…</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Criar utilizador
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

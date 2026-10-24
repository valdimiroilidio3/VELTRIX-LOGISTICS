import Link from "next/link";
import { Search, Users } from "lucide-react";
import { requirePagePermission } from "@/lib/auth/page-guard";
import { listCustomers } from "@/lib/domain/commercial";
import { Badge, ButtonLink, EmptyState, Panel } from "@/components/ui";
import { CustomerForm } from "@/components/app/customer-form";
import { CustomerEdit } from "@/components/app/customer-edit";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Clientes" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requirePagePermission("customers:read");
  const { q } = await searchParams;
  const customers = await listCustomers(user.organizationId, q ?? null);
  const canWrite = user.permissions.includes("customers:write");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Clientes</h1>
          <p className="mt-1 text-xs text-muted">{customers.length} registos · pesquisa por designação, contacto, email ou telefone</p>
        </div>
        {canWrite ? <CustomerForm /> : null}
      </div>

      <Panel>
        <form action="/app/customers" className="flex items-center gap-2 border-b border-line/70 p-4" role="search">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" aria-hidden />
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder="Pesquisar por nome, email ou telefone…"
              aria-label="Pesquisar clientes"
              className="field h-10 pl-9"
            />
          </div>
          <button type="submit" className="h-10 rounded-xl bg-accent px-3.5 text-sm font-medium text-accent-foreground">
            Pesquisar
          </button>
        </form>

        {customers.length === 0 ? (
          <EmptyState
            icon={<Users className="h-4 w-4" />}
            title="Sem clientes"
            description={q ? "Nenhum cliente corresponde à pesquisa." : "Crie o primeiro cliente para começar a registar encomendas."}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th scope="col">Cliente</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Contacto</th>
                  <th scope="col">Estado</th>
                  <th scope="col" className="text-right">Encomendas</th>
                  <th scope="col" className="text-right">Criado</th>
                  {canWrite ? <th scope="col" className="text-right">Ações</th> : null}
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.id}>
                    <td>
                      <p className="text-xs font-medium text-ink">{customer.company_name ?? customer.contact_name}</p>
                      <p className="text-[10px] text-muted">{customer.company_name ? customer.contact_name : "Particular"}</p>
                    </td>
                    <td className="text-[11px] text-muted">{customer.customer_type === "business" ? "Empresa" : "Particular"}</td>
                    <td className="text-[11px] text-muted">
                      <p>{customer.email}</p>
                      <p className="text-[10px]">{customer.phone ?? "—"}</p>
                    </td>
                    <td>
                      <Badge tone={customer.status === "active" ? "success" : customer.status === "blocked" ? "danger" : "neutral"}>
                        {customer.status === "active" ? "Ativo" : customer.status === "blocked" ? "Bloqueado" : "Inativo"}
                      </Badge>
                    </td>
                    <td className="text-right">
                      <Link href={`/app/shipments?customerId=${customer.id}`} className="text-xs text-accent hover:underline">
                        {customer.shipments}
                      </Link>
                    </td>
                    <td className="text-right text-[11px] text-muted">{formatDate(customer.created_at)}</td>
                    {canWrite ? (
                      <td className="text-right">
                        <CustomerEdit customer={customer} />
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <p className="text-[10px] text-muted/70">
        Utilizadores do portal de cliente são criados em{" "}
        <Link href="/app/users" className="text-accent underline underline-offset-2">
          Utilizadores
        </Link>{" "}
        e ficam limitados às encomendas do cliente associado.
      </p>
      <ButtonLink href="/app/users" variant="ghost" size="sm" className="hidden">
        Utilizadores
      </ButtonLink>
    </div>
  );
}

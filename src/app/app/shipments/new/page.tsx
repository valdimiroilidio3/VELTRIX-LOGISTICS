import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSessionUser } from "@/lib/auth/session";
import { listCustomers } from "@/lib/domain/commercial";
import { ShipmentForm } from "@/components/app/shipment-form";
import { Notice } from "@/components/ui";

export const metadata = { title: "Nova encomenda" };

export default async function NewShipmentPage() {
  const session = await getSessionUser();
  if (!session) {
    // Session vanished between layout and page render (expired mid-navigation).
    return (
      <div className="mx-auto max-w-xl">
        <Notice tone="warning" title="Sessão expirada">
          A sua sessão terminou. Volte a <Link href="/login" className="underline">iniciar sessão</Link> para continuar.
        </Notice>
      </div>
    );
  }
  const user = session;

  // Customers may create their own transport requests; staff create any order.
  const isCustomer = user.role === "customer";
  if (!user.permissions.includes("shipments:create") && !user.permissions.includes("shipments:request")) {
    const { forbidden } = await import("next/navigation");
    forbidden();
  }

  const customers = isCustomer
    ? (await listCustomers(user.organizationId, null)).filter((customer) => customer.id === user.customerId)
    : await listCustomers(user.organizationId, null);

  const options = customers
    .filter((customer) => customer.status === "active" || customer.id === user.customerId)
    .map((customer) => ({ id: customer.id, name: customer.company_name ?? customer.contact_name }));

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <Link href="/app/shipments" className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink">
          <ArrowLeft className="h-3.5 w-3.5" /> Encomendas
        </Link>
        <h1 className="mt-3 text-xl font-semibold tracking-tight">Nova encomenda</h1>
        <p className="mt-1 text-xs text-muted">
          {isCustomer
            ? "O pedido é registado como «Pedido de orçamento» e fica visível para a equipa comercial. Receberá o valor antes de qualquer compromisso de transporte."
            : "O pedido é criado com código de rastreio único, em estado «Pedido de orçamento». Coordenadas são opcionais e nunca inventadas."}
        </p>
      </div>

      {options.length === 0 ? (
        <Notice tone="warning" title="Sem clientes ativos">
          Crie primeiro um cliente em <Link href="/app/customers" className="underline">Clientes</Link> para poder
          registar encomendas.
        </Notice>
      ) : null}

      <ShipmentForm customers={options} />
    </div>
  );
}

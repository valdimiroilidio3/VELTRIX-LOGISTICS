import { requirePagePermission } from "@/lib/auth/page-guard";
import { listUsers } from "@/lib/domain/people";
import { listCustomers } from "@/lib/domain/commercial";
import { ROLE_LABELS, ROLE_PERMISSIONS, type Role } from "@/lib/auth/rbac";
import { Badge, EmptyState, Notice, Panel, PanelHeader } from "@/components/ui";
import { UserForm } from "@/components/app/user-form";
import { UserStatusButton } from "@/components/app/user-status-button";
import { AdminPasswordResetButton } from "@/components/app/admin-password-reset";
import { formatDateTime, formatRelative } from "@/lib/utils";

export const metadata = { title: "Utilizadores" };

export default async function UsersPage() {
  const user = await requirePagePermission("users:manage");
  const [users, customers] = await Promise.all([listUsers(user.organizationId), listCustomers(user.organizationId, null)]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Utilizadores e permissões</h1>
          <p className="mt-1 text-xs text-muted">
            {users.length} contas · o estado suspenso encerra imediatamente todas as sessões ativas.
          </p>
        </div>
        <UserForm customers={customers.map((customer) => ({ id: customer.id, name: customer.company_name ?? customer.contact_name }))} />
      </div>

      <Notice tone="info" title="Modelo de permissões">
        8 funções, permissões declaradas no servidor e verificadas em cada pedido. A função nunca é aceite do browser.
        O isolamento entre organizações é aplicado por consulta (organization_id) e, em produção, reforçado por RLS no
        PostgreSQL.
      </Notice>

      <Panel>
        <PanelHeader title="Contas" description="Último acesso e estado" actions={<Badge tone="neutral">{users.length}</Badge>} />
        {users.length === 0 ? (
          <EmptyState title="Sem utilizadores" description="Nenhuma conta registada." />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th scope="col">Utilizador</th>
                  <th scope="col">Função</th>
                  <th scope="col">Permissões</th>
                  <th scope="col">Último acesso</th>
                  <th scope="col">Estado</th>
                  <th scope="col" className="text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {users.map((row) => {
                  const permissions = ROLE_PERMISSIONS[row.role as Role] ?? [];
                  return (
                    <tr key={row.id}>
                      <td>
                        <p className="text-xs font-medium text-ink">{row.full_name}</p>
                        <p className="text-[10px] text-muted">{row.email}</p>
                        {row.driver_id ? <Badge tone="info" className="mt-1">motorista</Badge> : null}
                      </td>
                      <td className="text-[11px] text-muted">{ROLE_LABELS[row.role as Role] ?? row.role}</td>
                      <td className="text-[11px] text-muted">{permissions.length} permissões</td>
                      <td className="text-[11px] text-muted">{row.last_login_at ? formatRelative(row.last_login_at) : "nunca"}</td>
                      <td>
                        <Badge tone={row.status === "active" ? "success" : "danger"}>{row.status === "active" ? "Ativo" : "Suspenso"}</Badge>
                        <p className="mt-1 text-[10px] text-muted/60">{formatDateTime(row.created_at)}</p>
                      </td>
                      <td className="text-right">
                        {row.id === user.id ? (
                          <span className="text-[10px] text-muted">a sua conta</span>
                        ) : (
                          <div className="flex flex-wrap justify-end gap-2">
                            <AdminPasswordResetButton profileId={row.id} userName={row.full_name} />
                            <UserStatusButton profileId={row.id} status={row.status} />
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

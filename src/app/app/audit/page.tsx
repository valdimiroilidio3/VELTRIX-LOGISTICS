import { FileText } from "lucide-react";
import { requirePagePermission } from "@/lib/auth/page-guard";
import { listAuditLogs } from "@/lib/domain/people";
import { Badge, EmptyState, Panel, PanelHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Auditoria" };

export default async function AuditPage() {
  const user = await requirePagePermission("audit:read");
  const logs = await listAuditLogs(user.organizationId, 150);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Registo de auditoria</h1>
        <p className="mt-1 text-xs text-muted">
          Ações sensíveis com autor, recurso e contexto. {logs.length} registos mais recentes.
        </p>
      </div>

      <Panel>
        <PanelHeader
          title="Eventos"
          description="Escritas de auditoria nunca quebram a operação que descrevem"
          actions={<Badge tone="neutral">{logs.length}</Badge>}
        />
        {logs.length === 0 ? (
          <EmptyState title="Sem registos" description="Ainda não existem ações auditadas nesta organização." icon={<FileText className="h-4 w-4" />} />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th scope="col">Data</th>
                  <th scope="col">Ação</th>
                  <th scope="col">Recurso</th>
                  <th scope="col">Autor</th>
                  <th scope="col">Contexto</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className="whitespace-nowrap text-[11px] text-muted">{formatDateTime(log.created_at)}</td>
                    <td className="font-mono text-[11px] text-ink">{log.action}</td>
                    <td className="text-[11px] text-muted">
                      {log.resource_type}
                      <span className="ml-1 font-mono text-[10px] text-muted/60">{log.resource_id?.slice(0, 8)}</span>
                    </td>
                    <td className="text-[11px] text-muted">{log.actor_email ?? "sistema"}</td>
                    <td className="max-w-[280px] truncate text-[10px] text-muted/70">{log.metadata ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <p className="text-[10px] leading-relaxed text-muted/70">
        Os dados sensíveis são redigidos nos logs técnicos. O IP é guardado apenas como hash, nunca em claro.
      </p>
    </div>
  );
}

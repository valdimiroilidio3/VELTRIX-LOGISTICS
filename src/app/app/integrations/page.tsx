import { AlertCircle, CheckCircle2, CircleDashed, Mail, Plug, RefreshCw } from "lucide-react";
import { requirePagePermission } from "@/lib/auth/page-guard";
import { integrationCatalog } from "@/lib/integrations/providers";
import { db } from "@/lib/db";
import { Badge, EmptyState, Notice, Panel, PanelHeader } from "@/components/ui";
import { INTEGRATION_STATUS_LABELS } from "@/lib/utils";
import { ProcessQueueButton } from "@/components/app/process-queue-button";

export const metadata = { title: "Integrações" };

const STATUS_TONE = {
  operational: "success",
  configured: "info",
  not_configured: "neutral",
  error: "danger",
} as const;

const CATEGORY_LABELS: Record<string, string> = {
  platform: "Plataforma",
  maps: "Mapas e rotas",
  communication: "Comunicação",
  payments: "Pagamentos",
  observability: "Observabilidade",
  storage: "Armazenamento",
};

export default async function IntegrationsPage() {
  const user = await requirePagePermission("settings:read");
  const catalog = integrationCatalog();
  const jobs = await db().all<{ status: string; c: number }>(
    "SELECT status, COUNT(*) AS c FROM notification_jobs WHERE organization_id = ? GROUP BY status",
    [user.organizationId],
  );
  const jobCounts = Object.fromEntries(jobs.map((row) => [row.status, Number(row.c)]));
  const failedJobs = await db().all<{ id: string; template: string; recipient: string; last_error: string | null; attempts: number; created_at: string }>(
    "SELECT id, template, recipient, last_error, attempts, created_at FROM notification_jobs WHERE organization_id = ? AND status = 'failed' ORDER BY created_at DESC LIMIT 8",
    [user.organizationId],
  );

  const groups = Object.entries(
    catalog.reduce<Record<string, typeof catalog>>((accumulator, item) => {
      (accumulator[item.category] ??= []).push(item);
      return accumulator;
    }, {}),
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Integrações</h1>
          <p className="mt-1 text-xs text-muted">
            Estado determinado em tempo de execução a partir das variáveis de ambiente. Nenhuma integração é
            apresentada como operacional sem credenciais.
          </p>
        </div>
        <ProcessQueueButton queued={jobCounts.queued ?? 0} failed={jobCounts.failed ?? 0} />
      </div>

      <Notice tone="info" title="Como interpretar">
        <span className="inline-flex items-start gap-1.5">
          <Plug className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            <strong>Não configurada</strong> — faltam variáveis de ambiente. <strong>Configurada</strong> — credenciais
            presentes, sem verificação de chamada. <strong>Operacional</strong> — usada em produção nesta instância.{" "}
            <strong>Erro</strong> — a última chamada falhou (ver fila de notificações).
          </span>
        </span>
      </Notice>

      <div className="grid gap-4 xl:grid-cols-2">
        {groups.map(([category, items]) => (
          <Panel key={category}>
            <PanelHeader title={CATEGORY_LABELS[category] ?? category} description={`${items.length} fornecedores`} />
            <ul className="divide-y divide-line/40">
              {items.map((item) => (
                <li key={item.key} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">{item.name}</p>
                      <p className="mt-0.5 text-[11px] text-muted">{item.purpose}</p>
                    </div>
                    <Badge tone={STATUS_TONE[item.status]}>
                      {item.status === "operational" ? <CheckCircle2 className="h-3 w-3" /> : item.status === "error" ? <AlertCircle className="h-3 w-3" /> : <CircleDashed className="h-3 w-3" />}
                      {INTEGRATION_STATUS_LABELS[item.status]}
                    </Badge>
                  </div>

                  {item.missingEnv.length > 0 ? (
                    <p className="mt-2 flex flex-wrap gap-1">
                      {item.missingEnv.map((name) => (
                        <code key={name} className="rounded border border-line/70 bg-bg/60 px-1.5 py-0.5 font-mono text-[10px] text-warning/90">
                          {name}
                        </code>
                      ))}
                    </p>
                  ) : null}

                  {item.notes ? <p className="mt-2 text-[10px] leading-relaxed text-muted/80">{item.notes}</p> : null}
                  <p className="mt-1.5 text-[10px] leading-relaxed text-muted/60">{item.monthlyCostNote}</p>
                </li>
              ))}
            </ul>
          </Panel>
        ))}
      </div>

      <Panel>
        <PanelHeader
          title="Fila de notificações"
          description="Outbox transacional: nenhuma notificação é perdida se o fornecedor falhar"
          actions={
            <div className="flex gap-1.5">
              <Badge tone="neutral">{jobCounts.queued ?? 0} em fila</Badge>
              <Badge tone={jobCounts.sent ? "success" : "neutral"}>{jobCounts.sent ?? 0} enviadas</Badge>
              <Badge tone={jobCounts.failed ? "danger" : "neutral"}>{jobCounts.failed ?? 0} falhadas</Badge>
            </div>
          }
        />
        {failedJobs.length === 0 ? (
          <EmptyState title="Sem falhas de entrega" description="Nenhuma notificação falhou nesta organização." icon={<Mail className="h-4 w-4" />} />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th scope="col">Modelo</th>
                  <th scope="col">Destinatário</th>
                  <th scope="col" className="text-right">Tentativas</th>
                  <th scope="col">Último erro</th>
                </tr>
              </thead>
              <tbody>
                {failedJobs.map((job) => (
                  <tr key={job.id}>
                    <td className="font-mono text-[11px]">{job.template}</td>
                    <td className="text-[11px] text-muted">{job.recipient}</td>
                    <td className="text-right text-xs tabular-nums">{job.attempts}</td>
                    <td className="max-w-[360px] truncate text-[10px] text-danger/90">{job.last_error ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="flex items-center gap-1.5 border-t border-line/60 px-5 py-2.5 text-[10px] text-muted/70">
          <RefreshCw className="h-3 w-3" /> Reprocessamento manual limitado a 3 tentativas com backoff exponencial.
        </p>
      </Panel>

      <Panel className="p-4">
        <p className="text-[11px] leading-relaxed text-muted">
          A configuração completa (variáveis, custos e limitações de cada fornecedor) está documentada em{" "}
          <code className="rounded bg-bg/60 px-1 py-0.5 font-mono text-[10px]">docs/INTEGRACOES.md</code>. Nenhuma
          credencial é lida no browser nem guardada na base de dados.
        </p>
      </Panel>
    </div>
  );
}


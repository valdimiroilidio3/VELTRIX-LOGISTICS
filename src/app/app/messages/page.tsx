import { Mail, MailWarning } from "lucide-react";
import { requirePagePermission } from "@/lib/auth/page-guard";
import { listContactMessages } from "@/lib/domain/commercial";
import { Badge, EmptyState, Notice, Panel, PanelHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";
import { env } from "@/lib/env";

export const metadata = { title: "Mensagens" };

const TOPIC_LABELS: Record<string, string> = {
  geral: "Geral",
  transporte: "Transporte",
  armazem: "Armazenagem",
  rastreio: "Rastreio",
  faturacao: "Faturação",
  privacidade: "Privacidade",
};

export default async function MessagesPage() {
  const user = await requirePagePermission("customers:read");
  const messages = await listContactMessages(user.organizationId);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Mensagens do site</h1>
        <p className="mt-1 text-xs text-muted">
          Pedidos recebidos pelo formulário de contacto. {messages.filter((message) => message.status === "new").length} novas.
        </p>
      </div>

      {!env.email.configured ? (
        <Notice tone="warning" title="Resposta por email indisponível">
          A integração de email (Resend) não está configurada. As mensagens são registadas aqui, mas não é enviada
          confirmação automática ao remetente — o estado real é mostrado ao utilizador no formulário.
        </Notice>
      ) : null}

      <Panel>
        <PanelHeader title="Caixa de entrada" description="Ordenada pela mais recente" actions={<Badge tone="neutral">{messages.length}</Badge>} />
        {messages.length === 0 ? (
          <EmptyState title="Sem mensagens" description="Ainda não existem submissões pelo formulário de contacto." icon={<Mail className="h-4 w-4" />} />
        ) : (
          <ul className="divide-y divide-line/40">
            {messages.map((message) => (
              <li key={message.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">{message.name}</p>
                    <p className="text-[11px] text-muted">{message.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone="neutral">{TOPIC_LABELS[message.topic] ?? message.topic}</Badge>
                    <Badge tone={message.status === "new" ? "accent" : "success"}>{message.status === "new" ? "Nova" : message.status}</Badge>
                  </div>
                </div>
                <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-muted">{message.message}</p>
                <p className="mt-2 text-[10px] text-muted/60">{formatDateTime(message.created_at)}</p>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <p className="flex items-center gap-1.5 text-[10px] text-muted/70">
        <MailWarning className="h-3 w-3" /> Mensagens não são reencaminhadas por email enquanto a integração estiver
        ausente; a resposta é feita diretamente ao endereço indicado.
      </p>
    </div>
  );
}

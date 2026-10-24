import { requirePagePermission } from "@/lib/auth/page-guard";
import { getOrganizationSettings, listPricingRules } from "@/lib/domain/settings";
import { emailIsConfigured } from "@/lib/integrations/email";
import { routingStatus } from "@/lib/routing/provider";
import { Badge, Notice, Panel, PanelHeader } from "@/components/ui";
import { DataModePanel, OrganizationSettingsForm, PricingRulesEditor } from "@/components/app/settings-forms";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Configuração" };

export default async function SettingsPage() {
  const user = await requirePagePermission("settings:read");
  const canWrite = user.permissions.includes("settings:write");

  const [organization, rules] = await Promise.all([
    getOrganizationSettings(user.organizationId),
    listPricingRules(user.organizationId),
  ]);
  const routing = routingStatus();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Configuração</h1>
        <p className="mt-1 text-xs text-muted">
          Organização criada em {formatDateTime(organization.created_at)} · {organization.country_code} ·{" "}
          {organization.default_currency}
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_1fr] xl:items-start">
        <div className="space-y-4">
          <OrganizationSettingsForm organization={organization} canWrite={canWrite} />
          <PricingRulesEditor rules={rules} canWrite={canWrite} />
        </div>

        <div className="space-y-4">
          <Panel>
            <PanelHeader title="Estado dos serviços" description="Verificado a partir das variáveis de ambiente do servidor" />
            <dl className="divide-y divide-line/40 text-[11px]">
              <div className="flex items-center justify-between px-5 py-3">
                <dt className="text-muted">Email transacional</dt>
                <dd>
                  <Badge tone={emailIsConfigured() ? "success" : "warning"}>
                    {emailIsConfigured() ? "configurado" : "não configurado"}
                  </Badge>
                </dd>
              </div>
              <div className="flex items-center justify-between px-5 py-3">
                <dt className="text-muted">Motor de rotas</dt>
                <dd>
                  <Badge tone={routing.configured ? "success" : "warning"}>{routing.provider ?? "não configurado"}</Badge>
                </dd>
              </div>
              <div className="flex items-center justify-between px-5 py-3">
                <dt className="text-muted">Base de dados</dt>
                <dd className="font-mono text-[10px] text-muted">{process.env.DATABASE_URL ? "postgresql" : "sqlite (dev)"}</dd>
              </div>
              <div className="flex items-center justify-between px-5 py-3">
                <dt className="text-muted">Jobs protegidos por segredo</dt>
                <dd>
                  <Badge tone={process.env.JOBS_SECRET ? "success" : "warning"}>
                    {process.env.JOBS_SECRET ? "ativo" : "JOBS_SECRET ausente"}
                  </Badge>
                </dd>
              </div>
            </dl>
            <p className="border-t border-line/40 px-5 py-3 text-[10px] leading-relaxed text-muted/70">{routing.note}</p>
          </Panel>

          <DataModePanel organization={organization} isAdmin={canWrite} />

          <Notice tone="info" title="Sobre os preços">
            A tabela acima define a base de cálculo usada nos orçamentos públicos e nas simulações internas. Os valores
            iniciais são provisórios e não representam a política comercial da VELTRIX. Alterações ficam registadas na
            auditoria com valores anteriores e novos.
          </Notice>
        </div>
      </div>
    </div>
  );
}

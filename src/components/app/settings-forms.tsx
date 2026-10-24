"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Save, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { dataModeAction, organizationSettingsAction, pricingRuleAction } from "@/app/app/actions";
import { Button, Field, Input, Notice, Panel, PanelHeader, Select } from "@/components/ui";
import { formatCurrency } from "@/lib/utils";
import type { OrganizationSettings } from "@/lib/domain/settings";
import type { PricingRuleView } from "@/lib/domain/settings";

export function OrganizationSettingsForm({ organization, canWrite }: { organization: OrganizationSettings; canWrite: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await organizationSettingsAction(formData);
      if (!result.ok) {
        setError(result.message);
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      router.refresh();
    });
  }

  return (
    <Panel>
      <PanelHeader title="Organização" description="Denominação usada em documentos e notificações" />
      <form action={onSubmit} className="space-y-3 p-5">
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome" htmlFor="orgName">
            <Input id="orgName" name="name" defaultValue={organization.name} disabled={!canWrite} required />
          </Field>
          <Field label="Denominação legal" htmlFor="orgLegal" hint="Usada em faturas internas">
            <Input id="orgLegal" name="legalName" defaultValue={organization.legal_name ?? ""} disabled={!canWrite} />
          </Field>
          <Field label="NIF / VAT" htmlFor="orgTax">
            <Input id="orgTax" name="taxNumber" defaultValue={organization.tax_number ?? ""} disabled={!canWrite} />
          </Field>
          <Field label="Moeda" htmlFor="orgCurrency" hint="ISO 4217">
            <Select id="orgCurrency" name="defaultCurrency" defaultValue={organization.default_currency} disabled={!canWrite}>
              {["EUR", "USD", "GBP", "CHF", "BRL"].map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Fuso horário" htmlFor="orgTz" hint="Formato IANA">
            <Input id="orgTz" name="timezone" defaultValue={organization.timezone} disabled={!canWrite} />
          </Field>
          <div className="flex items-end">
            <div className="w-full rounded-lg border border-line/60 bg-bg/40 px-3 py-2 text-[11px] text-muted">
              Modo de dados: <strong className="text-ink">{organization.data_mode === "demo" ? "demonstração" : "operacional"}</strong>
            </div>
          </div>
        </div>
        {canWrite ? (
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Guardar
            </Button>
          </div>
        ) : null}
      </form>
    </Panel>
  );
}

export function PricingRulesEditor({ rules, canWrite }: { rules: PricingRuleView[]; canWrite: boolean }) {
  return (
    <Panel>
      <PanelHeader
        title="Tabela de preços"
        description="Valores provisórios de demonstração — substituir antes de uso comercial"
      />
      <div className="divide-y divide-line/40">
        {rules.map((rule) => (
          <PricingRuleRowForm key={rule.id} rule={rule} canWrite={canWrite} />
        ))}
        {rules.length === 0 ? (
          <p className="px-5 py-6 text-[11px] text-muted">
            Sem regras configuradas: os orçamentos são recusados em vez de inventar um preço.
          </p>
        ) : null}
      </div>
    </Panel>
  );
}

function PricingRuleRowForm({ rule, canWrite }: { rule: PricingRuleView; canWrite: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(rule.active === 1);

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await pricingRuleAction(formData);
      if (!result.ok) {
        setError(result.message);
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      router.refresh();
    });
  }

  return (
    <form action={onSubmit} className="space-y-3 px-5 py-4">
      <input type="hidden" name="ruleId" value={rule.id} />
      <input type="hidden" name="active" value={active ? "true" : "false"} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium capitalize text-ink">{rule.service_type.replace("_", " ")}</p>
          <p className="text-[10px] text-muted">
            Mínimo {formatCurrency(rule.minimum_cents)} · IVA {rule.vat_rate_pct}% · combustível {rule.fuel_surcharge_pct}%
          </p>
        </div>
        <label className="flex items-center gap-2 text-[10px] text-muted">
          <input
            type="checkbox"
            checked={active}
            disabled={!canWrite}
            onChange={(event) => setActive(event.target.checked)}
            className="accent-[#B8F36A]"
          />
          Ativa
        </label>
      </div>

      {error ? <Notice tone="danger">{error}</Notice> : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <NumberField name="baseFee" label="Base (€)" cents={rule.base_fee_cents} disabled={!canWrite} />
        <NumberField name="perKg" label="Por kg (€)" cents={rule.per_kg_cents} disabled={!canWrite} />
        <NumberField name="perM3" label="Por m³ (€)" cents={rule.per_m3_cents} disabled={!canWrite} />
        <NumberField name="perKm" label="Por km (€)" cents={rule.per_km_cents} disabled={!canWrite} />
        <NumberField name="minimum" label="Mínimo (€)" cents={rule.minimum_cents} disabled={!canWrite} />
        <Field label="Combustível %" htmlFor={`fuel-${rule.id}`}>
          <Input id={`fuel-${rule.id}`} name="fuelSurcharge" type="number" step="0.01" min="0" max="100" defaultValue={rule.fuel_surcharge_pct} disabled={!canWrite} />
        </Field>
        <Field label="IVA %" htmlFor={`vat-${rule.id}`}>
          <Input id={`vat-${rule.id}`} name="vatRate" type="number" step="0.01" min="0" max="100" defaultValue={rule.vat_rate_pct} disabled={!canWrite} />
        </Field>
        <div className="flex items-end">
          {canWrite ? (
            <Button type="submit" size="sm" variant="secondary" disabled={pending} className="w-full">
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Atualizar
            </Button>
          ) : null}
        </div>
      </div>
    </form>
  );
}

function NumberField({ name, label, cents, disabled }: { name: string; label: string; cents: number; disabled: boolean }) {
  const id = `${name}-${cents}-${label}`;
  return (
    <Field label={label} htmlFor={id}>
      <Input id={id} name={name} type="number" step="0.01" min="0" defaultValue={(cents / 100).toFixed(2)} disabled={disabled} />
    </Field>
  );
}

export function DataModePanel({ organization, isAdmin }: { organization: OrganizationSettings; isAdmin: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);

  const target = organization.data_mode === "demo" ? "live" : "demo";

  return (
    <Panel className="p-5">
      <div className="flex items-start gap-2">
        <ShieldAlert className="mt-0.5 h-4 w-4 text-warning" />
        <div>
          <h2 className="text-sm font-semibold">Modo de dados</h2>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">
            Em modo demonstração, todos os registos de exemplo aparecem marcados. A mudança de modo não apaga dados:
            apenas altera o rótulo e o aviso apresentado nas páginas. A remoção de dados demo é uma tarefa de
            manutenção separada e auditada.
          </p>
        </div>
      </div>

      <form
        className="mt-4 space-y-3"
        action={(formData) =>
          startTransition(async () => {
            setError(null);
            const result = await dataModeAction(formData);
            if (!result.ok) {
              setError(result.message);
              toast.error(result.message);
              return;
            }
            toast.success(result.message);
            setConfirmation("");
            router.refresh();
          })
        }
      >
        <input type="hidden" name="mode" value={target} />
        {target === "live" ? (
          <Field label="Escreva PRODUCAO para confirmar" htmlFor="dataModeConfirm">
            <Input
              id="dataModeConfirm"
              name="confirmation"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder="PRODUCAO"
              disabled={!isAdmin}
            />
          </Field>
        ) : null}
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Button type="submit" size="sm" variant="secondary" disabled={pending || !isAdmin}>
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {target === "live" ? "Ativar modo operacional" : "Voltar a modo demonstração"}
        </Button>
      </form>
    </Panel>
  );
}

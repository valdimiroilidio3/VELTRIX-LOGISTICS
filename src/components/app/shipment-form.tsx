"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createShipmentAction } from "@/app/app/actions";
import { Button, Field, Input, Notice, Select, Textarea } from "@/components/ui";

interface CustomerOption {
  id: string;
  name: string;
}

interface ItemLine {
  key: string;
  description: string;
  quantity: number;
  weightKg: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
}

let itemCounter = 0;
const newItem = (): ItemLine => ({
  key: `item-${(itemCounter += 1)}`,
  description: "",
  quantity: 1,
  weightKg: 1,
});

export function ShipmentForm({ customers }: { customers: CustomerOption[] }) {
  const router = useRouter();
  const [items, setItems] = useState<ItemLine[]>([newItem()]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const totalWeight = items.reduce((sum, item) => sum + (Number(item.weightKg) || 0) * (Number(item.quantity) || 0), 0);

  function onSubmit(formData: FormData) {
    setError(null);
    if (items.some((item) => item.description.trim().length < 2)) {
      setError("Cada artigo precisa de uma descrição com pelo menos 2 caracteres.");
      return;
    }
    formData.set("items", JSON.stringify(items.map(({ key: _key, ...rest }) => rest)));
    startTransition(async () => {
      const result = await createShipmentAction(formData);
      if (!result.ok) {
        setError(result.message);
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      const created = result.data as { id?: string } | undefined;
      router.push(`/app/shipments/${created?.id ?? ""}`);
    });
  }

  return (
    <form action={onSubmit} className="space-y-4" noValidate>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <input type="hidden" name="idempotencyKey" value={`ui-${Date.now()}`} />

      <div className="panel p-5">
        <h2 className="text-sm font-semibold">Cliente e serviço</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Cliente" htmlFor="customerId" hint={customers.length === 0 ? "Crie primeiro um cliente" : undefined}>
            <Select id="customerId" name="customerId" required disabled={customers.length === 0}>
              <option value="">Selecionar cliente…</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tipo de serviço" htmlFor="serviceType">
            <Select id="serviceType" name="serviceType" defaultValue="standard">
              <option value="standard">Standard</option>
              <option value="express">Express</option>
              <option value="same_day">Same day</option>
              <option value="freight">Freight</option>
              <option value="international">Internacional</option>
            </Select>
          </Field>
          <Field label="Prioridade" htmlFor="priority">
            <Select id="priority" name="priority" defaultValue="normal">
              <option value="low">Baixa</option>
              <option value="normal">Normal</option>
              <option value="high">Alta</option>
              <option value="urgent">Urgente</option>
            </Select>
          </Field>
          <Field label="Valor cotado (EUR)" htmlFor="quotedAmount" hint="Deixe vazio se o pedido ainda vai a orçamento">
            <Input id="quotedAmount" name="quotedAmount" type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00" />
          </Field>
          <Field label="Recolha pretendida" htmlFor="requestedPickupAt">
            <Input id="requestedPickupAt" name="requestedPickupAt" type="datetime-local" />
          </Field>
          <Field label="Entrega estimada" htmlFor="estimatedDeliveryAt">
            <Input id="estimatedDeliveryAt" name="estimatedDeliveryAt" type="datetime-local" />
          </Field>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {(["origin", "destination"] as const).map((side) => (
          <div key={side} className="panel p-5">
            <h2 className="text-sm font-semibold">{side === "origin" ? "Origem" : "Destino"}</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Morada" htmlFor={`${side}AddressLine`} className="sm:col-span-2">
                <Input id={`${side}AddressLine`} name={`${side}AddressLine`} required placeholder="Rua, número, porta" />
              </Field>
              <Field label="Código postal" htmlFor={`${side}PostalCode`}>
                <Input id={`${side}PostalCode`} name={`${side}PostalCode`} placeholder="0000-000" />
              </Field>
              <Field label="Cidade" htmlFor={`${side}City`}>
                <Input id={`${side}City`} name={`${side}City`} required placeholder="Cidade" />
              </Field>
              <Field label="País (ISO-2)" htmlFor={`${side}CountryCode`}>
                <Input id={`${side}CountryCode`} name={`${side}CountryCode`} defaultValue="PT" maxLength={2} required />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Lat." htmlFor={`${side}Latitude`}>
                  <Input id={`${side}Latitude`} name={`${side}Latitude`} type="number" step="0.000001" placeholder="opcional" />
                </Field>
                <Field label="Lng." htmlFor={`${side}Longitude`}>
                  <Input id={`${side}Longitude`} name={`${side}Longitude`} type="number" step="0.000001" placeholder="opcional" />
                </Field>
              </div>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-muted/80">
              Sem coordenadas a localização não é validada e o mapa não é apresentado — não são inventadas localizações.
            </p>
          </div>
        ))}
      </div>

      <div className="panel p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Artigos</h2>
            <p className="mt-0.5 text-xs text-muted">
              Peso total calculado: <span className="text-ink">{Math.round(totalWeight * 100) / 100} kg</span>
            </p>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={() => setItems((current) => [...current, newItem()])}>
            <Plus className="h-3.5 w-3.5" /> Adicionar artigo
          </Button>
        </div>

        <div className="mt-4 space-y-3">
          {items.map((item, index) => (
            <div key={item.key} className="grid gap-2 rounded-xl border border-line/60 bg-bg/40 p-3 sm:grid-cols-12">
              <div className="sm:col-span-5">
                <label className="label" htmlFor={`desc-${item.key}`}>
                  Descrição
                </label>
                <Input
                  id={`desc-${item.key}`}
                  value={item.description}
                  onChange={(event) =>
                    setItems((current) => current.map((entry) => (entry.key === item.key ? { ...entry, description: event.target.value } : entry)))
                  }
                  placeholder="Ex.: caixa de componentes"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor={`qty-${item.key}`}>
                  Qtd.
                </label>
                <Input
                  id={`qty-${item.key}`}
                  type="number"
                  min={1}
                  value={item.quantity}
                  onChange={(event) =>
                    setItems((current) => current.map((entry) => (entry.key === item.key ? { ...entry, quantity: Number(event.target.value) } : entry)))
                  }
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor={`kg-${item.key}`}>
                  Peso (kg)
                </label>
                <Input
                  id={`kg-${item.key}`}
                  type="number"
                  min={0}
                  step="0.01"
                  value={item.weightKg}
                  onChange={(event) =>
                    setItems((current) => current.map((entry) => (entry.key === item.key ? { ...entry, weightKg: Number(event.target.value) } : entry)))
                  }
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor={`dim-${item.key}`}>
                  Dimensões (cm)
                </label>
                <div className="flex gap-1">
                  {(["lengthCm", "widthCm", "heightCm"] as const).map((dimension) => (
                    <Input
                      key={dimension}
                      aria-label={dimension === "lengthCm" ? "Comprimento" : dimension === "widthCm" ? "Largura" : "Altura"}
                      type="number"
                      min={0}
                      placeholder={dimension === "lengthCm" ? "C" : dimension === "widthCm" ? "L" : "A"}
                      value={item[dimension] ?? ""}
                      onChange={(event) =>
                        setItems((current) =>
                          current.map((entry) => (entry.key === item.key ? { ...entry, [dimension]: Number(event.target.value) || undefined } : entry)),
                        )
                      }
                    />
                  ))}
                </div>
              </div>
              <div className="flex items-end sm:col-span-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={items.length === 1}
                  onClick={() => setItems((current) => current.filter((entry) => entry.key !== item.key))}
                  aria-label={`Remover artigo ${index + 1}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel p-5">
        <Field label="Notas operacionais" htmlFor="notes">
          <Textarea id="notes" name="notes" placeholder="Instruções de manuseamento, restrições de acesso, contacto no local…" maxLength={1000} />
        </Field>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] text-muted">
            A encomenda é criada em <span className="text-ink">rascunho</span>. A confirmação exige validação posterior.
          </p>
          <Button type="submit" disabled={pending || customers.length === 0}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Criar encomenda
          </Button>
        </div>
      </div>
    </form>
  );
}

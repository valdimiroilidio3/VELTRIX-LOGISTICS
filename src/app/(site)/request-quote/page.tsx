import type { Metadata } from "next";
import { Calculator, Clock, FileCheck2, ShieldCheck } from "lucide-react";
import { QuoteForm } from "@/components/site/quote-form";

export const metadata: Metadata = {
  title: "Pedido de orçamento",
  description:
    "Peça uma estimativa de transporte com origem, destino, peso e volume. A plataforma aplica a tabela tarifária configurada e devolve o valor indicativo com as premissas utilizadas.",
  alternates: { canonical: "/request-quote" },
};

export default function RequestQuotePage() {
  return (
    <div className="container-page py-14 lg:py-20">
      <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
        <div className="lg:sticky lg:top-24">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">Orçamentos</p>
          <h1 className="mt-2 font-display text-4xl leading-tight tracking-tight">
            Uma estimativa com
            <br />
            premissas visíveis
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-muted">
            O cálculo usa a tabela tarifária ativa da empresa — taxa base, custo por kg, por m³, por km, sobretaxa de
            combustível e IVA. Mostramos sempre as premissas aplicadas, para que a proposta final possa ser comparada.
          </p>

          <ul className="mt-8 space-y-3">
            {[
              { icon: Calculator, text: "Fórmula configurável na base de dados, não fixa no código" },
              { icon: Clock, text: "Resposta da equipa em 1 dia útil, quando o email está configurado" },
              { icon: FileCheck2, text: "Validade indicativa de 15 dias, sujeita a confirmação comercial" },
              { icon: ShieldCheck, text: "Dados usados apenas para responder ao pedido" },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.text} className="flex items-start gap-3 text-xs text-muted">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line/70 bg-surface/60 text-accent">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="pt-1.5 leading-relaxed">{item.text}</span>
                </li>
              );
            })}
          </ul>

          <div className="mt-8 rounded-xl border border-warning/25 bg-warning/5 p-4 text-[11px] leading-relaxed text-warning/90">
            <strong className="font-semibold">Nota de transparência:</strong> os valores são gerados por uma tabela
            provisória de demonstração até a empresa validar os seus tarifários. Nenhum preço apresentado deve ser
            interpretado como oferta comercial vinculativa.
          </div>
        </div>

        <QuoteForm />
      </div>
    </div>
  );
}

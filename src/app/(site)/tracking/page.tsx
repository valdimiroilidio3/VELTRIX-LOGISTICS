import type { Metadata } from "next";
import { Clock3, EyeOff, MapPin, ShieldCheck } from "lucide-react";
import { TrackForm } from "@/components/site/track-form";

export const metadata: Metadata = {
  title: "Rastreio de encomendas",
  description:
    "Introduza o código de rastreio para consultar o estado atual, o histórico de eventos e a janela de entrega estimada da sua encomenda.",
  alternates: { canonical: "/tracking" },
};

export default function TrackingPage() {
  return (
    <div className="container-page py-16 lg:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">Rastreio</p>
        <h1 className="mt-3 font-display text-4xl tracking-tight sm:text-5xl">Onde está a sua encomenda?</h1>
        <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-muted">
          O código de rastreio é único por encomenda e é enviado no email de confirmação. A consulta é pública, mas
          limitada por privacidade e protegida contra tentativas de enumeração.
        </p>

        <div className="mt-8">
          <TrackForm />
        </div>
      </div>

      <div className="mx-auto mt-16 grid max-w-4xl gap-4 sm:grid-cols-2">
        {[
          {
            icon: MapPin,
            title: "Eventos reais, não simulações",
            description: "Cada linha do histórico corresponde a um evento registado na base de dados, com data, hora e local.",
          },
          {
            icon: Clock3,
            title: "Estimativas identificadas",
            description: "A janela de entrega é apresentada como estimativa e desaparece quando a entrega é confirmada.",
          },
          {
            icon: EyeOff,
            title: "Privacidade por defeito",
            description: "O rastreio público mostra cidade e país — nunca morada completa, contacto ou coordenadas do motorista.",
          },
          {
            icon: ShieldCheck,
            title: "Códigos difíceis de adivinhar",
            description: "Os códigos usam caracteres aleatórios e a consulta tem limites de pedidos por minuto.",
          },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.title} className="rounded-xl border border-line/70 bg-surface/50 p-5">
              <Icon className="h-4 w-4 text-accent" aria-hidden />
              <p className="mt-3 text-sm font-medium text-ink">{item.title}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">{item.description}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

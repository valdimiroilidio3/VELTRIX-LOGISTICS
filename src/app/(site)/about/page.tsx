import type { Metadata } from "next";
import { Compass, Gauge, ShieldCheck, Users } from "lucide-react";
import { Panel } from "@/components/ui";

export const metadata: Metadata = {
  title: "Sobre a VELTRIX",
  description:
    "A VELTRIX é uma empresa de logística que usa tecnologia para coordenar encomendas, transportes, distribuição, armazenagem e operações.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <div className="container-page py-14 lg:py-20">
      <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">Empresa</p>
          <h1 className="mt-3 font-display text-4xl leading-tight tracking-tight sm:text-5xl">
            Tecnologia ao serviço da operação
          </h1>
          <div className="mt-6 space-y-4 text-sm leading-relaxed text-muted">
            <p>
              A VELTRIX posiciona-se como uma empresa de logística que utiliza tecnologia para coordenar encomendas,
              transportes, distribuição, armazenagem, clientes e operações. A plataforma é construída a partir das
              regras reais do dia a dia: estados, responsáveis, prazos e evidências.
            </p>
            <p>
              O princípio orientador é simples: se um indicador é apresentado, deve ser possível explicar de onde vem;
              se um estado é alterado, deve existir registo de quem o alterou e porquê; se uma integração não está
              configurada, o sistema diz isso em vez de simular sucesso.
            </p>
            <p>
              A operação inicia-se em Portugal. A expansão para outros mercados — incluindo Moçambique — está prevista
              na arquitetura (multiempresa, multimoeda, multimoeda documental) mas depende de validação operacional,
              aduaneira e legal antes de qualquer compromisso comercial.
            </p>
          </div>

          <div className="mt-8 rounded-xl border border-warning/25 bg-warning/5 p-4 text-[11px] leading-relaxed text-warning/90">
            <strong className="font-semibold">Identidade em validação.</strong> A marca, denominação social, contactos
            oficiais e informação fiscal serão publicados apenas após validação. Nenhuma certificação, parceria ou
            volume de entregas é afirmado nesta fase.
          </div>
        </div>

        <div className="space-y-4">
          {[
            {
              icon: ShieldCheck,
              title: "Fiabilidade operacional",
              description: "Máquina de estados formal: uma entrega só é confirmada com prova de entrega registada.",
            },
            {
              icon: Gauge,
              title: "Precisão e controlo",
              description: "Permissões verificadas no servidor, por função e por recurso, com auditoria de ações sensíveis.",
            },
            {
              icon: Compass,
              title: "Transparência",
              description: "Integrações mostram o estado real. Sem credenciais, aparecem como não configuradas.",
            },
            {
              icon: Users,
              title: "Operação e cliente final",
              description: "Portal interno para a equipa e portal de cliente limitado aos próprios envios.",
            },
          ].map((value) => {
            const Icon = value.icon;
            return (
              <Panel key={value.title} className="p-5">
                <Icon className="h-4 w-4 text-accent" aria-hidden />
                <h2 className="mt-3 text-sm font-semibold">{value.title}</h2>
                <p className="mt-1.5 text-xs leading-relaxed text-muted">{value.description}</p>
              </Panel>
            );
          })}
        </div>
      </div>
    </div>
  );
}

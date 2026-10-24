import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  Boxes,
  ClipboardCheck,
  Compass,
  Factory,
  Gauge,
  MapPinned,
  PackageCheck,
  Route,
  ShieldCheck,
  Snowflake,
  Stethoscope,
  Store,
  Truck,
  Warehouse,
} from "lucide-react";
import { TrackForm } from "@/components/site/track-form";
import { FacilityViewer } from "@/components/three/facility-viewer";
import { Badge, ButtonLink } from "@/components/ui";
import { ensureDatabase } from "@/lib/db";
import { getFacilityLayout } from "@/lib/domain/warehouse";

export const metadata: Metadata = {
  title: "VELTRIX — Logística e tecnologia para operações exigentes",
  description:
    "Coordenamos encomendas, transportes, distribuição e armazenagem numa única plataforma, com rastreio em cada etapa e prova de entrega auditável.",
  alternates: { canonical: "/" },
};

const CAPABILITIES = [
  {
    icon: Truck,
    title: "Transporte e distribuição",
    description: "Recolhas, transferências entre hubs e distribuição de última milha com planeamento de rotas.",
    points: ["Serviço standard, express e same-day", "Carga fracionada e frete", "Planeamento assistido por paragens"],
    href: "/services",
  },
  {
    icon: Warehouse,
    title: "Armazenagem e preparação",
    description: "Receção, armazenagem, preparação de encomendas e expedição com movimentos registados.",
    points: ["Zonas com capacidade controlada", "Movimentos de inventário auditáveis", "Preparação ligada à encomenda"],
    href: "/services#armazenagem",
  },
  {
    icon: ShieldCheck,
    title: "Controlo e rastreio",
    description: "Estado por etapa, histórico cronológico e prova de entrega protegida.",
    points: ["Rastreio público por código", "Eventos com autor e contexto", "Documentos com acesso controlado"],
    href: "/tracking",
  },
];

const FLOW = [
  { title: "Pedido", description: "Pedido de orçamento com origem, destino, peso e volume." },
  { title: "Confirmação", description: "Validação comercial, criação da encomenda e código de rastreio." },
  { title: "Operação", description: "Recolha, trânsito e distribuição com eventos registados em cada etapa." },
  { title: "Entrega", description: "Confirmação com prova de entrega e histórico consultável." },
];

const MODULES = [
  { icon: PackageCheck, label: "Encomendas e expedições", detail: "Máquina de estados com transições validadas" },
  { icon: Route, label: "Rotas e entregas", detail: "Sequenciação, capacidade e distâncias calculadas" },
  { icon: MapPinned, label: "Motoristas e frota", detail: "Tarefas atribuídas e portal móvel" },
  { icon: Boxes, label: "Armazém e inventário", detail: "Zonas, movimentos e centro 3D" },
  { icon: ClipboardCheck, label: "Prova de entrega", detail: "Fotografia, assinatura e recetor identificado" },
  { icon: Gauge, label: "Indicadores operacionais", detail: "Métricas com definição e período explícitos" },
];

const SECTORS = [
  { icon: Factory, label: "Indústria e componentes" },
  { icon: Store, label: "Retalho e bens de consumo" },
  { icon: Stethoscope, label: "Saúde e farmácia" },
  { icon: Snowflake, label: "Cadeia de frio (mediante validação)" },
  { icon: Compass, label: "Importação e exportação" },
  { icon: Truck, label: "Distribuição urbana" },
];

const FAQS = [
  {
    question: "Como acompanho a minha encomenda?",
    answer:
      "Cada encomenda tem um código de rastreio único. Introduza-o na página de rastreio para ver o estado atual, o histórico de eventos e a janela de entrega estimada. Por privacidade, apenas a cidade e o país são apresentados publicamente.",
  },
  {
    question: "Os valores apresentados correspondem a preços finais?",
    answer:
      "O simulador aplica a tabela tarifária configurada pela empresa. O resultado é indicativo e é sempre confirmado comercialmente antes de qualquer compromisso.",
  },
  {
    question: "A VELTRIX opera fora de Portugal?",
    answer:
      "A plataforma está preparada para operações multiempresa e multi-país. Qualquer operação internacional — incluindo Moçambique — depende de validação operacional, aduaneira e legal antes de ser comercializada.",
  },
  {
    question: "Que informação é guardada na prova de entrega?",
    answer:
      "Identificação de quem recebeu, data e hora, fotografias e assinatura simples (não qualificada). Os ficheiros são privados e acessíveis apenas com sessão autorizada e ligações assinadas de curta duração.",
  },
  {
    question: "Como são tratados os dados pessoais?",
    answer:
      "Aplicamos minimização de dados, controlo de acessos por função e registos de auditoria para operações sensíveis. Consulte a política de privacidade para finalidades, prazos e direitos.",
  },
];

export default async function HomePage() {
  let zones: Awaited<ReturnType<typeof getFacilityLayout>>["zones"] = [];
  try {
    await ensureDatabase();
    const layout = await getFacilityLayout(process.env.DEMO_ORG_ID ?? (await firstOrgId()));
    zones = layout.zones;
  } catch {
    zones = [];
  }

  return (
    <>
      {/* hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -left-40 top-[-10rem] h-[28rem] w-[28rem] rounded-full bg-accent/10 blur-[120px]" aria-hidden />
        <div className="pointer-events-none absolute right-[-10rem] top-24 h-[22rem] w-[22rem] rounded-full bg-info/10 blur-[120px]" aria-hidden />
        <div className="container-page relative grid gap-12 pb-16 pt-14 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-14 lg:pb-24 lg:pt-20">
          <div className="animate-fade-up">
            <div className="flex items-center gap-2">
              <Badge tone="accent">Logistics &amp; Technology</Badge>
              <span className="text-[11px] uppercase tracking-[0.16em] text-muted">Moving business forward.</span>
            </div>
            <h1 className="mt-6 font-display text-[2.6rem] leading-[1.04] tracking-[-0.03em] text-ink sm:text-6xl">
              Logística que se mede,
              <br />
              <span className="text-accent">não se promete.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-muted">
              A VELTRIX coordena encomendas, transportes, distribuição e armazenagem numa plataforma única.
              Cada transição de estado é registada, cada entrega tem prova, cada indicador tem origem.
            </p>

            <div className="mt-8 max-w-xl">
              <TrackForm />
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-muted">
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden /> Operação em Portugal
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-muted/60" aria-hidden /> Expansão internacional mediante validação
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-muted/60" aria-hidden /> Acesso por função
              </span>
            </div>
          </div>

          <div className="animate-fade-up lg:pl-4">
            <FacilityViewer zones={zones} height={400} isDemo />
            <p className="mt-2 px-1 text-[11px] leading-relaxed text-muted/80">
              Representação 3D do centro logístico gerada a partir das zonas de armazenagem registadas. Em ausência de
              dados operacionais, a demonstração é identificada como tal.
            </p>
          </div>
        </div>
        <div className="hairline" />
      </section>

      {/* capabilities */}
      <section className="container-page py-16 lg:py-20" aria-labelledby="capabilities-title">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">Serviços</p>
            <h2 id="capabilities-title" className="mt-2 font-display text-3xl tracking-tight text-ink sm:text-4xl">
              Três camadas, uma operação contínua
            </h2>
          </div>
          <ButtonLink href="/services" variant="ghost" size="sm">
            Ver detalhe dos serviços <ArrowRight className="h-3.5 w-3.5" />
          </ButtonLink>
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {CAPABILITIES.map((capability, index) => {
            const Icon = capability.icon;
            return (
              <article
                key={capability.title}
                className="group relative overflow-hidden rounded-2xl border border-line/70 bg-surface/60 p-6 transition-colors hover:border-accent/30 hover:bg-surface"
              >
                <span className="absolute right-5 top-5 font-display text-4xl text-line/80">0{index + 1}</span>
                <span className="inline-grid h-11 w-11 place-items-center rounded-xl border border-line/80 bg-bg/60 text-accent">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-5 text-lg font-semibold tracking-tight text-ink">{capability.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{capability.description}</p>
                <ul className="mt-4 space-y-1.5 text-xs text-muted/90">
                  {capability.points.map((point) => (
                    <li key={point} className="flex items-start gap-2">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent/70" aria-hidden />
                      {point}
                    </li>
                  ))}
                </ul>
                <Link
                  href={capability.href}
                  className="mt-5 inline-flex items-center gap-1.5 text-xs font-medium text-accent transition-transform group-hover:translate-x-0.5"
                >
                  Saber mais <ArrowRight className="h-3 w-3" />
                </Link>
              </article>
            );
          })}
        </div>
      </section>

      {/* flow */}
      <section className="border-y border-line/60 bg-surface/30" aria-labelledby="flow-title">
        <div className="container-page py-16">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">Fluxo operacional</p>
            <h2 id="flow-title" className="mt-2 font-display text-3xl tracking-tight sm:text-4xl">
              Do pedido à prova de entrega
            </h2>
          </div>
          <ol className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-line/70 bg-line/60 sm:grid-cols-2 lg:grid-cols-4">
            {FLOW.map((step, index) => (
              <li key={step.title} className="bg-bg p-6">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                  <span className="grid h-6 w-6 place-items-center rounded-md border border-line/80 text-accent">{index + 1}</span>
                  Etapa
                </div>
                <h3 className="mt-4 text-base font-semibold text-ink">{step.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-muted">{step.description}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* platform */}
      <section className="container-page py-16 lg:py-20" aria-labelledby="platform-title">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">Plataforma</p>
            <h2 id="platform-title" className="mt-2 font-display text-3xl tracking-tight sm:text-4xl">
              Visibilidade operacional com regras explícitas
            </h2>
            <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted">
              A plataforma separa o que é planeado, o que está em curso e o que foi efetivamente confirmado. As
              transições de estado são validadas no servidor, as permissões são verificadas por função e cada ação
              sensível fica registada para auditoria.
            </p>
            <div className="mt-6 grid gap-3 text-xs text-muted">
              {[
                "Rastreio público com campos explicitamente autorizados",
                "Portal do motorista mobile-first, com fila tolerante a rede instável",
                "Documentos e provas de entrega em armazenamento privado",
                "Integrações com estado visível: não configurada, configurada, operacional ou erro",
              ].map((item) => (
                <div key={item} className="flex items-start gap-2.5 rounded-lg border border-line/60 bg-surface/50 px-3.5 py-2.5">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-px overflow-hidden rounded-2xl border border-line/70 bg-line/60 sm:grid-cols-2">
            {MODULES.map((module) => {
              const Icon = module.icon;
              return (
                <div key={module.label} className="bg-surface/70 p-5 transition-colors hover:bg-surface">
                  <Icon className="h-4 w-4 text-accent" aria-hidden />
                  <p className="mt-3 text-sm font-medium text-ink">{module.label}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted">{module.detail}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* sectors */}
      <section className="border-y border-line/60 bg-surface/30">
        <div className="container-page py-14">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Setores servidos</h2>
          <div className="mt-6 flex flex-wrap gap-2.5">
            {SECTORS.map((sector) => {
              const Icon = sector.icon;
              return (
                <span
                  key={sector.label}
                  className="inline-flex items-center gap-2 rounded-full border border-line/80 bg-bg/60 px-4 py-2 text-xs text-ink/85"
                >
                  <Icon className="h-3.5 w-3.5 text-accent/80" aria-hidden />
                  {sector.label}
                </span>
              );
            })}
          </div>
        </div>
      </section>

      {/* quote cta */}
      <section className="container-page py-16 lg:py-20">
        <div className="relative overflow-hidden rounded-3xl border border-accent/20 bg-gradient-to-br from-surface via-surface to-[#0d2336] p-8 lg:p-12">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-accent/10 blur-3xl" aria-hidden />
          <div className="relative grid gap-8 lg:grid-cols-[1.3fr_0.7fr] lg:items-center">
            <div>
              <h2 className="font-display text-3xl tracking-tight sm:text-4xl">Precisa de uma estimativa?</h2>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
                Indique origem, destino, peso e volume. A plataforma aplica a tabela tarifária configurada e devolve um
                valor indicativo com as premissas utilizadas — sem compromisso até confirmação comercial.
              </p>
            </div>
            <div className="flex flex-col gap-2.5 sm:flex-row lg:flex-col">
              <ButtonLink href="/request-quote" size="lg" className="w-full justify-center">
                Pedir orçamento <ArrowRight className="h-4 w-4" />
              </ButtonLink>
              <ButtonLink href="/contact" size="lg" variant="secondary" className="w-full justify-center">
                Falar com a equipa
              </ButtonLink>
            </div>
          </div>
        </div>
      </section>

      {/* faq */}
      <section className="container-page pb-20" aria-labelledby="faq-title">
        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">Perguntas frequentes</p>
            <h2 id="faq-title" className="mt-2 font-display text-3xl tracking-tight">
              Respostas sem letra pequena
            </h2>
            <p className="mt-3 max-w-sm text-xs leading-relaxed text-muted">
              Se a resposta que procura não estiver aqui, a equipa responde através do formulário de contacto.
            </p>
          </div>
          <div className="divide-y divide-line/60 rounded-2xl border border-line/70 bg-surface/40">
            {FAQS.map((faq) => (
              <details key={faq.question} className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium text-ink">
                  {faq.question}
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-line/70 text-muted transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-3 text-xs leading-relaxed text-muted">{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

async function firstOrgId(): Promise<string> {
  const { db } = await import("@/lib/db");
  const row = await db().get<{ id: string }>("SELECT id FROM organizations WHERE status = 'active' ORDER BY created_at ASC");
  return row?.id ?? "";
}

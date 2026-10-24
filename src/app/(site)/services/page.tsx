import type { Metadata } from "next";
import { ArrowRight, Boxes, Check, ClipboardList, Container, Snowflake, Truck, Warehouse } from "lucide-react";
import { ButtonLink, Panel } from "@/components/ui";

export const metadata: Metadata = {
  title: "Serviços de transporte e distribuição",
  description:
    "Transporte standard, express e same-day, carga fracionada, distribuição de última milha, armazenagem, preparação de encomendas e operações internacionais mediante validação.",
  alternates: { canonical: "/services" },
};

const SERVICES = [
  {
    icon: Truck,
    title: "Distribuição e última milha",
    id: "distribuicao",
    description:
      "Entrega ao destinatário com planeamento de rotas por paragens, confirmação de recolha e prova de entrega digital.",
    features: [
      "Atribuição de motorista e veículo com validação de capacidade",
      "Sequenciação de paragens com prioridade",
      "Prova de entrega com fotografia, assinatura simples e recetor identificado",
      "Registo de tentativa falhada com motivo",
    ],
    note: "Assinatura recolhida no ecrã não é assinatura eletrónica qualificada.",
  },
  {
    icon: Boxes,
    title: "Carga fracionada e frete",
    id: "frete",
    description:
      "Consolidação de carga entre hubs e transporte dedicado para volumes industriais, com controlo de peso e volume.",
    features: [
      "Verificação de capacidade do veículo antes do despacho",
      "Histórico de eventos entre recolha e entrega",
      "Documentos de transporte associados à encomenda",
      "Estimativa de distância calculada por motor de rotas",
    ],
    note: "O cálculo de rotas depende de um fornecedor configurado; sem ele, a distância é apresentada como estimativa.",
  },
  {
    icon: Warehouse,
    title: "Armazenagem e preparação",
    id: "armazenagem",
    description:
      "Receção, armazenagem por zonas, preparação de encomendas e expedição com movimentos de inventário auditáveis.",
    features: [
      "Zonas de receção, expedição, armazenagem, picking e devoluções",
      "Movimentos de inventário transacionais com prevenção de stock negativo",
      "Ocupação registada e ajustada com justificação auditada",
      "Centro logístico representado em 3D a partir das zonas reais",
    ],
    note: "A representação 3D é esquemática e não substitui a planta certificada das instalações.",
  },
  {
    icon: Container,
    title: "Operações internacionais",
    id: "internacional",
    description:
      "Preparação para operações entre Portugal e outros mercados, incluindo Moçambique, sujeitas a validação operacional e legal.",
    features: [
      "Modelo de dados multiempresa e multimoeda",
      "Campos documentais para processos aduaneiros",
      "Registo de referências externas por fornecedor",
      "Faturação em moeda configurável por organização",
    ],
    note: "Não existe operação internacional ativa até validação aduaneira, fiscal e logística da empresa.",
  },
  {
    icon: Snowflake,
    title: "Cadeia de frio",
    id: "cadeia-frio",
    description: "Preparação de zonas dedicadas com capacidade própria e leitura de temperatura registada por equipamento.",
    features: ["Zona dedicada no modelo de armazém", "Capacidade e ocupação registadas", "Documentação associada ao envio"],
    note: "Serviço em avaliação: requer equipamento certificado e procedimentos validados antes de comercialização.",
  },
  {
    icon: ClipboardList,
    title: "Serviços complementares",
    id: "complementares",
    description: "Consolidação de informação operacional em relatórios e indicadores com definição documentada.",
    features: ["Relatórios de encomendas, rotas e faturação", "Exportação autorizada por função", "Registo de auditoria de ações sensíveis"],
    note: "Indicadores são apresentados com definição, período e origem dos dados.",
  },
];

export default function ServicesPage() {
  return (
    <div className="container-page py-14 lg:py-20">
      <div className="max-w-3xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">Serviços</p>
        <h1 className="mt-3 font-display text-4xl leading-tight tracking-tight sm:text-5xl">
          Operações desenhadas para serem verificáveis
        </h1>
        <p className="mt-5 text-sm leading-relaxed text-muted">
          Cada serviço tem regras de estado, validações e registos próprios. O que ainda não está validado é assinalado
          como tal — não apresentamos capacidades que a operação ainda não tenha confirmado.
        </p>
      </div>

      <div className="mt-12 grid gap-4 lg:grid-cols-2">
        {SERVICES.map((service) => {
          const Icon = service.icon;
          return (
            <section key={service.title} id={service.id} className="scroll-mt-24 rounded-2xl border border-line/70 bg-surface/50 p-6">
              <div className="flex items-start justify-between gap-4">
                <span className="grid h-11 w-11 place-items-center rounded-xl border border-line/80 bg-bg/60 text-accent">
                  <Icon className="h-5 w-5" />
                </span>
              </div>
              <h2 className="mt-5 text-lg font-semibold tracking-tight">{service.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">{service.description}</p>
              <ul className="mt-4 space-y-2">
                {service.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-xs text-ink/80">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
                    {feature}
                  </li>
                ))}
              </ul>
              <p className="mt-4 rounded-lg border border-line/60 bg-bg/50 px-3 py-2 text-[10px] leading-relaxed text-muted">
                {service.note}
              </p>
            </section>
          );
        })}
      </div>

      <Panel className="mt-10 flex flex-col items-start justify-between gap-4 p-6 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-base font-semibold">Precisa de confirmar viabilidade?</h2>
          <p className="mt-1 text-xs text-muted">
            Indique origem, destino e características da carga. Respondemos com uma estimativa e as premissas aplicadas.
          </p>
        </div>
        <div className="flex gap-2">
          <ButtonLink href="/request-quote">
            Pedir orçamento <ArrowRight className="h-4 w-4" />
          </ButtonLink>
          <ButtonLink href="/contact" variant="secondary">
            Contactar
          </ButtonLink>
        </div>
      </Panel>
    </div>
  );
}

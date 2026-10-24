import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Termos de utilização",
  description: "Condições de utilização do website e da plataforma VELTRIX.",
  alternates: { canonical: "/terms" },
};

const SECTIONS = [
  {
    title: "1. Âmbito",
    body: "Estes termos regem a utilização do website institucional e da plataforma VELTRIX. A utilização da plataforma por colaboradores e clientes está sujeita a condições contratuais específicas, que prevalecem em caso de conflito.",
  },
  {
    title: "2. Contas e acessos",
    body: "As contas são criadas por administradores da organização. É proibido partilhar credenciais, tentar contornar permissões ou aceder a dados de outra organização. O acesso pode ser revogado a qualquer momento, incluindo o encerramento imediato de sessões ativas.",
  },
  {
    title: "3. Informação apresentada",
    body: "Valores de orçamento são estimativas geradas por tabela tarifária configurável e não constituem proposta vinculativa. Estimativas de entrega dependem de condições operacionais. Indicadores são acompanhados da definição, período e origem dos dados.",
  },
  {
    title: "4. Rastreio público",
    body: "A consulta de rastreio é pública mediante código, mas limitada a informação não pessoal. A utilização automatizada, sistemática ou abusiva dos endpoints públicos é proibida e pode resultar em limitação técnica de acesso.",
  },
  {
    title: "5. Serviços de terceiros",
    body: "Algumas funcionalidades dependem de fornecedores externos (mapas, rotas, email, pagamentos). Quando um fornecedor não está configurado, a funcionalidade é apresentada como indisponível em vez de simulada.",
  },
  {
    title: "6. Responsabilidade",
    body: "A plataforma é fornecida no estado em que se encontra durante a fase de preparação. A VELTRIX não responde por danos resultantes de utilização indevida, de credenciais comprometidas por culpa do utilizador ou de indisponibilidade de serviços de terceiros.",
  },
  {
    title: "7. Alterações",
    body: "Estes termos podem ser atualizados. Alterações materiais são comunicadas na plataforma antes de produzirem efeitos.",
  },
];

export default function TermsPage() {
  return (
    <div className="container-page max-w-3xl py-14 lg:py-20">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">Legal</p>
      <h1 className="mt-3 font-display text-4xl tracking-tight">Termos de utilização</h1>
      <p className="mt-4 text-sm leading-relaxed text-muted">Versão de trabalho — sujeita a validação jurídica antes do lançamento.</p>
      <div className="mt-8 space-y-6">
        {SECTIONS.map((section) => (
          <section key={section.title}>
            <h2 className="text-base font-semibold text-ink">{section.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{section.body}</p>
          </section>
        ))}
      </div>
    </div>
  );
}

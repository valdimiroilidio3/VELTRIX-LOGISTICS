import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacidade e proteção de dados",
  description: "Informação sobre finalidades, fundamentos, prazos de conservação e direitos dos titulares de dados na plataforma VELTRIX.",
  alternates: { canonical: "/privacy" },
};

const SECTIONS = [
  {
    title: "1. Responsável pelo tratamento",
    body: [
      "A entidade responsável pelo tratamento é a VELTRIX, cuja denominação social, NIF e contactos oficiais serão publicados após validação. Até essa validação, os dados recolhidos são tratados no âmbito da preparação da operação e não são utilizados para marketing.",
    ],
  },
  {
    title: "2. Finalidades e fundamentos",
    body: [
      "Pedidos de orçamento e contacto: responder à solicitação — fundamento de diligências pré-contratuais a pedido do titular.",
      "Execução de encomendas: recolha, transporte, entrega e prova de entrega — fundamento de execução contratual.",
      "Faturação e obrigações legais: conservação de registos fiscais — fundamento de obrigação legal.",
      "Segurança e auditoria: registo de acessos e ações sensíveis para prevenção de abuso e defesa de direitos — fundamento de interesse legítimo.",
    ],
  },
  {
    title: "3. Dados recolhidos",
    body: [
      "Dados de contacto (nome, email, telefone), dados de expedição (origem, destino, descrição e características da carga), dados de faturação e dados operacionais de entrega.",
      "Localização: registada apenas quando necessária para a entrega e mediante autorização do dispositivo do motorista. Não existe recolha contínua de localização.",
      "Não são armazenados dados de cartão bancário nem palavras-passe em texto simples.",
    ],
  },
  {
    title: "4. Conservação",
    body: [
      "Orçamentos não aceites: até 24 meses. Documentos de encomenda e prova de entrega: até 10 anos, por exigência de defesa de direitos e obrigações fiscais. Registos técnicos de segurança: até 12 meses.",
      "Os prazos finais serão confirmados com aconselhamento jurídico antes do lançamento comercial.",
    ],
  },
  {
    title: "5. Destinatários e subcontratantes",
    body: [
      "Fornecedores de alojamento (Vercel), base de dados e armazenamento (Supabase), email transacional (Resend), mapas e rotas (fornecedor configurado) e pagamentos (se ativado). Cada integração é ativada apenas quando existe contrato e base legal aplicável.",
      "Não existem transferências para países terceiros sem salvaguardas adequadas. A lista definitiva de subcontratantes será publicada antes do lançamento.",
    ],
  },
  {
    title: "6. Direitos dos titulares",
    body: [
      "Acesso, retificação, apagamento, limitação, portabilidade e oposição. Pedidos podem ser submetidos através do formulário de contacto, com o assunto «Privacidade e dados pessoais»; são registados na plataforma e respondidos no prazo legal.",
      "O titular pode apresentar reclamação à autoridade de controlo competente (CNPD em Portugal).",
    ],
  },
  {
    title: "7. Segurança",
    body: [
      "Acesso por função verificado no servidor, isolamento entre organizações, palavras-passe com scrypt, sessões assinadas com expiração, ligações assinadas de curta duração para documentos privados e registo de auditoria de ações sensíveis.",
    ],
  },
  {
    title: "8. Cookies",
    body: [
      "Apenas cookies essenciais: cookie de sessão (httpOnly, sameSite=lax) e preferência local de leitura do aviso de cookies. Não são utilizados cookies de publicidade, redes sociais ou analítica comportamental.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <div className="container-page max-w-3xl py-14 lg:py-20">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">Legal</p>
      <h1 className="mt-3 font-display text-4xl tracking-tight">Privacidade e proteção de dados</h1>
      <p className="mt-4 text-sm leading-relaxed text-muted">
        Documento de trabalho alinhado com os princípios do RGPD. Não substitui validação jurídica antes do lançamento
        comercial.
      </p>
      <div className="mt-8 space-y-7">
        {SECTIONS.map((section) => (
          <section key={section.title}>
            <h2 className="text-base font-semibold text-ink">{section.title}</h2>
            <div className="mt-2 space-y-2">
              {section.body.map((paragraph) => (
                <p key={paragraph} className="text-sm leading-relaxed text-muted">
                  {paragraph}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>
      <p className="mt-10 rounded-xl border border-line/70 bg-surface/50 p-4 text-[11px] leading-relaxed text-muted">
        Última atualização: documento em revisão. Alterações materiais serão comunicadas aos titulares afetados.
      </p>
    </div>
  );
}

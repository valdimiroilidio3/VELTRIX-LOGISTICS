import { env } from "@/lib/env";

/**
 * Integration registry. Status is computed from the *actual* environment at
 * request time — an integration is never reported as operational without
 * credentials, and the UI shows exactly which variable is missing.
 */

export type IntegrationStatus = "not_configured" | "configured" | "operational" | "error";

export interface IntegrationDescriptor {
  key: string;
  name: string;
  category: "platform" | "maps" | "communication" | "payments" | "observability" | "storage";
  purpose: string;
  requiredEnv: string[];
  optional: boolean;
  docsUrl: string;
  monthlyCostNote: string;
  status: IntegrationStatus;
  missingEnv: string[];
  notes?: string;
}

function statusFor(required: string[], flag: boolean): IntegrationStatus {
  if (!flag) return "not_configured";
  const missing = required.filter((name) => !process.env[name]);
  return missing.length === 0 ? "configured" : "not_configured";
}

function missingFor(required: string[]): string[] {
  return required.filter((name) => !process.env[name]);
}

export function integrationCatalog(): IntegrationDescriptor[] {
  const descriptors: Omit<IntegrationDescriptor, "status" | "missingEnv">[] = [
    {
      key: "database",
      name: env.databaseUrl ? "PostgreSQL (Supabase)" : "SQLite local (modo demonstração)",
      category: "platform",
      purpose: "Persistência de todos os módulos operacionais",
      requiredEnv: ["DATABASE_URL"],
      optional: false,
      docsUrl: "https://supabase.com/docs",
      monthlyCostNote: "Plano gratuito do Supabase serve para protótipo; produção requer plano pago com backups.",
    },
    {
      key: "supabase_auth",
      name: "Supabase Auth",
      category: "platform",
      purpose: "Autenticação gerida e recuperação de palavra-passe por email",
      requiredEnv: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
      optional: true,
      docsUrl: "https://supabase.com/docs/guides/auth",
      monthlyCostNote: "Incluído no plano Supabase.",
      notes: "Nesta versão a autenticação é implementada com sessões assinadas próprias. O adaptador Supabase Auth está previsto em docs/INTEGRACOES.md.",
    },
    {
      key: "maplibre_tiles",
      name: "MapLibre + fornecedor de tiles",
      category: "maps",
      purpose: "Mapas de rotas e localizações",
      requiredEnv: ["NEXT_PUBLIC_MAP_STYLE_URL"],
      optional: true,
      docsUrl: "https://maplibre.org/maplibre-style-spec/",
      monthlyCostNote: "MapTiler/Stadia/Protomaps têm planos gratuitos com limites; verificar termos comerciais.",
      notes: "Sem estilo configurado, o módulo de rotas mostra uma vista de coordenadas sem mapa base.",
    },
    {
      key: "routing",
      name: env.routing.provider ? `Motor de rotas (${env.routing.provider})` : "Motor de rotas",
      category: "maps",
      purpose: "Distâncias e durações reais entre paragens",
      requiredEnv: env.routing.provider === "osrm" ? ["ROUTING_PROVIDER", "ROUTING_BASE_URL"] : ["ROUTING_PROVIDER", "MAP_ROUTING_API_KEY"],
      optional: true,
      docsUrl: "https://project-osrm.org/docs/v5.24.0/api/",
      monthlyCostNote: "OSRM auto-alojado sem custo por pedido; openrouteservice/GraphHopper têm quotas gratuitas limitadas.",
      notes: "Sem motor configurado a otimização é recusada e a distância é assinalada como estimativa em linha reta.",
    },
    {
      key: "resend",
      name: "Resend (email transacional)",
      category: "communication",
      purpose: "Notificações de encomenda, entrega e faturação",
      requiredEnv: ["RESEND_API_KEY", "EMAIL_FROM"],
      optional: true,
      docsUrl: "https://resend.com/docs",
      monthlyCostNote: "Plano gratuito: 3.000 emails/mês com limites de taxa.",
    },
    {
      key: "whatsapp",
      name: "WhatsApp Business Cloud API",
      category: "communication",
      purpose: "Notificações operacionais por WhatsApp",
      requiredEnv: ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"],
      optional: true,
      docsUrl: "https://developers.facebook.com/docs/whatsapp/cloud-api",
      monthlyCostNote: "Cobrança por conversa; requer verificação de empresa e modelos aprovados.",
      notes: "Requer aprovação da Meta e modelos pré-aprovados. Sem isso, os jobs ficam em fila como não entregues.",
    },
    {
      key: "payments",
      name: env.payments.provider ? `Pagamentos (${env.payments.provider})` : "Pagamentos online",
      category: "payments",
      purpose: "Liquidação de faturas e reconciliação",
      requiredEnv: ["PAYMENT_PROVIDER", "PAYMENT_SECRET_KEY", "PAYMENT_WEBHOOK_SECRET"],
      optional: true,
      docsUrl: "https://docs.stripe.com/webhooks/signature",
      monthlyCostNote: "Comissão por transação; Stripe não disponível em todos os países de operação.",
      notes: "Webhook verifica assinatura e é idempotente. Sem credenciais, os pagamentos são registados manualmente pelo financeiro.",
    },
    {
      key: "sentry",
      name: "Sentry",
      category: "observability",
      purpose: "Monitorização de erros em produção",
      requiredEnv: ["SENTRY_DSN"],
      optional: true,
      docsUrl: "https://docs.sentry.io/platforms/javascript/guides/nextjs/",
      monthlyCostNote: "Plano gratuito limitado por eventos.",
    },
    {
      key: "storage",
      name: "Armazenamento privado",
      category: "storage",
      purpose: "Provas de entrega e documentos",
      requiredEnv: [],
      optional: false,
      docsUrl: "https://supabase.com/docs/guides/storage",
      monthlyCostNote: "Incluído no Supabase; produção deve usar Storage com políticas privadas.",
      notes: `Nesta instância: ${env.uploadDir} (sistema de ficheiros local, acesso apenas por URL assinado).`,
    },
  ];

  return descriptors.map((descriptor) => {
    const missingEnv = missingFor(descriptor.requiredEnv);
    let status: IntegrationStatus = missingEnv.length === 0 ? "configured" : "not_configured";
    if (descriptor.key === "database") {
      status = env.databaseUrl ? "operational" : "configured";
    }
    if (descriptor.key === "storage") status = "operational";
    if (descriptor.key === "supabase_auth") status = statusFor(descriptor.requiredEnv, true);
    return { ...descriptor, status, missingEnv };
  });
}

export const integrationSummary = () => {
  const list = integrationCatalog();
  return {
    operational: list.filter((i) => i.status === "operational").length,
    configured: list.filter((i) => i.status === "configured").length,
    notConfigured: list.filter((i) => i.status === "not_configured").length,
    items: list,
  };
};

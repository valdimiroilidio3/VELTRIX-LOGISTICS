# Integrações — o que está ativo e o que falta

O catálogo é calculado em tempo de execução a partir das variáveis de ambiente
(`src/lib/integrations/providers.ts`) e apresentado em `/app/integrations`. **Nenhuma integração é
apresentada como operacional sem credenciais**, e as respostas nunca são simuladas.

Estados: `operational` (a funcionar) · `configured` (credenciais presentes, ainda não exercitada) ·
`not_configured` (sem credenciais, diz explicitamente qual falta) · `error` (falhou na última
verificação).

## Estado nesta entrega

| Integração | Estado | Variáveis | Comportamento sem credenciais |
| --- | --- | --- | --- |
| Base de dados | `configured` (SQLite local) | `DATABASE_URL` | Usa SQLite de desenvolvimento; produção exige PostgreSQL |
| Armazenamento de ficheiros | `operational` | `STORAGE_DIR` (opcional) | Ficheiros locais, servidos só por URL assinado de 5 min |
| Supabase Auth | `not_configured` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Autenticação própria por sessão assinada (funcional) |
| Email transacional (Resend) | `not_configured` | `RESEND_API_KEY`, `EMAIL_FROM` | Jobs ficam em `notification_jobs` com erro explícito; nenhum email é "enviado" |
| Motor de rotas (OSRM / ORS / GraphHopper) | `not_configured` | `ROUTING_PROVIDER`, `ROUTING_BASE_URL`/`MAP_ROUTING_API_KEY` | Distância calculada como **estimativa** (linha reta × 1,28) e rotulada como tal |
| Mapas (MapLibre + tiles) | `not_configured` | `NEXT_PUBLIC_MAP_STYLE_URL`, `NEXT_PUBLIC_MAP_ATTRIBUTION` | Vista de coordenadas em SVG, sem mapa base |
| Geocoding | `not_configured` | `GEOCODING_API_KEY` | Coordenadas introduzidas manualmente; moradas não são validadas automaticamente |
| Pagamentos (Stripe/webhook) | `not_configured` | `PAYMENT_PROVIDER`, `PAYMENT_SECRET_KEY`, `PAYMENT_WEBHOOK_SECRET` | Pagamentos registados manualmente pelo financeiro; webhook responde 503 |
| WhatsApp Business | `not_configured` | `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | Jobs de WhatsApp ficam `failed` com motivo «canal sem fornecedor» |
| Sentry | `not_configured` | `SENTRY_DSN` | Logs estruturados em stdout (com redacção de segredos) |
| Cron de notificações | `configured` | `AUTH_SECRET` | Endpoint protegido por HMAC; sem segredo responde 503 |

## Ativação de cada integração

### Email (Resend)
1. Criar conta e verificar domínio de envio.
2. Definir `RESEND_API_KEY` e `EMAIL_FROM`.
3. Chamar `GET /api/v1/cron/notifications` com o HMAC ou usar o botão «Processar fila» em
   `/app/integrations`. Os jobs pendentes passam a `sent` com `providerId`.

### Motor de rotas
- **OSRM**: definir `ROUTING_PROVIDER=osrm` e `ROUTING_BASE_URL` (auto-alojado recomendado; o servidor
  de demonstração público não tem SLA e é sinalizado como `demoEndpoint`).
- **openrouteservice / GraphHopper**: `ROUTING_PROVIDER` + `MAP_ROUTING_API_KEY`.
- Após configurar, `/app/routes/[id]` deixa de mostrar o aviso de estimativa e grava
  `planned_distance_km`/`planned_duration_min` reais.

### Pagamentos
- Webhook `POST /api/v1/webhooks/payments` valida `PAYMENT_WEBHOOK_SECRET` (HMAC sobre o corpo cru).
- Idempotência por `(provider, provider_reference)`; repetições não duplicam pagamentos.
- Enquanto não houver provider, `registerPayment(..., provider: "manual")` regista a liquidação com
  referência e auditoria — sem alegar cobrança automática.

### Supabase (produção)
- `DATABASE_URL` (pooler, porta 6543), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` (apenas servidor).
- Aplicar `db/postgres/0001_init.sql` e `0002_rls.sql` via `npm run db:migrate`.
- Migrar autenticação para Supabase Auth é opcional: o schema já tem `profiles.auth_user_id`.

## Custos de referência (verificar antes de contratar)

| Serviço | Nota de custo |
| --- | --- |
| Vercel | Hobby para demonstração; produção com cron e domínio próprio requer Pro (~20 USD/mês) |
| Supabase | Free para protótipo; produção com backups/PITR em plano pago (~25 USD/mês) |
| Resend | 3.000 emails/mês grátis; acima disso, plano pago |
| OSRM auto-alojado | Sem custo por pedido; requer servidor (a partir de ~5 USD/mês) |
| openrouteservice / GraphHopper | Quotas gratuitas limitadas; planos pagos por pedido |
| MapTiler / Stadia (tiles) | Plano gratuito com limites; uso comercial pode exigir plano pago |
| Stripe | Comissão por transação (varia por país); não disponível em todos os mercados |
| Sentry | Plano gratuito limitado por eventos |

Estes valores são **ordens de grandeza para planeamento**, não propostas comerciais. Confirmar nos
sites dos fornecedores antes de qualquer compromisso.

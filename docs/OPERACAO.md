# Operação e deploy

## 1. Requisitos

- Node.js **20.11+** (o driver `node:sqlite` requer Node 22 para produção local; a app usa PostgreSQL
  em produção).
- PostgreSQL 15/16 (Supabase gerido recomendado).

## 2. Variáveis de ambiente

Ver [`.env.example`](../.env.example). Mínimo para produção:

| Variável | Obrigatória | Nota |
| --- | --- | --- |
| `AUTH_SECRET` | Sim | 32+ caracteres aleatórios; assina sessões e URLs de ficheiros |
| `DATABASE_URL` | Sim | Connection string PostgreSQL (pooler) |
| `PG_SSL` | Não | `disable` apenas em PostgreSQL local |
| `NEXT_PUBLIC_SITE_URL` | Sim | URL absoluta usada em emails e links |
| `JOBS_SECRET`/`AUTH_SECRET` | Sim | Protege cron e webhooks (503 sem segredo) |
| `RESEND_API_KEY`, `EMAIL_FROM` | Não | Sem eles a fila fica registada e não enviada |
| `ROUTING_PROVIDER` + chave | Não | Sem eles as distâncias são estimativas |

## 3. Deploy (Vercel + Supabase)

```bash
# 1. base de dados
export DATABASE_URL="postgres://…"
npm run db:migrate            # aplica 0001_init.sql + 0002_rls.sql (idempotente)

# 2. segredos na Vercel
vercel env add AUTH_SECRET production
vercel env add DATABASE_URL production
vercel env add NEXT_PUBLIC_SITE_URL production

# 3. deploy
vercel --prod
```

- `vercel.json` define região `fra1` (Europa), cron a cada 10 minutos para a fila de notificações e
  cabeçalhos de segurança.
- `next.config.ts` marca `pg` e `node:sqlite` como pacotes externos do servidor.
- Migrações **não** correm automaticamente no deploy: são um passo explícito e auditável.

Alternativa em qualquer host Node:

```bash
npm ci && npm run build && npm run start   # escuta em 0.0.0.0:3000
```

## 4. Cron e jobs

| Job | Endpoint | Frequência |
| --- | --- | --- |
| Drenar outbox de notificações | `GET /api/v1/cron/notifications` | 10 min |
| Marcar faturas vencidas | previsto (ver LIMITACOES) | diário |

O endpoint exige `Authorization: Bearer <HMAC-SHA256("cron:notifications", AUTH_SECRET)>` ou
`x-cron-secret`. Sem segredo configurado responde **503** (nunca finge sucesso).

## 5. Backups

```bash
pg_dump "$DATABASE_URL" --format=custom --file="veltrix-$(date +%F).dump"
pg_restore --clean --if-exists --dbname "$DATABASE_URL" veltrix-2026-01-01.dump
```

- Verificar o restore pelo menos uma vez por trimestre.
- Ficheiros de POD: snapshot do bucket privado (ou `storage/` no host) no mesmo ciclo.

## 6. Migrações seguras

1. `npm run db:migrate -- --dry-run` para listar o que seria aplicado.
2. Backup verificado.
3. Janela de manutenção; a app tolera schema aditivo (colunas novas com default).
4. Destrutivo: nunca automático; exige `--allow-destructive` e está bloqueado quando
   `NODE_ENV=production`.

## 7. Runbook (incidentes comuns)

| Sintoma | Verificação | Ação |
| --- | --- | --- |
| `/api/health` ≠ 200 | `checks.database` | Verificar `DATABASE_URL`, pooler, limites de ligações |
| Emails não saem | `/app/integrations` → job `last_error` | Configurar Resend; reprocessar fila |
| Cron devolve 503 | `AUTH_SECRET` ausente | Definir segredo e redeploy |
| Rotas com distância `—` | `routingStatus()` | Configurar motor de rotas ou aceitar estimativa |
| 403 inesperado | Função do utilizador | Ajustar função em `/app/users` (auditado) |
| 500 ao abrir página | Logs do servidor (`digest`) | Correlacionar `digest` com stack; redigido de segredos |
| Base local inconsistente | `npm run db:reset` (só SQLite) | Recria e re-semeia dados demo |

### Utilizador sem acesso à palavra-passe

1. O utilizador pode pedir recuperação em `/recuperar-password` (recebe email com ligação válida por
   60 min, de utilização única).
2. Em alternativa, um administrador com `users:manage` usa **Repor password** na página
   Utilizadores: é gerada uma temporária que aparece **uma única vez** no ecrã — copiar e partilhar
   por canal seguro. A operação revoga todas as sessões e obriga a nova password no primeiro acesso
   (`/definir-palavra-passe`).

## 8. Custos e limites operacionais

- 1 instância serverless suficiente para a carga de demonstração; rate limiting em memória passa a ser
  por instância (ver riscos).
- Cron da Vercel no plano Pro; no plano Hobby as execuções são limitadas.
- Sem CDN própria para ficheiros (armazenamento privado com URLs assinados).

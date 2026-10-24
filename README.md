# VELTRIX — Logistics & Technology

Plataforma logística full-stack: site institucional, portal operacional multi-perfil, gestão de
encomendas com máquina de estados, rotas, frota, armazém com centro logístico 3D, orçamentação,
faturação interna, notificações em fila, auditoria e observabilidade.

> **Estado atual:** aplicação funcional de ponta a ponta em modo demonstração. As integrações
> externas (email, pagamentos, mapas, geocoding, SMS/WhatsApp) estão implementadas como adaptadores
> e reportam honestamente `não configurado` enquanto não existirem credenciais. Nenhum indicador é
> inventado: cada métrica tem definição, período e fonte declarados na UI.

---

## 1. O que está construído

| Área | Estado | Onde |
| --- | --- | --- |
| Site institucional (9 páginas) | Funcional, SSR/ISR | `src/app/(site)` |
| Autenticação por sessão (cookie httpOnly) + rate limit | Funcional | `src/lib/auth` |
| RBAC: 8 funções, 34 permissões, verificação no servidor | Funcional | `src/lib/auth/rbac.ts` |
| Encomendas: criação, transições, atribuição, POD | Funcional | `src/lib/domain/shipments.ts` |
| Rotas: planeamento, sequenciação, capacidade, otimização | Funcional (distâncias marcadas como estimativa sem motor) | `src/lib/domain/routes.ts` |
| Frota e motoristas | Funcional (sem telemetria) | `src/app/app/fleet` |
| Armazém, inventário e zonas | Funcional (ocupação manual auditada) | `src/lib/domain/warehouse.ts` |
| Centro logístico 3D | Funcional, marcado como esquemático | `src/components/three` |
| Hero 3D animado (landing) | Decorativo, sem dados; respeita `prefers-reduced-motion` | `src/components/three/hero-*` |
| Orçamentos com tabela de preços em BD | Funcional (valores provisórios) | `src/lib/domain/pricing.ts` |
| Faturação interna + pagamentos manuais | Funcional, **não certificado fiscalmente** | `src/lib/domain/commercial.ts` |
| Fila de notificações (outbox) | Funcional; envio real só com Resend | `src/lib/notifications.ts` |
| Auditoria de ações sensíveis | Funcional | `src/lib/audit.ts` |
| API REST `/api/v1` | Funcional, 23 ficheiros de rota | `src/app/api/v1` |
| Migrações PostgreSQL + RLS | Prontas, **não aplicadas** (sem base de dados no ambiente) | `db/postgres` |
| Testes automatizados | 39 testes (4 ficheiros) | `tests` |

## 2. Stack

- **Next.js 15.5** (App Router, Server Components, Server Actions), **React 19**, **TypeScript strict**
- **Tailwind CSS 3.4** com paleta fixa; **Lucide** para iconografia; **Geist/Inter** (fallback local)
- **Zod** para validação (servidor e formulários) — ver nota em `docs/ARQUITETURA.md` sobre RHF
- **Recharts** (gráficos), **Three.js + React Three Fiber + drei** (centro 3D), **MapLibre GL** (mapas, quando há estilo configurado)
- **PostgreSQL/Supabase** em produção; **SQLite (`node:sqlite`)** em desenvolvimento local
- **Vitest** para testes; **ESLint 9**; **GitHub Actions** para CI

## 3. Executar localmente

```bash
npm install
cp .env.example .env.local     # preencher AUTH_SECRET (obrigatório em produção)
npm run db:seed                # cria e popula a base demo (.data/veltrix.db)
npm run dev                    # http://localhost:3000
```

Contas demo (palavra-passe `Veltrix!2026`, alterável por `DEMO_PASSWORD`):

| Email | Função |
| --- | --- |
| `super@veltrix.example` | Super administrador |
| `admin@veltrix.example` | Administrador |
| `ops@veltrix.example` | Gestor de operações |
| `dispatch@veltrix.example` | Despachante |
| `warehouse@veltrix.example` | Operador de armazém |
| `driver@veltrix.example` / `driver2@veltrix.example` | Motorista |
| `finance@veltrix.example` | Financeiro |
| `cliente@nordvolt.example`, `cliente@grupopt.example` | Cliente (portal) |

## 4. Scripts

| Comando | Efeito |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento em `0.0.0.0:3000` |
| `npm run build` / `npm start` | Build e execução de produção |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run lint` | ESLint |
| `npm test` | Vitest (unitários + integração sobre SQLite temporário) |
| `npm run db:seed` | Popula a base demo |
| `npm run db:reset` | Apaga e recria a base SQLite (recusa-se se `DATABASE_URL` existir) |
| `npm run db:migrate` | Aplica `db/postgres/*.sql` com registo em `schema_migrations` |
| `node scripts/smoke.mjs <url> <token>` | Verificação end-to-end contra um servidor a correr |

## 5. Estrutura

```
src/
  app/
    (site)/            site institucional
    (auth)/login/      autenticação
    app/               plataforma (19 páginas + server actions)
    api/health         healthcheck
    api/v1             API REST
  components/
    ui/                sistema de componentes (Button, Panel, Badge, StatCard…)
    site/              header, footer, formulários públicos
    app/               shell, tabelas, painéis, gráficos, mapas
    three/             cena 3D do armazém
  lib/
    auth/              sessão, RBAC, password (scrypt), recuperação e reset de password, ações
    db/                abstracção de BD (SQLite/PostgreSQL), schema, seed
    domain/            regras de negócio testáveis (encomendas, rotas, preços…)
    integrations/      adaptadores externos (email, providers)
    routing/           estimativas geométricas e motor de rotas
    api/               envelope de resposta, paginação, guardas
db/postgres/           migrações versionadas + RLS
tests/                 Vitest
docs/                  documentação de arquitetura, API, dados, segurança, operação
```

## 6. Documentação

- [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) — decisões, camadas, fluxo de dados
- [`docs/API.md`](docs/API.md) — endpoints, códigos de erro, exemplos
- [`docs/DADOS.md`](docs/DADOS.md) — modelo, migrações, RLS, dados demo
- [`docs/SEGURANCA.md`](docs/SEGURANCA.md) — autenticação, autorização, tenancy, POD, segredos
- [`docs/INTEGRACOES.md`](docs/INTEGRACOES.md) — o que está ativo, o que falta e porquê
- [`docs/OPERACAO.md`](docs/OPERACAO.md) — deploy, variáveis, cron, backups, runbook
- [`docs/TESTES.md`](docs/TESTES.md) — o que é testado e resultados
- [`docs/LIMITACOES.md`](docs/LIMITACOES.md) — riscos conhecidos e trabalho pendente

## 7. Limites assumidos

- **Faturação interna** não substitui software certificado (Portaria 363/2010 / SAF-T PT). A UI avisa.
- Sem motor de rotas configurado, distâncias são **estimativas** explicitamente rotuladas.
- O centro 3D é um **esquema** derivado das zonas registadas; não é um gémeo digital certificado.
- Preços semeados são **provisórios** e configuráveis em `/app/settings`.
- Nenhuma integração externa é simulada: sem credenciais, o estado é `não configurado`.

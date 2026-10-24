# Arquitetura

## 1. Visão geral

VELTRIX é um **monólito modular** Next.js 15 (App Router). Não existem microserviços, filas externas
nem bases de dados adicionais: a fila de notificações é uma tabela (`notification_jobs`) drenada por
cron, e o processamento pesado (POD, transições, faturação) corre dentro de transações SQL.

```
Browser ──► Server Components ──► camada de domínio (src/lib/domain) ──► driver de BD
   │              │                            │
   │              ├── Server Actions (formulários, mutações)
   └── fetch ────►/api/v1 (mesma camada de domínio, envelope JSON)
```

Pontos-chave:

1. **A UI não decide regras.** Preços, transições de estado, capacidade de veículo, tenancy e
   permissões vivem em `src/lib/domain` e `src/lib/auth`; as páginas apenas renderizam resultados.
2. **Uma única fonte de verdade para a máquina de estados** (`shipment-status.ts`), usada pela API,
   pelas Server Actions e pelos testes.
3. **Server Components por omissão**; componentes de cliente apenas onde há interação real
   (formulários, cena 3D, mapa, gráficos com tooltip).
4. **Abstração de base de dados** (`src/lib/db`) com dois drivers: PostgreSQL (produção/Supabase) e
   SQLite `node:sqlite` (desenvolvimento, sem serviços externos). As queries ficam num subconjunto
   portável (sem `RETURNING` obrigatório, sem funções específicas de um motor).

## 2. Camadas

| Camada | Pasta | Responsabilidade |
| --- | --- | --- |
| Apresentação | `src/app`, `src/components` | Rotas, layout, formulários, estados vazios, feedback |
| Interface HTTP | `src/app/api/v1`, `src/lib/api/http.ts` | Envelope `{data,error,meta}`, erros mapeados, paginação, `ORDER BY` em whitelist |
| Domínio | `src/lib/domain` | Regras de negócio puras e transacionais |
| Acesso a dados | `src/lib/db` | Driver, transações serializadas, schema, seed |
| Plataforma | `src/lib/auth`, `storage`, `notifications`, `audit`, `rate-limit`, `errors` | Sessões, RBAC, ficheiros, outbox, auditoria, limites, erros tipados |
| Integrações | `src/lib/integrations`, `src/lib/routing` | Adaptadores externos com estado honesto |

## 3. Decisões e justificações

| Decisão | Porquê |
| --- | --- |
| Dinheiro em **cêntimos inteiros** (`bigint`/`INTEGER`) | Evita erros de vírgula flutuante em faturação |
| Timestamps **ISO 8601 UTC** em texto/SQLite e `timestamptz` em PostgreSQL | Portabilidade e ordenação estável |
| **Outbox** para notificações | Nunca se perde um aviso por falha de fornecedor; tentativas com backoff e erro registado |
| **POD exige ficheiro e estado `out_for_delivery`** | Impede entregas "fantasma" sem prova |
| Overrides só para `admin`/`super_admin` com justificação ≥ 10 caracteres | Rastreabilidade de exceções operacionais |
| Ocupação de armazém **manual e auditada** | Não há sensores/IoT; simular leituras seria inventar dados |
| Centro 3D derivado de `warehouse_zones` | Geometria e contagem de carga correspondem ao registo real; veículos/empilhador animados são decorativos, sem telemetria |
| Rotas: heurística + estimativa geométrica quando não há motor | Honestidade: sem credenciais não há distância rodoviária real |
| SQLite em dev / PostgreSQL em prod | Desenvolvimento sem infraestrutura; produção com RLS e migrações versionadas |
| Server Actions em vez de `useMutation` | Menos superfície de API no cliente; TanStack Query instalado mas desnecessário neste desenho |

### Nota sobre React Hook Form

O stack previsto incluía RHF. Os formulários usam **Zod no servidor** (schemas partilhados em
`src/lib/validation/schemas.ts`) e validação nativa do browser no cliente. Isto evita duplicar regras
e mantém a autoridade no servidor. RHF continua disponível em `package.json` para formulários futuros
com estado complexo (ex.: editor de rotas multi-paragem). Esta é a única divergência consciente face
ao stack pedido e está registada para decisão do responsável técnico.

## 4. Fluxo de uma encomenda

1. **Criação** — `POST /api/v1/shipments` ou `/app/shipments/new`; gera código `VX` + 10 caracteres,
   cria endereços, artigos e evento `created` numa transação.
2. **Confirmação** — transições validadas por `checkTransition` (sequência, papel, POD); cada mudança
   escreve `shipment_events` e enfileira notificação.
3. **Planeamento** — rota criada a partir de encomendas `confirmed`/`scheduled`; valida capacidade de
   peso e volume antes de gravar paragens.
4. **Execução** — motorista vê as suas paragens, marca `en_route`/`arrived`, regista POD; a entrega
   só fecha com assinatura/fotografia persistida.
5. **Faturação** — fatura interna a partir do cliente + encomenda; pagamento manual ou via webhook
   assinado (Stripe quando configurado).

## 5. Observabilidade

- `/api/health` devolve estado da BD e modo de dados (sem segredos).
- Erros: `AppError` tipado com `status`/`code`; `logError` redige tokens, JWTs e pares
  `password=…`.
- Auditoria: `audit_logs` com autor, recurso, metadados e IP em hash; falha de escrita de auditoria
  nunca derruba a operação (é registada).
- UI: páginas mostram a **origem** e a **definição** dos números (ex.: «Faturação emitida» ≠ recebido).

## 6. Acessibilidade e desempenho

- Hierarquia de headings, `aria-label` em tabelas e gráficos, `aria-current` na navegação,
  foco visível, contraste sobre `#F5F8FC`/`#081522`.
- Cena 3D carregada dinamicamente (`ssr: false`), DPR limitado a 1.75, sombras suaves (1024px) só na luz principal, instancing para paletes e caixas de racking. Modelos GLB licenciados são drop-in: se existirem em `public/models/` substituem os fallbacks processuais (ver `public/models/README.md` para o estado de licenciamento) e
  racking; fallback SVG quando WebGL ou `prefers-reduced-motion` impedem a renderização.
- Gráficos e mapas têm alternativa textual (tabela/lista) — nenhum dado depende de canvas.

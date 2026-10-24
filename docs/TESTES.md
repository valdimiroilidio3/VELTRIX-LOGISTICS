# Testes

## Execução

```bash
npm test                 # Vitest, 4 ficheiros, 39 testes
npm run typecheck        # TypeScript strict (0 erros)
npm run lint             # ESLint
node scripts/smoke.mjs http://localhost:3000 <session-token>   # end-to-end sobre HTTP
```

Os testes correm sobre **SQLite temporário** (`tests/setup.ts` cria um ficheiro por execução e apaga-o
no fim), nunca sobre a base de desenvolvimento. `server-only` é substituído por um stub de teste
(`tests/noop-server-only.ts`), porque o Vitest não corre no runtime de Server Components.

## Cobertura por ficheiro

### `tests/state-machine.test.ts` (9)
- percurso feliz completo `draft → delivered`;
- recusa de saltos de estado (`confirmed → delivered`), transições para o mesmo estado;
- `delivered` sem POD bloqueado com mensagem específica;
- estados terminais (`delivered`, `cancelled`, `returned`) sem saída;
- override apenas por `admin`/`super_admin` **e** com justificação ≥ 10 caracteres;
- motorista não pode forçar `cancelled` (restrição por função).

### `tests/pricing-rbac.test.ts` (10)
- base + peso + volume em cêntimos inteiros; mínimo aplicado;
- sobretaxa de combustível antes do IVA; total = subtotal + combustível + IVA;
- distância só entra quando foi realmente calculada (e é declarado nas premissas);
- entradas negativas não geram preços negativos;
- RBAC: cliente só lê os seus recursos, motorista não altera preços/utilizadores, `finance` é a única
  função não-admin com escrita em faturação, transições permitidas por função.

### `tests/tenancy.test.ts` (9, integração)
- criação de encomenda gera código `VX…` e evento `created`;
- encomenda de outra organização devolve **404** (não 403) e não pode ser mutada;
- listagem de cliente fica limitada ao seu `customer_id`;
- transições inválidas pela camada de serviço devolvem 409;
- entrega exige POD, e o POD fica legível no detalhe;
- rastreio público não expõe email nem moradas;
- código desconhecido devolve `null` sem revelar existência;
- atribuição com veículo sem capacidade é recusada.

### `tests/platform.test.ts` (11)
- rate limit: bloqueia após o limite, isola contadores por chave;
- URLs assinadas: verificação válida, recusa de caminho alterado e de expiração;
- heurística de rotas: prioridade/peso na ordenação, paragens sem coordenadas no fim, determinismo;
- outbox: sem `RESEND_API_KEY` o job **não** é marcado como enviado, o erro é registado e há
  tentativas limitadas; deduplicação por chave;
- orçamento público calculado pela tabela configurada (com premissas) e gravado em `quotes`;
- mensagem de contacto é persistida e visível à equipa.

## Verificação end-to-end (`scripts/smoke.mjs`)

26 verificações sobre o servidor real, incluindo: healthcheck, 401 sem sessão, login inválido,
listagem/criação de encomendas, idempotência, validação 422, sequência de estados, bloqueio de entrega
sem POD, registo de POD, rastreio público sem PII, 404 para código inexistente, criação e otimização de
rota, orçamento público, fatura + pagamento manual, zonas de armazém, métricas com definições,
exportação CSV, cron/webhook sem segredo (401/503) e 404 para recurso inexistente.

Resultado da última execução completa: **26/26**.

## Verificação de páginas e permissões

Todas as 19 páginas da plataforma foram pedidas com sessão de `admin` → **200**. Com sessões de
`driver`, `customer`, `finance` e `warehouse_operator`, as áreas fora do âmbito devolvem **403**
(página `forbidden.tsx`), nunca 500. O portal de cliente vê apenas as suas encomendas e faturas.

## O que **não** está testado automaticamente

- Interação real de browser (não há Chromium no ambiente de build): formulários, cena 3D e mapa foram
  validados por renderização SSR e revisão de código.
- Migrações contra PostgreSQL real (existe job de CI, não executado neste ambiente).
- Carga, acessibilidade com leitor de ecrã e testes cross-browser.

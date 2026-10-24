# Dados, schema e migrações

## 1. Modelo (28 tabelas)

| Domínio | Tabelas |
| --- | --- |
| Tenancy e identidade | `organizations`, `profiles`, `sessions`, `idempotency_keys` |
| CRM | `customers`, `addresses`, `contact_messages` |
| Operação | `shipments`, `shipment_items`, `shipment_events`, `documents`, `proof_of_delivery` |
| Frota | `vehicles`, `drivers`, `routes`, `route_stops` |
| Armazém | `warehouses`, `warehouse_zones`, `inventory_items`, `inventory_movements` |
| Comercial | `quotes`, `invoices`, `payments`, `pricing_rules` |
| Plataforma | `notification_jobs`, `audit_logs`, `integration_settings` |

Convenções:

- Chaves primárias `uuid` (geradas na aplicação; `gen_random_uuid()` como fallback em PostgreSQL).
- Dinheiro em **cêntimos inteiros**; percentagens com 2 casas (`numeric(5,2)`).
- Timestamps em UTC (`timestamptz` em PostgreSQL, ISO-8601 em SQLite).
- `organization_id` em todas as tabelas de negócio — base do isolamento multiempresa.
- Enums aplicados por `CHECK` (portável entre motores) em vez de tipos `ENUM`.

## 2. Regras impostas na base de dados (PostgreSQL)

| Regra | Implementação |
| --- | --- |
| Capacidade de zona nunca excedida | `CHECK (occupied_pallets <= capacity_pallets)` |
| Entrega exige POD | trigger `trg_shipment_delivery_guard` em `shipments` |
| POD inválido em encomenda terminal | trigger `trg_pod_guard` em `proof_of_delivery` |
| Código de rastreio normalizado | `CHECK (tracking_code ~ '^VX[A-Z0-9]{6,20}$')` |
| `updated_at` automático | trigger `set_updated_at` em 13 tabelas |
| Fatura única por organização | `UNIQUE (organization_id, invoice_number)` |
| Pagamento idempotente | `UNIQUE (provider, provider_reference)` |

As mesmas regras estão na camada de domínio (testadas em `tests/tenancy.test.ts`), pelo que valem
também em SQLite.

## 3. Migrações

```
db/postgres/0001_init.sql   schema completo, índices, triggers, constraints
db/postgres/0002_rls.sql    Row Level Security e políticas por função
```

`npm run db:migrate`:

1. Lê os ficheiros por ordem lexical.
2. Regista `filename` + **checksum SHA-256** em `schema_migrations`.
3. Recusa aplicar um ficheiro já aplicado cujo conteúdo mudou (obriga a nova migração).
4. Corre cada ficheiro numa transação (rollback do ficheiro em caso de erro).
5. **Recusa** `DROP TABLE`, `TRUNCATE`, `DROP SCHEMA` e `DELETE FROM` sem `--allow-destructive`, e
   nunca os permite quando `NODE_ENV=production`/`VERCEL_ENV=production`.

Ainda **não foram aplicadas** a nenhuma base real: não existe PostgreSQL nem credenciais Supabase
neste ambiente. Foram validadas por revisão e estão cobertas por um job de CI que sobe PostgreSQL 16,
aplica as migrações duas vezes (idempotência) — ver `.github/workflows/ci.yml`.

## 4. RLS (Supabase)

`0002_rls.sql` ativa e **força** RLS em 26 tabelas. Funções auxiliares: `current_profile_id()`,
`current_organization_id()`, `current_role_name()`, `current_customer_id()`, `is_staff()`, `is_admin()`.

- **Staff**: vê apenas `organization_id = current_organization_id()`.
- **Cliente**: `shipments` só com `customer_id = current_customer_id()`; sem escrita.
- **Motorista**: `shipments` apenas os que estão em paragens atribuídas ao seu perfil;
  `route_stops` idem.
- **Auditoria**: leitura apenas para `admin`/`super_admin`.
- **Sessões**: sem política de cliente (acesso exclusivo do servidor).

O servidor Next liga-se com role privilegiada e aplica tenancy na camada de serviço — a RLS protege
qualquer acesso direto (consola SQL, BI, cliente Supabase). A duplicação é intencional (defesa em
profundidade) e está testada: `tests/tenancy.test.ts` prova 404 entre organizações e entre clientes.

## 5. Dados de demonstração

- `organizations.data_mode = 'demo'` e `DemoTag` na UI em todas as áreas.
- Seed determinístico (`src/lib/db/seed.ts`): 1 organização, 10 perfis (8 funções), 7 clientes,
  14 encomendas com histórico coerente (11→12 out 2026), 4 rotas, 4 veículos, 2 motoristas,
  1 armazém com 6 zonas, inventário, 4 orçamentos, 3 faturas, integrações com estados distintos.
- Códigos reais no seed: `VX20260001SH`, `VX20260002TI`, `VX20260003UJ`, `VX20260004VK`.
- Preços em `pricing_rules` são **provisórios** e editáveis em `/app/settings`.

### Separação demo ↔ produção

`npm run db:reset` só funciona em SQLite e recusa-se se `DATABASE_URL` estiver definido. Em produção
a limpeza de dados demo é uma migração dedicada com backup prévio; a UI obriga a escrever `PRODUCAO`
para ativar o modo operacional e a ação fica auditada com a contagem de registos existentes.

## 6. Backups e retenção (recomendado)

- PostgreSQL gerido (Supabase): PITR diário + snapshot semanal, retenção 30 dias.
- Exportação lógica semanal (`pg_dump --format=custom`) para storage externo.
- Ficheiros do POD: storage privado versionado; retenção sugerida 5 anos (obrigações fiscais/
  contratuais a confirmar juridicamente).
- Antes de qualquer migração destrutiva: backup verificado + janela de manutenção + confirmação escrita
  do responsável.

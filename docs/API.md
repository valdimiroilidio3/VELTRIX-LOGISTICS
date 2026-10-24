# API REST

Base: `/api/v1`. Respostas em JSON com envelope:

```json
{ "data": { }, "meta": { "total": 42, "page": 1, "pageSize": 20, "totalPages": 3 } }
```

Erros:

```json
{ "error": { "code": "conflict", "message": "É necessário registar a prova de entrega…", "details": { } } }
```

Códigos: `unauthorized` (401), `forbidden` (403), `not_found` (404), `conflict` (409),
`validation_error` (422), `rate_limited` (429), `service_unavailable` (503), `internal_error` (500).

Autenticação por cookie de sessão `veltrix_session` (httpOnly, SameSite=Lax, 12 h). Login programático
em `POST /api/v1/auth/login` define o cookie; o token nunca é devolvido no corpo.

## Endpoints

| Método | Caminho | Permissão | Notas |
| --- | --- | --- | --- |
| GET | `/api/health` | pública | Estado da BD e do modo de dados |
| POST | `/api/v1/auth/login` | pública (rate limit 8/15 min por email+IP) | Define cookie de sessão. A resposta inclui `mustChangePassword: true` quando há reset administrativo pendente — o cliente deve encaminhar para `/definir-palavra-passe` |
| POST | `/api/v1/auth/logout` | sessão | Invalida a sessão na BD |
| GET | `/api/v1/me` | `shipments:read` | Identidade, permissões, organização |
| GET | `/api/v1/shipments` | `shipments:read` | `page`, `pageSize`, `status`, `q`, `priority`, `customerId`, `driverId`, `sort` |
| POST | `/api/v1/shipments` | `shipments:create` | Aceita `idempotencyKey` |
| GET | `/api/v1/shipments/{id}` | `shipments:read` | Inclui eventos, POD e documentos |
| GET | `/api/v1/shipments/{id}/events` | `shipments:read` | Histórico cronológico |
| POST | `/api/v1/shipments/{id}/events` | `shipments:update` | Evento manual contextual |
| POST | `/api/v1/shipments/{id}/transitions` | `shipments:transition` | `toStatus`, `override`+`justification` |
| POST | `/api/v1/shipments/{id}/assign` | `shipments:assign` | `driverId`, `vehicleId`; valida capacidade |
| POST | `/api/v1/shipments/{id}/proof-of-delivery` | `pod:submit` | `receivedBy` + assinatura/fotos (data URLs) |
| GET | `/api/v1/tracking/{code}` | pública (30/min por IP, 10/min por código) | Payload mínimo, sem PII |
| POST | `/api/v1/tracking/{code}` | pública | Alternativa para códigos longos |
| GET/POST | `/api/v1/customers` | `customers:read` / `customers:write` | `q` pesquisa |
| GET/POST | `/api/v1/routes` | `routes:read` / `routes:write` | Criação com validação de capacidade |
| POST | `/api/v1/routes/{id}/optimize` | `routes:optimize` | Devolve `estimated: true` sem motor |
| POST | `/api/v1/routes/{id}/status` | `routes:write` | Estados de rota |
| POST | `/api/v1/quotes` | pública (5/10 min por IP) | Calcula preço com a tabela ativa |
| POST | `/api/v1/quotes/{id}/status` | `quotes:write` | `draft|sent|accepted|rejected|expired` |
| GET/POST | `/api/v1/invoices` | `invoices:read` / `invoices:write` | Numeração `FT-AAAA-NNNN` |
| POST | `/api/v1/payments` | `payments:write` | Manual ou referência de fornecedor |
| GET | `/api/v1/warehouse/zones` | `warehouse:read` | `meta.occupancySource = "manual"` |
| POST | `/api/v1/warehouse/zones/{id}/occupancy` | `warehouse:write` | Ocupação + motivo obrigatório |
| POST | `/api/v1/warehouse/movements` | `inventory:write` | Receção, putaway, transferência, pick, dispatch, ajuste |
| GET | `/api/v1/drivers/me/tasks` | `tasks:read_own` | Paragens atribuídas ao motorista |
| PATCH | `/api/v1/drivers/me/stops/{id}` | `tasks:read_own` | `en_route`, `arrived`, `completed`, `failed` |
| GET | `/api/v1/analytics/overview` | `analytics:read` | Métricas + definições + série diária |
| POST | `/api/v1/documents/upload` | `documents:write` | Grava em armazenamento privado |
| GET | `/api/v1/documents/raw` | link assinado (5 min) | Valida HMAC + expiração |
| POST | `/api/v1/webhooks/payments` | assinatura HMAC | 503 sem `STRIPE_WEBHOOK_SECRET` |
| GET | `/api/v1/cron/notifications` | HMAC (`AUTH_SECRET`) | Drena a outbox; 503 sem segredo |
| GET | `/app/shipments/export?format=csv` | `shipments:read` | CSV auditado, scoping por cliente |

## Exemplos

Criar encomenda:

```bash
curl -X POST http://localhost:3000/api/v1/shipments \
  -H 'content-type: application/json' \
  -H 'cookie: veltrix_session=…' \
  -d '{
    "customerId": "00000000-0000-4000-8000-000000000021",
    "serviceType": "standard",
    "priority": "high",
    "items": [{ "description": "Palete", "quantity": 2, "weightKg": 180 }],
    "origin":      { "addressLine": "Rua A 1", "city": "Coimbra", "countryCode": "PT" },
    "destination": { "addressLine": "Rua B 2", "city": "Porto",  "countryCode": "PT" },
    "quotedAmountCents": 12500
  }'
```

Transição (a entrega exige POD prévio):

```bash
curl -X POST .../api/v1/shipments/{id}/transitions \
  -H 'content-type: application/json' -d '{"toStatus":"in_transit"}'
```

## Limites e idempotência

- `PageSize` máximo 100; ordenação por whitelist (`SORTABLE`), nunca interpolação direta.
- `idempotencyKey` (≥ 8 caracteres) devolve a mesma encomenda em repetições dentro da janela.
- Rate limits em memória (por processo): login 8/15 min, orçamento e contacto 5/10 min, rastreio
  30/min. Em multi-instância, migrar para Redis/Upstash — ver `docs/LIMITACOES.md`.

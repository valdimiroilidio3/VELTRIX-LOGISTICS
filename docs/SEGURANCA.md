# Segurança

## 1. Autenticação

- Palavras-passe com **scrypt** (`N=2^15`, salt aleatório por utilizador, comparação em tempo
  constante). Nunca são registadas em logs.
- Sessão: token de 32 bytes aleatórios, guardado em cookie `httpOnly`, `SameSite=Lax`, `Secure` em
  produção, validade de 12 h. Na BD fica apenas `sha256(token + AUTH_SECRET)`, pelo que uma fuga da
  tabela `sessions` não permite forjar sessões sem o segredo.
- `AUTH_SECRET` é obrigatório em produção (`requireAuthSecret` lança erro se faltar).
- Logout apaga a linha da sessão (invalidação no servidor, não apenas no browser).
- Suspender utilizador apaga todas as suas sessões na mesma transação.
- Rate limit de login: 8 tentativas / 15 min por email+IP; falhas auditadas (`auth.login_failed`).
- Enumeração de utilizadores mitigada: verificação de password corre mesmo sem perfil e mensagem
  genérica «Credenciais inválidas».
- **Recuperação de palavra-passe** (`/recuperar-password`): a resposta é idêntica exista ou não a
  conta (não permite enumerar emails). O token enviado por email é aleatório (32 bytes) e na BD fica
  apenas `sha256(token + AUTH_SECRET)` — reutiliza o mesmo esquema das sessões. Validade de 60 min,
  utilização única (`used_at`), e emitir um novo token invalida os anteriores. Concluir o reset
  revoga todas as sessões ativas.
- **Reset administrativo** (página Utilizadores): gera palavra-passe temporária de utilização
  única, revoga todas as sessões do utilizador e marca `profiles.must_change_password = 1`. No
  login seguinte o utilizador é redirecionado para `/definir-palavra-passe` e não acede à app sem
  definir password própria (política: ≥ 10 caracteres, com letras e números, e exige a password
  atual). A troca revoga as restantes sessões e é auditada (`auth.password_changed`).

## 2. Autorização

- 8 funções, 34 permissões declaradas como dados (`src/lib/auth/rbac.ts`).
- **Três barreiras independentes**:
  1. middleware (presença de cookie → redireciona para `/login`);
  2. páginas/rotas (`requirePagePermission`, `requireApiPermission`) → 403 real;
  3. serviços de domínio (tenancy por `organization_id` e scoping por `customer_id`/`driver_id`).
- `admin` não pode ser criado por registo público: não existe endpoint de registo; utilizadores são
  criados por `users:manage` (admin/super_admin) e a ação é auditada.
- Navegação lateral esconde links sem permissão, mas isso é apenas conforto visual — o servidor
  revalida sempre.

## 3. Isolamento entre clientes (anti-IDOR)

- `getShipmentDetail(id, organizationId, { customerId, driverId })` devolve **404** (não 403) para
  recursos de outra organização/cliente, evitando confirmar existência.
- Listagens de cliente filtram por `customer_id`; motoristas por `driver_id` via `route_stops`.
- Exportação CSV e API aplicam o mesmo scoping.
- Cobertura: `tests/tenancy.test.ts` (9 testes) prova 404 entre organizações, listagens scoped,
  mutações recusadas e ausência de PII no rastreio público.

## 4. Prova de entrega e ficheiros

- POD aceita assinatura/fotografia em data URL (PNG/JPEG/WebP), limite de 8 MB por pedido.
- Ficheiros são gravados **fora de `public/`** (`storage/`) com nome opaco; nunca são servidos
  diretamente.
- Acesso por **URL assinado HMAC-SHA256** com expiração de 5 minutos; assinatura verificada em tempo
  constante e ligada ao caminho (alterar o caminho invalida a assinatura).
- Alternativa em produção: Supabase Storage com bucket privado + RLS (variáveis em `.env.example`).

## 5. Webhooks e jobs

- `POST /api/v1/webhooks/payments` exige assinatura HMAC sobre o corpo; sem `STRIPE_WEBHOOK_SECRET`
  responde **503** em vez de aceitar pedidos não verificados.
- `GET /api/v1/cron/notifications` exige HMAC determinístico de `AUTH_SECRET`; sem segredo → 503.
- O cron não envia duas vezes o mesmo job (estado + contador de tentativas) e é seguro em execuções
  concorrentes para jobs já marcados como `sent`.

## 6. Cabeçalhos e superfície

`next.config.ts` e `vercel.json` aplicam: `X-Content-Type-Options`, `X-Frame-Options`,
`Referrer-Policy`, `Permissions-Policy` (geolocalização/câmara apenas para a própria origem) e
`Cross-Origin-Opener-Policy`. `poweredByHeader` desativado.

- Nenhum segredo em `NEXT_PUBLIC_*` (apenas URL/anon key do Supabase, que são públicas por desenho).
- `.env.local` e `.data/` excluídos pelo `.gitignore`.
- Validação de entrada com Zod em todos os endpoints e Server Actions; `ORDER BY` e paginação em
  whitelist (sem SQL concatenado com input).

## 7. Auditoria

Eventos registados: login/falha de login, criação e alteração de estado de encomenda, override com
justificação, atribuição, POD, criação de rotas e otimização, movimentos de armazém, ocupação de zonas,
faturação e pagamentos, criação/suspensão de utilizadores, alterações de preços e de organização,
exportações CSV, receção de mensagens de contacto.

Cada registo inclui `organization_id`, autor (id + email), recurso, metadados e IP em hash. A escrita
de auditoria é tolerante a falhas: nunca quebra a operação que descreve, mas a falha é registada no log.

## 8. Privacidade

- Rastreio público devolve apenas código, estado, cidade/país, eventos (sem ator) e janela de entrega;
  nunca email, morada completa, telefone ou nome do destinatário.
- Formulário de contacto: honeypot + rate limit por IP; dados guardados apenas para resposta.
- Política de privacidade e termos publicados; cookies apenas os essenciais (sessão).

## 9. Riscos residuais

| Risco | Mitigação atual | Próximo passo |
| --- | --- | --- |
| Rate limit em memória (por instância) | Adequado a 1 instância | Redis/Upstash em multi-instância |
| Sem 2FA | Palavras-passe fortes + auditoria | TOTP para `admin`/`super_admin` |
| Sem CSP completa | Cabeçalhos parciais | CSP com nonces (requer auditoria de scripts do Next) |
| Assinatura no canvas é simples | Rotulada como não qualificada | eIDAS/QES quando exigido |
| Faturação interna | Aviso explícito na UI | Software certificado + SAF-T |

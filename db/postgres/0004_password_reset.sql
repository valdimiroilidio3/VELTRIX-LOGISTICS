-- Password recovery tokens.
-- Only the SHA-256 of the token is stored, so a database leak cannot be used to
-- reset accounts. Tokens are single-use and expire after 60 minutes.

create table if not exists password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  requested_ip_hash text,
  created_at timestamptz not null default now()
);
create index if not exists idx_password_reset_profile on password_reset_tokens(profile_id);
create index if not exists idx_password_reset_expiry on password_reset_tokens(expires_at);

alter table password_reset_tokens enable row level security;
alter table password_reset_tokens force row level security;

-- No client policy at all: tokens are only handled by the server role.
comment on table password_reset_tokens is
  'Single-use password reset tokens. Only token_hash is stored; no client access is granted.';

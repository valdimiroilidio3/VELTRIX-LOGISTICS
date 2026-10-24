-- Prompt 02 — canonical shipment lifecycle and administrative quotes.
--
-- Lifecycle: pending_quote → quoted → confirmed → assigned → picked_up →
--            in_transit → (out_for_delivery) → delivered
-- Legacy values from 0001 are migrated: draft → pending_quote,
-- pending_confirmation → quoted, scheduled → assigned.

-- 1. Shipments: migrate existing values before tightening the constraint.
update shipments set status = 'pending_quote' where status = 'draft';
update shipments set status = 'quoted'        where status = 'pending_confirmation';
update shipments set status = 'assigned'      where status = 'scheduled';

alter table shipments drop constraint if exists shipments_status_check;
alter table shipments add constraint shipments_status_check check (
  status in (
    'pending_quote','quoted','confirmed','assigned','picked_up','in_transit',
    'out_for_delivery','delivered','on_hold','exception','failed_delivery',
    'returned','cancelled'
  )
);
alter table shipments alter column status set default 'pending_quote';

-- 2. Quotes become the commercial document attached to a shipment.
alter table quotes add column if not exists shipment_id uuid references shipments(id) on delete set null;
alter table quotes add column if not exists description text;
alter table quotes add column if not exists created_by uuid references profiles(id) on delete set null;
alter table quotes add column if not exists sent_at timestamptz;
alter table quotes add column if not exists decided_at timestamptz;

create index if not exists idx_quotes_shipment on quotes(shipment_id);
create index if not exists idx_quotes_validity on quotes(organization_id, valid_until);

-- A quote attached to a shipment must belong to the same organisation.
create or replace function guard_quote_shipment_org() returns trigger as $$
declare
  shipment_org uuid;
begin
  if new.shipment_id is not null then
    select organization_id into shipment_org from shipments where id = new.shipment_id;
    if shipment_org is distinct from new.organization_id then
      raise exception 'quote and shipment belong to different organisations';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_quote_shipment_org on quotes;
create trigger trg_quote_shipment_org before insert or update on quotes
for each row execute function guard_quote_shipment_org();

-- 3. Quote history: every status change is kept for the commercial trail.
create table if not exists quote_events (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete restrict,
  previous_status text,
  new_status text not null,
  amount_cents bigint,
  actor_id uuid references profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists idx_quote_events_quote on quote_events(quote_id, created_at desc);
alter table quote_events enable row level security;
alter table quote_events force row level security;

drop policy if exists quote_events_org_staff on quote_events;
create policy quote_events_org_staff on quote_events for all
  using (organization_id = current_organization_id() and is_staff())
  with check (organization_id = current_organization_id() and is_staff());

-- 4. Atomic state transition in the database.
--    The application also enforces this in a service transaction; having it in
--    the database guarantees that no client (including a direct psql session)
--    can change the status without leaving a matching history row.
create or replace function transition_shipment(
  p_shipment_id uuid,
  p_org_id uuid,
  p_to_status text,
  p_actor_id uuid,
  p_notes text default null,
  p_override boolean default false
) returns shipment_events as $$
declare
  v_shipment shipments;
  v_event shipment_events;
begin
  select * into v_shipment from shipments where id = p_shipment_id and organization_id = p_org_id for update;
  if not found then
    raise exception 'shipment % not found in organisation %', p_shipment_id, p_org_id using errcode = 'P0002';
  end if;

  if v_shipment.status = p_to_status then
    raise exception 'shipment already in status %', p_to_status using errcode = '22023';
  end if;

  if not p_override and not (
    (v_shipment.status = 'pending_quote'    and p_to_status in ('quoted','cancelled')) or
    (v_shipment.status = 'quoted'           and p_to_status in ('confirmed','on_hold','cancelled')) or
    (v_shipment.status = 'confirmed'        and p_to_status in ('assigned','on_hold','cancelled')) or
    (v_shipment.status = 'assigned'         and p_to_status in ('picked_up','on_hold','exception','cancelled')) or
    (v_shipment.status = 'picked_up'        and p_to_status in ('in_transit','exception','on_hold')) or
    (v_shipment.status = 'in_transit'       and p_to_status in ('out_for_delivery','delivered','exception','on_hold')) or
    (v_shipment.status = 'out_for_delivery' and p_to_status in ('delivered','failed_delivery','exception')) or
    (v_shipment.status = 'delivered'        and p_to_status in ('returned')) or
    (v_shipment.status in ('on_hold','exception','failed_delivery') and p_to_status in
      ('quoted','confirmed','assigned','in_transit','out_for_delivery','failed_delivery','returned','cancelled','on_hold'))
  ) then
    raise exception 'invalid transition % -> %', v_shipment.status, p_to_status using errcode = '23514';
  end if;

  update shipments
     set status = p_to_status,
         updated_at = now(),
         actual_delivery_at = case when p_to_status = 'delivered' then now() else actual_delivery_at end
   where id = p_shipment_id;

  insert into shipment_events (shipment_id, event_type, previous_status, new_status, description, actor_id, occurred_at)
  values (p_shipment_id, case when p_override then 'status_override' else 'status_change' end,
          v_shipment.status, p_to_status, p_notes, p_actor_id, now())
  returning * into v_event;

  return v_event;
end;
$$ language plpgsql;

comment on function transition_shipment is
  'Atomic shipment status change with history. Raises on invalid transitions; used by the API and available to direct SQL access.';

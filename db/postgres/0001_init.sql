-- VELTRIX — production schema (PostgreSQL / Supabase)
-- Mirrors src/lib/db/schema-sqlite.ts. Money is stored in integer minor units.
-- All timestamps are timestamptz in UTC.

create extension if not exists "pgcrypto";

create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  tax_number text,
  country_code text not null default 'PT',
  default_currency text not null default 'EUR',
  timezone text not null default 'Europe/Lisbon',
  data_mode text not null default 'live' check (data_mode in ('demo','live')),
  status text not null default 'active' check (status in ('active','suspended','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  auth_provider text not null default 'supabase' check (auth_provider in ('local','supabase')),
  auth_user_id uuid unique,
  email text not null,
  password_hash text,
  full_name text not null,
  phone text,
  role text not null check (role in ('super_admin','admin','operations_manager','dispatcher','warehouse_operator','driver','finance','customer')),
  status text not null default 'active' check (status in ('active','invited','suspended')),
  customer_id uuid,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, email)
);

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  ip_hash text,
  user_agent text
);
create index if not exists idx_sessions_profile on sessions(profile_id);
create index if not exists idx_sessions_expires on sessions(expires_at);

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  customer_type text not null check (customer_type in ('business','individual')),
  company_name text,
  contact_name text not null,
  email text not null,
  phone text,
  tax_number text,
  billing_address text,
  billing_postal_code text,
  billing_city text,
  billing_country_code text not null default 'PT',
  status text not null default 'active' check (status in ('active','inactive','blocked')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_customers_org on customers(organization_id, status);
create index if not exists idx_customers_email on customers(organization_id, email);

alter table profiles
  add constraint profiles_customer_fk foreign key (customer_id) references customers(id) on delete set null;

create table if not exists addresses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  customer_id uuid references customers(id) on delete set null,
  label text,
  address_line text not null,
  postal_code text,
  city text not null,
  region text,
  country_code text not null default 'PT',
  latitude double precision check (latitude is null or (latitude between -90 and 90)),
  longitude double precision check (longitude is null or (longitude between -180 and 180)),
  validated_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_addresses_org on addresses(organization_id);
create index if not exists idx_addresses_customer on addresses(customer_id);

create table if not exists shipments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  tracking_code text not null unique,
  customer_id uuid not null references customers(id) on delete restrict,
  origin_address_id uuid not null references addresses(id) on delete restrict,
  destination_address_id uuid not null references addresses(id) on delete restrict,
  service_type text not null check (service_type in ('standard','express','same_day','freight','international')),
  status text not null default 'draft' check (status in ('draft','pending_confirmation','confirmed','scheduled','picked_up','in_transit','out_for_delivery','delivered','on_hold','exception','failed_delivery','returned','cancelled')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  requested_pickup_at timestamptz,
  estimated_delivery_at timestamptz,
  actual_delivery_at timestamptz,
  total_weight_kg numeric(12,3) not null default 0 check (total_weight_kg >= 0),
  volume_m3 numeric(12,4) not null default 0 check (volume_m3 >= 0),
  currency text not null default 'EUR',
  quoted_amount_cents bigint not null default 0 check (quoted_amount_cents >= 0),
  final_amount_cents bigint check (final_amount_cents is null or final_amount_cents >= 0),
  notes text,
  exception_reason text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_shipments_org_status on shipments(organization_id, status);
create index if not exists idx_shipments_customer on shipments(customer_id, created_at desc);
create index if not exists idx_shipments_created on shipments(organization_id, created_at desc);
create index if not exists idx_shipments_delivery on shipments(estimated_delivery_at);
create index if not exists idx_shipments_tracking on shipments(tracking_code);

create table if not exists shipment_items (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipments(id) on delete cascade,
  description text not null,
  quantity integer not null default 1 check (quantity > 0),
  weight_kg numeric(12,3) not null default 0 check (weight_kg >= 0),
  length_cm numeric(10,2),
  width_cm numeric(10,2),
  height_cm numeric(10,2),
  declared_value_cents bigint,
  handling_instructions text,
  created_at timestamptz not null default now()
);
create index if not exists idx_shipment_items_shipment on shipment_items(shipment_id);

create table if not exists shipment_events (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipments(id) on delete cascade,
  event_type text not null,
  previous_status text,
  new_status text,
  description text,
  location text,
  latitude double precision,
  longitude double precision,
  actor_id uuid references profiles(id) on delete set null,
  occurred_at timestamptz not null default now(),
  metadata jsonb
);
create index if not exists idx_events_shipment on shipment_events(shipment_id, occurred_at desc);
create index if not exists idx_events_occurred on shipment_events(occurred_at desc);

create table if not exists vehicles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  registration_number text not null,
  vehicle_type text not null check (vehicle_type in ('van','truck','trailer','bicycle','electric_van')),
  capacity_weight_kg numeric(12,3) not null default 0 check (capacity_weight_kg >= 0),
  capacity_volume_m3 numeric(12,4) not null default 0 check (capacity_volume_m3 >= 0),
  status text not null default 'available' check (status in ('available','in_use','maintenance','retired')),
  last_inspection_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, registration_number)
);

create table if not exists drivers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  profile_id uuid not null unique references profiles(id) on delete cascade,
  licence_number text,
  licence_expiry date,
  employment_status text not null default 'active' check (employment_status in ('active','on_leave','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_drivers_org on drivers(organization_id);

create table if not exists routes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  route_date date not null,
  name text,
  status text not null default 'draft' check (status in ('draft','planned','dispatched','in_progress','completed','cancelled')),
  planned_distance_km numeric(10,2),
  planned_duration_min integer,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_routes_org_date on routes(organization_id, route_date desc);

create table if not exists route_stops (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references routes(id) on delete cascade,
  shipment_id uuid not null references shipments(id) on delete restrict,
  driver_id uuid references drivers(id) on delete set null,
  vehicle_id uuid references vehicles(id) on delete set null,
  sequence_number integer not null check (sequence_number > 0),
  stop_type text not null default 'delivery' check (stop_type in ('pickup','delivery')),
  planned_arrival_at timestamptz,
  actual_arrival_at timestamptz,
  status text not null default 'pending' check (status in ('pending','en_route','arrived','completed','failed')),
  latitude double precision,
  longitude double precision,
  notes text,
  unique (route_id, sequence_number)
);
create index if not exists idx_stops_route on route_stops(route_id, sequence_number);
create index if not exists idx_stops_shipment on route_stops(shipment_id);
create index if not exists idx_stops_driver on route_stops(driver_id, status);

create table if not exists warehouses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  name text not null,
  address_id uuid references addresses(id) on delete set null,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now()
);
create index if not exists idx_warehouses_org on warehouses(organization_id);

create table if not exists warehouse_zones (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references warehouses(id) on delete cascade,
  name text not null,
  zone_type text not null check (zone_type in ('receiving','dispatch','storage','picking','returns','cold','high_value')),
  capacity_pallets integer not null default 0 check (capacity_pallets >= 0),
  occupied_pallets integer not null default 0 check (occupied_pallets >= 0),
  status text not null default 'active' check (status in ('active','full','maintenance')),
  unique (warehouse_id, name),
  constraint zone_occupancy_within_capacity check (occupied_pallets <= capacity_pallets)
);

create table if not exists inventory_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  sku text not null,
  name text not null,
  description text,
  unit_of_measure text not null default 'unit',
  created_at timestamptz not null default now(),
  unique (organization_id, sku)
);

create table if not exists inventory_movements (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references warehouses(id) on delete restrict,
  zone_id uuid references warehouse_zones(id) on delete set null,
  inventory_item_id uuid not null references inventory_items(id) on delete restrict,
  shipment_id uuid references shipments(id) on delete set null,
  movement_type text not null check (movement_type in ('receipt','putaway','transfer','pick','dispatch','adjustment','return')),
  quantity integer not null check (quantity <> 0),
  reference text,
  actor_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_movements_warehouse on inventory_movements(warehouse_id, created_at desc);
create index if not exists idx_movements_item on inventory_movements(inventory_item_id);
create index if not exists idx_movements_shipment on inventory_movements(shipment_id);

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  shipment_id uuid references shipments(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  document_type text not null,
  storage_path text not null,
  filename text not null,
  mime_type text not null,
  size_bytes bigint not null default 0,
  uploaded_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_documents_shipment on documents(shipment_id);
create index if not exists idx_documents_org on documents(organization_id);

create table if not exists proof_of_delivery (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null unique references shipments(id) on delete cascade,
  received_by text not null,
  signature_path text,
  photo_paths jsonb,
  notes text,
  latitude double precision,
  longitude double precision,
  delivered_at timestamptz not null default now(),
  submitted_by uuid references profiles(id) on delete set null
);

create table if not exists quotes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  reference text not null unique,
  customer_id uuid references customers(id) on delete set null,
  contact_name text not null,
  contact_email text not null,
  contact_phone text,
  origin text not null,
  destination text not null,
  service_type text not null,
  weight_kg numeric(12,3) not null default 0 check (weight_kg >= 0),
  volume_m3 numeric(12,4) not null default 0 check (volume_m3 >= 0),
  currency text not null default 'EUR',
  subtotal_cents bigint not null default 0 check (subtotal_cents >= 0),
  tax_cents bigint not null default 0 check (tax_cents >= 0),
  total_cents bigint not null default 0 check (total_cents >= 0),
  status text not null default 'draft' check (status in ('draft','sent','accepted','rejected','expired')),
  valid_until timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_quotes_org on quotes(organization_id, created_at desc);
create index if not exists idx_quotes_status on quotes(organization_id, status);

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  customer_id uuid not null references customers(id) on delete restrict,
  shipment_id uuid references shipments(id) on delete set null,
  invoice_number text not null,
  currency text not null default 'EUR',
  subtotal_cents bigint not null default 0 check (subtotal_cents >= 0),
  tax_cents bigint not null default 0 check (tax_cents >= 0),
  total_cents bigint not null default 0 check (total_cents >= 0),
  status text not null default 'draft' check (status in ('draft','issued','paid','overdue','void')),
  issued_at timestamptz,
  due_at timestamptz,
  external_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, invoice_number)
);
create index if not exists idx_invoices_status on invoices(organization_id, status, due_at);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  invoice_id uuid not null references invoices(id) on delete cascade,
  provider text not null default 'manual' check (provider in ('manual','stripe','mollie','bank_transfer')),
  provider_reference text,
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null default 'EUR',
  status text not null default 'pending' check (status in ('pending','succeeded','failed','refunded')),
  idempotency_key text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, provider_reference)
);

create table if not exists notification_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  recipient text not null,
  channel text not null check (channel in ('email','sms','whatsapp','in_app')),
  template text not null,
  payload jsonb not null,
  status text not null default 'queued' check (status in ('queued','processing','sent','failed','cancelled')),
  attempts integer not null default 0,
  last_error text,
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_notifications_status on notification_jobs(status, scheduled_at);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  actor_id uuid references profiles(id) on delete set null,
  actor_email text,
  action text not null,
  resource_type text not null,
  resource_id text,
  metadata jsonb,
  ip_hash text,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_org on audit_logs(organization_id, created_at desc);
create index if not exists idx_audit_resource on audit_logs(resource_type, resource_id);

create table if not exists integration_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  provider text not null,
  enabled boolean not null default false,
  status text not null default 'not_configured' check (status in ('not_configured','configured','operational','error')),
  public_configuration jsonb,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider)
);

create table if not exists pricing_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  service_type text not null,
  base_fee_cents bigint not null default 0 check (base_fee_cents >= 0),
  per_kg_cents bigint not null default 0 check (per_kg_cents >= 0),
  per_m3_cents bigint not null default 0 check (per_m3_cents >= 0),
  per_km_cents bigint not null default 0 check (per_km_cents >= 0),
  minimum_cents bigint not null default 0 check (minimum_cents >= 0),
  fuel_surcharge_pct numeric(5,2) not null default 0 check (fuel_surcharge_pct >= 0),
  vat_rate_pct numeric(5,2) not null default 23 check (vat_rate_pct >= 0 and vat_rate_pct <= 100),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, service_type)
);

create table if not exists contact_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  email text not null,
  topic text not null default 'geral',
  message text not null,
  status text not null default 'new' check (status in ('new','in_progress','answered','archived')),
  assigned_to uuid references profiles(id) on delete set null,
  ip_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_contact_status on contact_messages(organization_id, status, created_at desc);

create table if not exists idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  key text not null,
  request_hash text,
  response_status integer,
  response_body jsonb,
  created_at timestamptz not null default now(),
  unique (scope, key)
);
create index if not exists idx_idempotency_created on idempotency_keys(created_at);

-- updated_at triggers
do $$
declare
  target text;
begin
  foreach target in array array['organizations','profiles','customers','shipments','vehicles','drivers','routes','quotes','invoices','notification_jobs','integration_settings','pricing_rules','contact_messages']
  loop
    execute format('drop trigger if exists trg_%1$s_updated_at on %1$s', target);
    execute format('create trigger trg_%1$s_updated_at before update on %1$s for each row execute function set_updated_at()', target);
  end loop;
end $$;

-- Consistency guards (mirror the application service rules)

-- 1) A POD cannot be created for a cancelled/returned shipment.
create or replace function guard_pod_insert() returns trigger as $$
declare
  shipment_status text;
begin
  select status into shipment_status from shipments where id = new.shipment_id;
  if shipment_status in ('cancelled','returned') then
    raise exception 'cannot register proof of delivery for a % shipment', shipment_status;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_pod_guard on proof_of_delivery;
create trigger trg_pod_guard before insert on proof_of_delivery
for each row execute function guard_pod_insert();

-- 2) A shipment may only be marked delivered when a POD row already exists.
--    The service writes the POD first and flips the status inside the same
--    transaction, so this holds for both the API and the driver portal.
create or replace function guard_delivery_transition() returns trigger as $$
begin
  if new.status = 'delivered' and old.status is distinct from 'delivered' then
    if not exists (select 1 from proof_of_delivery where shipment_id = new.id) then
      raise exception 'shipment % cannot be delivered without proof of delivery', new.id;
    end if;
    if new.actual_delivery_at is null then
      new.actual_delivery_at := now();
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_shipment_delivery_guard on shipments;
create trigger trg_shipment_delivery_guard before update on shipments
for each row execute function guard_delivery_transition();

-- 3) Tracking codes must be uppercase alphanumeric with the VX prefix.
alter table shipments
  add constraint shipments_tracking_code_format check (tracking_code ~ '^VX[A-Z0-9]{6,20}$');

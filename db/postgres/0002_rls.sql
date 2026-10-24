-- Row Level Security.
--
-- Two access paths exist in VELTRIX:
--   1. The Next.js server connects with a privileged role and enforces tenancy in
--      the service layer (see tests/tenancy.test.ts). This path bypasses RLS.
--   2. Any direct database access (Supabase client, psql, BI tool) using the
--      `anon` / `authenticated` roles is forced through RLS below.
--
-- Helpers read the authenticated user's profile through Supabase Auth
-- (`auth.uid()`), falling back to an explicit app.current_org_id setting for
-- non-Supabase integrations.

create or replace function current_profile_id() returns uuid as $$
  select coalesce(
    (select id from profiles where auth_user_id = auth.uid()),
    nullif(current_setting('app.current_profile_id', true), '')::uuid
  );
$$ language sql stable;

create or replace function current_organization_id() returns uuid as $$
  select coalesce(
    (select organization_id from profiles where auth_user_id = auth.uid()),
    nullif(current_setting('app.current_org_id', true), '')::uuid
  );
$$ language sql stable;

create or replace function current_role_name() returns text as $$
  select coalesce(
    (select role from profiles where auth_user_id = auth.uid()),
    nullif(current_setting('app.current_role', true), '')
  );
$$ language sql stable;

create or replace function current_customer_id() returns uuid as $$
  select (select customer_id from profiles where auth_user_id = auth.uid());
$$ language sql stable;

create or replace function is_staff() returns boolean as $$
  select coalesce(current_role_name() in ('super_admin','admin','operations_manager','dispatcher','warehouse_operator','finance'), false);
$$ language sql stable;

create or replace function is_admin() returns boolean as $$
  select coalesce(current_role_name() in ('super_admin','admin'), false);
$$ language sql stable;

-- Enable RLS everywhere organisational data lives.
do $$
declare
  target text;
begin
  foreach target in array array[
    'organizations','profiles','customers','addresses','shipments','shipment_items','shipment_events',
    'vehicles','drivers','routes','route_stops','warehouses','warehouse_zones','inventory_items',
    'inventory_movements','documents','proof_of_delivery','quotes','invoices','payments',
    'notification_jobs','audit_logs','integration_settings','pricing_rules','contact_messages','sessions'
  ]
  loop
    execute format('alter table %I enable row level security', target);
    execute format('alter table %I force row level security', target);
  end loop;
end $$;

-- Organizations: a user only sees their own organisation.
drop policy if exists org_select_own on organizations;
create policy org_select_own on organizations for select
  using (id = current_organization_id());

-- Profiles: staff see colleagues; customers only themselves.
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select
  using (
    organization_id = current_organization_id()
    and (is_staff() or id = current_profile_id())
  );

drop policy if exists profiles_update_self on profiles;
create policy profiles_update_self on profiles for update
  using (id = current_profile_id() or is_admin())
  with check (id = current_profile_id() or is_admin());

-- Generic organisation-scoped tables (staff full access, customers limited below).
do $$
declare
  target text;
begin
  foreach target in array array[
    'customers','addresses','vehicles','drivers','routes','warehouses','inventory_items','quotes',
    'invoices','payments','notification_jobs','integration_settings','pricing_rules','contact_messages'
  ]
  loop
    execute format('drop policy if exists %I_org_staff on %I', target, target);
    execute format(
      'create policy %I_org_staff on %I for all using (organization_id = current_organization_id() and is_staff()) with check (organization_id = current_organization_id() and is_staff())',
      target, target
    );
  end loop;
end $$;

-- Shipments: staff by organisation, customer portal only for its own customer.
drop policy if exists shipments_staff on shipments;
create policy shipments_staff on shipments for all
  using (organization_id = current_organization_id() and is_staff())
  with check (organization_id = current_organization_id() and is_staff());

drop policy if exists shipments_customer_read on shipments;
create policy shipments_customer_read on shipments for select
  using (
    organization_id = current_organization_id()
    and current_role_name() = 'customer'
    and customer_id = current_customer_id()
  );

drop policy if exists shipments_driver_read on shipments;
create policy shipments_driver_read on shipments for select
  using (
    organization_id = current_organization_id()
    and current_role_name() = 'driver'
    and exists (
      select 1 from route_stops rs join drivers d on d.id = rs.driver_id
      where rs.shipment_id = shipments.id and d.profile_id = current_profile_id()
    )
  );

-- Child rows inherit the parent shipment visibility.
drop policy if exists shipment_items_read on shipment_items;
create policy shipment_items_read on shipment_items for select
  using (exists (select 1 from shipments s where s.id = shipment_items.shipment_id));

drop policy if exists shipment_events_read on shipment_events;
create policy shipment_events_read on shipment_events for select
  using (exists (select 1 from shipments s where s.id = shipment_events.shipment_id));

drop policy if exists shipment_events_write_staff on shipment_events;
create policy shipment_events_write_staff on shipment_events for insert
  with check (is_staff() or current_role_name() = 'driver');

drop policy if exists route_stops_read on route_stops;
create policy route_stops_read on route_stops for select
  using (
    exists (
      select 1 from routes r
      where r.id = route_stops.route_id and r.organization_id = current_organization_id()
    )
    and (is_staff() or exists (select 1 from drivers d where d.id = route_stops.driver_id and d.profile_id = current_profile_id()))
  );

drop policy if exists proof_of_delivery_read on proof_of_delivery;
create policy proof_of_delivery_read on proof_of_delivery for select
  using (exists (select 1 from shipments s where s.id = proof_of_delivery.shipment_id));

drop policy if exists documents_read on documents;
create policy documents_read on documents for select
  using (organization_id = current_organization_id() and (is_staff() or current_role_name() = 'customer'));

drop policy if exists inventory_movements_read on inventory_movements;
create policy inventory_movements_read on inventory_movements for select
  using (
    exists (
      select 1 from warehouses w
      where w.id = inventory_movements.warehouse_id and w.organization_id = current_organization_id()
    )
  );

drop policy if exists warehouse_zones_read on warehouse_zones;
create policy warehouse_zones_read on warehouse_zones for select
  using (
    exists (
      select 1 from warehouses w
      where w.id = warehouse_zones.warehouse_id and w.organization_id = current_organization_id()
    )
  );

-- Audit logs: admins only, read-only.
drop policy if exists audit_select_admin on audit_logs;
create policy audit_select_admin on audit_logs for select
  using (organization_id = current_organization_id() and is_admin());

-- Sessions are private to the server role; no client policy is granted on purpose.

-- Service-role bypass documentation:
--   grant all on all tables in schema public to service_role;  -- already granted by Supabase
-- The application server must use the service role exclusively on the server.

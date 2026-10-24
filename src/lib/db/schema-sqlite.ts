/**
 * SQLite schema for local development / demo mode.
 * The production equivalent (PostgreSQL + RLS) lives in `db/postgres/*.sql`.
 * Types are intentionally portable: TEXT timestamps (ISO-8601 UTC), integer
 * minor units for money (never floats), TEXT JSON, SMALLINT booleans.
 */
export const SQLITE_SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  legal_name TEXT,
  tax_number TEXT,
  country_code TEXT NOT NULL DEFAULT 'PT',
  default_currency TEXT NOT NULL DEFAULT 'EUR',
  timezone TEXT NOT NULL DEFAULT 'Europe/Lisbon',
  data_mode TEXT NOT NULL DEFAULT 'demo' CHECK (data_mode IN ('demo','live')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  auth_provider TEXT NOT NULL DEFAULT 'local' CHECK (auth_provider IN ('local','supabase')),
  auth_user_id TEXT,
  email TEXT NOT NULL,
  password_hash TEXT,
  full_name TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL CHECK (role IN ('super_admin','admin','operations_manager','dispatcher','warehouse_operator','driver','finance','customer')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','invited','suspended')),
  customer_id TEXT,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, email)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_auth_user ON profiles(auth_user_id) WHERE auth_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  ip_hash TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_profile ON sessions(profile_id);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  requested_ip_hash TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_password_reset_profile ON password_reset_tokens(profile_id);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  customer_type TEXT NOT NULL CHECK (customer_type IN ('business','individual')),
  company_name TEXT,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  tax_number TEXT,
  billing_address TEXT,
  billing_postal_code TEXT,
  billing_city TEXT,
  billing_country_code TEXT NOT NULL DEFAULT 'PT',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','blocked')),
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_customers_org ON customers(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(organization_id, email);

CREATE TABLE IF NOT EXISTS addresses (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  label TEXT,
  address_line TEXT NOT NULL,
  postal_code TEXT,
  city TEXT NOT NULL,
  region TEXT,
  country_code TEXT NOT NULL DEFAULT 'PT',
  latitude REAL,
  longitude REAL,
  validated_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_addresses_org ON addresses(organization_id);
CREATE INDEX IF NOT EXISTS idx_addresses_customer ON addresses(customer_id);

CREATE TABLE IF NOT EXISTS shipments (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  tracking_code TEXT NOT NULL UNIQUE,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  origin_address_id TEXT NOT NULL REFERENCES addresses(id) ON DELETE RESTRICT,
  destination_address_id TEXT NOT NULL REFERENCES addresses(id) ON DELETE RESTRICT,
  service_type TEXT NOT NULL CHECK (service_type IN ('standard','express','same_day','freight','international')),
  status TEXT NOT NULL DEFAULT 'pending_quote'
    CHECK (status IN ('pending_quote','quoted','confirmed','assigned','picked_up','in_transit','out_for_delivery','delivered','on_hold','exception','failed_delivery','returned','cancelled')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  requested_pickup_at TEXT,
  estimated_delivery_at TEXT,
  actual_delivery_at TEXT,
  total_weight_kg REAL NOT NULL DEFAULT 0 CHECK (total_weight_kg >= 0),
  volume_m3 REAL NOT NULL DEFAULT 0 CHECK (volume_m3 >= 0),
  currency TEXT NOT NULL DEFAULT 'EUR',
  quoted_amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (quoted_amount_cents >= 0),
  final_amount_cents INTEGER CHECK (final_amount_cents IS NULL OR final_amount_cents >= 0),
  notes TEXT,
  exception_reason TEXT,
  created_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shipments_org_status ON shipments(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_shipments_customer ON shipments(customer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_shipments_created ON shipments(organization_id, created_at);
CREATE INDEX IF NOT EXISTS idx_shipments_delivery ON shipments(estimated_delivery_at);

CREATE TABLE IF NOT EXISTS shipment_items (
  id TEXT PRIMARY KEY,
  shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  weight_kg REAL NOT NULL DEFAULT 0 CHECK (weight_kg >= 0),
  length_cm REAL,
  width_cm REAL,
  height_cm REAL,
  declared_value_cents INTEGER,
  handling_instructions TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shipment_items_shipment ON shipment_items(shipment_id);

CREATE TABLE IF NOT EXISTS shipment_events (
  id TEXT PRIMARY KEY,
  shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  previous_status TEXT,
  new_status TEXT,
  description TEXT,
  location TEXT,
  latitude REAL,
  longitude REAL,
  actor_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  occurred_at TEXT NOT NULL,
  metadata TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_shipment ON shipment_events(shipment_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_events_occurred ON shipment_events(occurred_at);

CREATE TABLE IF NOT EXISTS vehicles (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  registration_number TEXT NOT NULL,
  vehicle_type TEXT NOT NULL CHECK (vehicle_type IN ('van','truck','trailer','bicycle','electric_van')),
  capacity_weight_kg REAL NOT NULL DEFAULT 0,
  capacity_volume_m3 REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','in_use','maintenance','retired')),
  last_inspection_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, registration_number)
);

CREATE TABLE IF NOT EXISTS drivers (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  profile_id TEXT NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  licence_number TEXT,
  licence_expiry TEXT,
  employment_status TEXT NOT NULL DEFAULT 'active' CHECK (employment_status IN ('active','on_leave','inactive')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_drivers_org ON drivers(organization_id);

CREATE TABLE IF NOT EXISTS routes (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  route_date TEXT NOT NULL,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','planned','dispatched','in_progress','completed','cancelled')),
  planned_distance_km REAL,
  planned_duration_min INTEGER,
  created_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_routes_org_date ON routes(organization_id, route_date);

CREATE TABLE IF NOT EXISTS route_stops (
  id TEXT PRIMARY KEY,
  route_id TEXT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE RESTRICT,
  driver_id TEXT REFERENCES drivers(id) ON DELETE SET NULL,
  vehicle_id TEXT REFERENCES vehicles(id) ON DELETE SET NULL,
  sequence_number INTEGER NOT NULL,
  stop_type TEXT NOT NULL DEFAULT 'delivery' CHECK (stop_type IN ('pickup','delivery')),
  planned_arrival_at TEXT,
  actual_arrival_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','en_route','arrived','completed','failed')),
  latitude REAL,
  longitude REAL,
  notes TEXT,
  UNIQUE (route_id, sequence_number)
);
CREATE INDEX IF NOT EXISTS idx_stops_route ON route_stops(route_id, sequence_number);
CREATE INDEX IF NOT EXISTS idx_stops_shipment ON route_stops(shipment_id);
CREATE INDEX IF NOT EXISTS idx_stops_driver ON route_stops(driver_id, status);

CREATE TABLE IF NOT EXISTS warehouses (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  address_id TEXT REFERENCES addresses(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_warehouses_org ON warehouses(organization_id);

CREATE TABLE IF NOT EXISTS warehouse_zones (
  id TEXT PRIMARY KEY,
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  zone_type TEXT NOT NULL CHECK (zone_type IN ('receiving','dispatch','storage','picking','returns','cold','high_value')),
  capacity_pallets INTEGER NOT NULL DEFAULT 0 CHECK (capacity_pallets >= 0),
  occupied_pallets INTEGER NOT NULL DEFAULT 0 CHECK (occupied_pallets >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','full','maintenance')),
  UNIQUE (warehouse_id, name)
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  unit_of_measure TEXT NOT NULL DEFAULT 'unit',
  created_at TEXT NOT NULL,
  UNIQUE (organization_id, sku)
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id TEXT PRIMARY KEY,
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  zone_id TEXT REFERENCES warehouse_zones(id) ON DELETE SET NULL,
  inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  shipment_id TEXT REFERENCES shipments(id) ON DELETE SET NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('receipt','putaway','transfer','pick','dispatch','adjustment','return')),
  quantity INTEGER NOT NULL,
  reference TEXT,
  actor_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_movements_warehouse ON inventory_movements(warehouse_id, created_at);
CREATE INDEX IF NOT EXISTS idx_movements_item ON inventory_movements(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_movements_shipment ON inventory_movements(shipment_id);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  shipment_id TEXT REFERENCES shipments(id) ON DELETE CASCADE,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  document_type TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  uploaded_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_documents_shipment ON documents(shipment_id);

CREATE TABLE IF NOT EXISTS proof_of_delivery (
  id TEXT PRIMARY KEY,
  shipment_id TEXT NOT NULL UNIQUE REFERENCES shipments(id) ON DELETE CASCADE,
  received_by TEXT NOT NULL,
  signature_path TEXT,
  photo_paths TEXT,
  notes TEXT,
  latitude REAL,
  longitude REAL,
  delivered_at TEXT NOT NULL,
  submitted_by TEXT REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS quotes (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  reference TEXT NOT NULL UNIQUE,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  shipment_id TEXT REFERENCES shipments(id) ON DELETE SET NULL,
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  service_type TEXT NOT NULL,
  weight_kg REAL NOT NULL DEFAULT 0 CHECK (weight_kg >= 0),
  volume_m3 REAL NOT NULL DEFAULT 0 CHECK (volume_m3 >= 0),
  currency TEXT NOT NULL DEFAULT 'EUR',
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  tax_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','accepted','rejected','expired')),
  valid_until TEXT,
  notes TEXT,
  description TEXT,
  sent_at TEXT,
  decided_at TEXT,
  created_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_quotes_org ON quotes(organization_id, created_at);
CREATE INDEX IF NOT EXISTS idx_quotes_shipment ON quotes(shipment_id);

CREATE TABLE IF NOT EXISTS quote_events (
  id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  amount_cents INTEGER,
  actor_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_quote_events_quote ON quote_events(quote_id, created_at);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(organization_id, status);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  shipment_id TEXT REFERENCES shipments(id) ON DELETE SET NULL,
  invoice_number TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  tax_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','paid','overdue','void')),
  issued_at TEXT,
  due_at TEXT,
  external_reference TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, invoice_number)
);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(organization_id, status, due_at);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'manual' CHECK (provider IN ('manual','stripe','mollie','bank_transfer')),
  provider_reference TEXT,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'EUR',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','failed','refunded')),
  idempotency_key TEXT,
  paid_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (provider, provider_reference)
);

CREATE TABLE IF NOT EXISTS notification_jobs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  recipient TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email','sms','whatsapp','in_app')),
  template TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','sent','failed','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  scheduled_at TEXT NOT NULL,
  sent_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notification_jobs(status, scheduled_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  actor_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  actor_email TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  metadata TEXT,
  ip_hash TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_org ON audit_logs(organization_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_logs(resource_type, resource_id);

CREATE TABLE IF NOT EXISTS integration_settings (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'not_configured' CHECK (status IN ('not_configured','configured','operational','error')),
  public_configuration TEXT,
  last_checked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, provider)
);

CREATE TABLE IF NOT EXISTS pricing_rules (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  service_type TEXT NOT NULL,
  base_fee_cents INTEGER NOT NULL DEFAULT 0,
  per_kg_cents INTEGER NOT NULL DEFAULT 0,
  per_m3_cents INTEGER NOT NULL DEFAULT 0,
  per_km_cents INTEGER NOT NULL DEFAULT 0,
  minimum_cents INTEGER NOT NULL DEFAULT 0,
  fuel_surcharge_pct REAL NOT NULL DEFAULT 0,
  vat_rate_pct REAL NOT NULL DEFAULT 23,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, service_type)
);


CREATE TABLE IF NOT EXISTS contact_messages (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  topic TEXT NOT NULL DEFAULT 'geral',
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_progress','answered','archived')),
  assigned_to TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  ip_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_contact_status ON contact_messages(organization_id, status, created_at);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  key TEXT NOT NULL,
  request_hash TEXT,
  response_status INTEGER,
  response_body TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (scope, key)
);
CREATE INDEX IF NOT EXISTS idx_idempotency_created ON idempotency_keys(created_at);
`;

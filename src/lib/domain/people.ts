import "server-only";
import { db, type Db } from "@/lib/db";
import { newId, nowIso } from "@/lib/ids";
import { conflict, notFound, validationError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { hashPassword } from "@/lib/auth/password";
import { permissionsForRole, ROLE_LABELS, type Role } from "@/lib/auth/rbac";
import type { SessionUser } from "@/lib/auth/session";

/* ───────────────────────────── customers ───────────────────────────── */

export interface CreateCustomerInput {
  customerType: "business" | "individual";
  companyName?: string;
  contactName: string;
  email: string;
  phone?: string | null;
  taxNumber?: string | null;
  billingAddress?: string | null;
  billingPostalCode?: string | null;
  billingCity?: string | null;
  billingCountryCode: string;
  notes?: string | null;
}

/** Minimal, explicit validation: no invented rules beyond what is verifiable. */
function normalisePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[^\d+]/g, "");
  if (!cleaned) return null;
  if (!/^\+?\d{6,15}$/.test(cleaned)) throw validationError("Telefone inválido: use 6 a 15 dígitos, com indicativo se aplicável.");
  return cleaned;
}

export async function createCustomer(organizationId: string, input: CreateCustomerInput, actor: SessionUser, database: Db = db()) {
  const email = input.email.trim().toLowerCase();
  const existing = await database.get<{ id: string; contact_name: string; status: string }>(
    "SELECT id, contact_name, status FROM customers WHERE organization_id = ? AND lower(email) = ?",
    [organizationId, email],
  );
  if (existing) {
    throw conflict(
      `Já existe um cliente com este email (${existing.contact_name}, ${existing.status === "active" ? "ativo" : "inativo"}). Abra o registo existente em vez de duplicar.`,
    );
  }

  const phone = normalisePhone(input.phone);
  if (input.taxNumber) {
    const taxClash = await database.get<{ id: string }>(
      "SELECT id FROM customers WHERE organization_id = ? AND tax_number = ?",
      [organizationId, input.taxNumber.trim()],
    );
    if (taxClash) throw conflict("Já existe um cliente com este NIF nesta organização.");
  }

  const id = newId();
  const now = nowIso();
  await database.run(
    `INSERT INTO customers (id, organization_id, customer_type, company_name, contact_name, email, phone, tax_number,
       billing_address, billing_postal_code, billing_city, billing_country_code, status, notes, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id,
      organizationId,
      input.customerType,
      input.customerType === "individual" ? input.contactName : (input.companyName?.trim() || input.contactName),
      input.contactName,
      email,
      phone,
      input.taxNumber?.trim() ?? null,
      input.billingAddress ?? null,
      input.billingPostalCode ?? null,
      input.billingCity ?? null,
      input.billingCountryCode,
      "active",
      input.notes ?? null,
      now,
      now,
    ],
  );

  await writeAudit(
    {
      organizationId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: "customer.created",
      resourceType: "customer",
      resourceId: id,
      metadata: { email },
    },
    database,
  );

  return { id };
}

export interface UpdateCustomerInput {
  companyName?: string | null;
  contactName?: string;
  email?: string;
  phone?: string | null;
  taxNumber?: string | null;
  billingAddress?: string | null;
  billingPostalCode?: string | null;
  billingCity?: string | null;
  billingCountryCode?: string;
  notes?: string | null;
}

/**
 * Edits only the commercially maintained fields. Shipments, routes and
 * documents keep their own immutable copies of the addresses they were created
 * with, so changing a customer's billing address never rewrites history.
 */
export async function updateCustomer(
  organizationId: string,
  customerId: string,
  input: UpdateCustomerInput,
  actor: SessionUser,
  database: Db = db(),
) {
  const customer = await database.get<{ id: string; email: string; customer_type: string; contact_name: string }>(
    "SELECT id, email, customer_type, contact_name FROM customers WHERE id = ? AND organization_id = ?",
    [customerId, organizationId],
  );
  if (!customer) throw notFound("Cliente não encontrado");

  const email = input.email ? input.email.trim().toLowerCase() : customer.email;
  if (email !== customer.email) {
    const clash = await database.get<{ id: string }>(
      "SELECT id FROM customers WHERE organization_id = ? AND lower(email) = ? AND id <> ?",
      [organizationId, email, customerId],
    );
    if (clash) throw conflict("Outro cliente já usa este email.");
  }

  const phone = input.phone === undefined ? undefined : normalisePhone(input.phone);
  const contactName = input.contactName?.trim() || customer.contact_name;
  const companyName = customer.customer_type === "individual" ? contactName : input.companyName?.trim() || contactName;

  await database.run(
    `UPDATE customers SET company_name = ?, contact_name = ?, email = ?,
       phone = COALESCE(?, phone), tax_number = ?, billing_address = ?, billing_postal_code = ?, billing_city = ?,
       billing_country_code = ?, notes = ?, updated_at = ? WHERE id = ? AND organization_id = ?`,
    [
      companyName,
      contactName,
      email,
      phone === undefined ? null : phone,
      input.taxNumber?.trim() || null,
      input.billingAddress?.trim() || null,
      input.billingPostalCode?.trim() || null,
      input.billingCity?.trim() || null,
      input.billingCountryCode?.toUpperCase() || "PT",
      input.notes?.trim() || null,
      nowIso(),
      customerId,
      organizationId,
    ],
  );

  await writeAudit({
    organizationId,
    actorId: actor.id,
    actorEmail: actor.email,
    action: "customer.updated",
    resourceType: "customer",
    resourceId: customerId,
    metadata: { fields: Object.keys(input).filter((key) => input[key as keyof UpdateCustomerInput] !== undefined) },
  });

  return { id: customerId };
}

export async function updateCustomerStatus(
  organizationId: string,
  customerId: string,
  status: "active" | "inactive" | "blocked",
  actor: SessionUser,
  database: Db = db(),
) {
  const customer = await database.get<{ id: string }>("SELECT id FROM customers WHERE id = ? AND organization_id = ?", [customerId, organizationId]);
  if (!customer) throw notFound("Cliente não encontrado");
  await database.run("UPDATE customers SET status = ?, updated_at = ? WHERE id = ?", [status, nowIso(), customerId]);
  await writeAudit(
    {
      organizationId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: "customer.status_changed",
      resourceType: "customer",
      resourceId: customerId,
      metadata: { status },
    },
    database,
  );
  return { id: customerId, status };
}

export interface CustomerRow {
  id: string;
  customer_type: string;
  company_name: string | null;
  contact_name: string;
  email: string;
  phone: string | null;
  tax_number: string | null;
  billing_city: string | null;
  billing_country_code: string;
  billing_address: string | null;
  billing_postal_code: string | null;
  notes: string | null;
  status: string;
  shipments: number;
  revenue_cents: number;
  created_at: string;
}

export async function listCustomers(organizationId: string, search: string | null, database: Db = db()): Promise<CustomerRow[]> {
  const params: (string | number)[] = [organizationId];
  const term = search?.trim();
  const where = term
    ? "AND (lower(c.company_name) LIKE ? OR lower(c.contact_name) LIKE ? OR lower(c.email) LIKE ? OR replace(COALESCE(c.phone,''),' ','') LIKE ?)"
    : "";
  if (term) {
    const like = `%${term.toLowerCase()}%`;
    const phoneLike = `%${term.replace(/[^\d+]/g, "")}%`;
    params.push(like, like, like, phoneLike);
  }
  return database.all<CustomerRow>(
    `SELECT c.id, c.customer_type, c.company_name, c.contact_name, c.email, c.phone, c.tax_number,
            c.billing_city, c.billing_country_code, c.billing_address, c.billing_postal_code, c.notes,
            c.status, c.created_at,
            (SELECT COUNT(*) FROM shipments s WHERE s.customer_id = c.id) AS shipments,
            (SELECT COALESCE(SUM(s.invoiced_cents), 0) FROM (
                SELECT COALESCE(final_amount_cents, quoted_amount_cents) AS invoiced_cents
                FROM shipments WHERE customer_id = c.id AND status = 'delivered'
             ) s) AS revenue_cents
     FROM customers c
     WHERE c.organization_id = ? ${where}
     ORDER BY c.created_at DESC
     LIMIT 200`,
    params,
  );
}

/* ─────────────────────────────── users ─────────────────────────────── */

const ASSIGNABLE_ROLES: Role[] = ["admin", "operations_manager", "dispatcher", "warehouse_operator", "driver", "finance", "customer"];

export interface CreateUserInput {
  email: string;
  fullName: string;
  phone?: string | null;
  role: Role;
  password: string;
  customerId?: string | null;
  licenceNumber?: string | null;
  licenceExpiry?: string | null;
}

export async function createUser(organizationId: string, input: CreateUserInput, actor: SessionUser, database: Db = db()) {
  if (!ASSIGNABLE_ROLES.includes(input.role)) throw validationError("Função não atribuível por este utilizador");
  if (actor.role !== "super_admin" && actor.role !== "admin") throw conflict("Sem permissão para criar utilizadores");
  if (input.role === "admin" && actor.role !== "super_admin" && actor.role !== "admin") throw conflict("Sem permissão");

  const email = input.email.trim().toLowerCase();
  const existing = await database.get<{ id: string }>("SELECT id FROM profiles WHERE organization_id = ? AND lower(email) = ?", [organizationId, email]);
  if (existing) throw conflict("Já existe um utilizador com este email nesta organização.");
  if (input.password.length < 10) throw validationError("A palavra-passe deve ter pelo menos 10 caracteres.");

  if (input.role === "customer" && !input.customerId) throw validationError("Contas de cliente exigem um cliente associado.");
  if (input.role === "driver" && !input.fullName) throw validationError("Motoristas exigem nome completo.");

  const id = newId();
  const now = nowIso();
  const passwordHash = await hashPassword(input.password);

  await database.transaction(async (tx) => {
    await tx.run(
      `INSERT INTO profiles (id, organization_id, auth_provider, email, password_hash, full_name, phone, role, status,
         customer_id, must_change_password, last_login_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,'active',?,1,NULL,?,?)`,
      [id, organizationId, "local", email, passwordHash, input.fullName.trim(), input.phone ?? null, input.role, input.customerId ?? null, now, now],
    );

    if (input.role === "driver") {
      await tx.run(
        `INSERT INTO drivers (id, organization_id, profile_id, licence_number, licence_expiry, status, created_at, updated_at)
         VALUES (?,?,?,?,?,'active',?,?)`,
        [newId(), organizationId, id, input.licenceNumber ?? null, input.licenceExpiry ?? null, now, now],
      );
    }

    await writeAudit(
      {
        organizationId,
        actorId: actor.id,
        actorEmail: actor.email,
        action: "user.created",
        resourceType: "profile",
        resourceId: id,
        metadata: { email, role: input.role },
      },
      tx,
    );
  });

  return { id, role: input.role };
}

export interface UserRow {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: string;
  status: string;
  last_login_at: string | null;
  created_at: string;
  customer_name: string | null;
  driver_id: string | null;
}

export async function listUsers(organizationId: string, database: Db = db()): Promise<UserRow[]> {
  return database.all<UserRow>(
    `SELECT p.id, p.email, p.full_name, p.phone, p.role, p.status, p.last_login_at, p.created_at,
            c.company_name AS customer_name, d.id AS driver_id
     FROM profiles p
     LEFT JOIN customers c ON c.id = p.customer_id
     LEFT JOIN drivers d ON d.profile_id = p.id
     WHERE p.organization_id = ?
     ORDER BY CASE p.role WHEN 'super_admin' THEN 0 WHEN 'admin' THEN 1 WHEN 'operations_manager' THEN 2 WHEN 'dispatcher' THEN 3
              WHEN 'warehouse_operator' THEN 4 WHEN 'driver' THEN 5 WHEN 'finance' THEN 6 ELSE 7 END, p.full_name`,
    [organizationId],
  );
}

export async function setUserStatus(
  organizationId: string,
  profileId: string,
  status: "active" | "suspended",
  actor: SessionUser,
  database: Db = db(),
) {
  if (profileId === actor.id) throw conflict("Não pode alterar o estado da própria conta.");
  const target = await database.get<{ id: string; role: string }>(
    "SELECT id, role FROM profiles WHERE id = ? AND organization_id = ?",
    [profileId, organizationId],
  );
  if (!target) throw notFound("Utilizador não encontrado");
  if (target.role === "super_admin") throw conflict("Contas super_admin não podem ser suspensas por esta via.");
  if (actor.role !== "super_admin" && target.role === "admin" && actor.role !== "admin") {
    throw conflict("Sem permissão para alterar administradores.");
  }

  await database.transaction(async (tx) => {
    await tx.run("UPDATE profiles SET status = ?, updated_at = ? WHERE id = ?", [status, nowIso(), profileId]);
    if (status === "suspended") {
      await tx.run("DELETE FROM sessions WHERE profile_id = ?", [profileId]);
    }
    await writeAudit(
      {
        organizationId,
        actorId: actor.id,
        actorEmail: actor.email,
        action: "user.status_changed",
        resourceType: "profile",
        resourceId: profileId,
        metadata: { status },
      },
      tx,
    );
  });

  return { id: profileId, status };
}

export async function countActiveSessions(profileId: string, database: Db = db()): Promise<number> {
  const row = await database.get<{ total: number }>(
    "SELECT COUNT(*) AS total FROM sessions WHERE profile_id = ? AND expires_at > ?",
    [profileId, nowIso()],
  );
  return Number(row?.total ?? 0);
}

export function roleLabel(role: string): string {
  return ROLE_LABELS[role as Role] ?? role;
}

export function permissionsOf(role: string): string[] {
  return permissionsForRole(role as Role);
}

/* ─────────────────────────────── fleet ─────────────────────────────── */

export interface VehicleRow {
  id: string;
  registration_number: string;
  vehicle_type: string;
  capacity_weight_kg: number;
  capacity_volume_m3: number;
  status: string;
  last_inspection_at: string | null;
  active_stops: number;
}

export async function listVehicles(organizationId: string, database: Db = db()): Promise<VehicleRow[]> {
  return database.all<VehicleRow>(
    `SELECT v.id, v.registration_number, v.vehicle_type, v.capacity_weight_kg, v.capacity_volume_m3, v.status,
            v.last_inspection_at,
            (SELECT COUNT(*) FROM route_stops rs JOIN routes r ON r.id = rs.route_id
              WHERE rs.vehicle_id = v.id AND r.status IN ('planned','dispatched','in_progress')) AS active_stops
     FROM vehicles v
     WHERE v.organization_id = ?
     ORDER BY v.registration_number`,
    [organizationId],
  );
}

export interface DriverRow {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  licence_number: string | null;
  licence_expiry: string | null;
  employment_status: string;
  status: string;
  active_routes: number;
  active_tasks: number;
  delivered_total: number;
}

export async function listDrivers(organizationId: string, database: Db = db()): Promise<DriverRow[]> {
  return database.all<DriverRow>(
    `SELECT d.id, p.full_name, p.email, p.phone, d.licence_number, d.licence_expiry,
            d.employment_status, p.status,
            (SELECT COUNT(DISTINCT rs.route_id) FROM route_stops rs JOIN routes r ON r.id = rs.route_id
              WHERE rs.driver_id = d.id AND r.status IN ('planned','dispatched','in_progress')) AS active_routes,
            (SELECT COUNT(*) FROM route_stops rs JOIN routes r ON r.id = rs.route_id
              WHERE rs.driver_id = d.id AND r.status IN ('planned','dispatched','in_progress')
                AND rs.status IN ('pending','en_route','arrived')) AS active_tasks,
            (SELECT COUNT(*) FROM route_stops rs JOIN shipments s ON s.id = rs.shipment_id
              WHERE rs.driver_id = d.id AND s.status = 'delivered') AS delivered_total
     FROM drivers d
     JOIN profiles p ON p.id = d.profile_id
     WHERE d.organization_id = ?
     ORDER BY p.full_name`,
    [organizationId],
  );
}

export async function setDriverStatus(
  organizationId: string,
  driverId: string,
  status: "active" | "on_leave" | "inactive",
  actor: SessionUser,
  database: Db = db(),
) {
  const driver = await database.get<{ id: string }>("SELECT id FROM drivers WHERE id = ? AND organization_id = ?", [driverId, organizationId]);
  if (!driver) throw notFound("Motorista não encontrado");
  await database.run("UPDATE drivers SET employment_status = ?, updated_at = ? WHERE id = ?", [status, nowIso(), driverId]);
  await writeAudit(
    {
      organizationId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: "driver.status_changed",
      resourceType: "driver",
      resourceId: driverId,
      metadata: { status },
    },
    database,
  );
  return { id: driverId, status };
}

/* ─────────────────────────────── audit ─────────────────────────────── */

export interface AuditLogRow {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  actor_email: string | null;
  metadata: string | null;
  created_at: string;
}

export async function listAuditLogs(organizationId: string, limit = 100, database: Db = db()): Promise<AuditLogRow[]> {
  return database.all<AuditLogRow>(
    `SELECT id, action, resource_type, resource_id, actor_email, metadata, created_at
     FROM audit_logs WHERE organization_id = ?
     ORDER BY created_at DESC LIMIT ?`,
    [organizationId, Math.min(Math.max(limit, 1), 500)],
  );
}

import "server-only";
import { db, type Db } from "@/lib/db";
import { newId, newTrackingCode, nowIso } from "@/lib/ids";
import { AppError, conflict, forbidden, notFound, validationError } from "@/lib/errors";
import { roleCanTransitionTo, type Role } from "@/lib/auth/rbac";
import type { SessionUser } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";
import { enqueueNotification, type NotificationTemplate } from "@/lib/notifications";
import {
  checkTransition,
  isShipmentStatus,
  nextStatuses,
  type ShipmentStatus,
} from "./shipment-status";
import type {
  AddressRow,
  CustomerRow,
  ProofOfDeliveryRow,
  ShipmentDto,
  ShipmentEventRow,
  ShipmentItemRow,
  ShipmentListRow,
  ShipmentRow,
} from "./types";
import type { CreateShipmentInput } from "@/lib/validation/schemas";

const money = (cents: number) => Math.round(cents) / 100;

export function toShipmentDto(row: ShipmentListRow | ShipmentRow): ShipmentDto {
  const list = row as ShipmentListRow;
  return {
    id: row.id,
    trackingCode: row.tracking_code,
    status: row.status,
    priority: row.priority,
    serviceType: row.service_type,
    customer: {
      id: row.customer_id,
      name: list.company_name ?? list.contact_name ?? "Cliente",
      email: list.customer_email ?? "",
    },
    origin: { city: list.origin_city ?? "", country: list.origin_country ?? "" },
    destination: { city: list.destination_city ?? "", country: list.destination_country ?? "" },
    requestedPickupAt: row.requested_pickup_at,
    estimatedDeliveryAt: row.estimated_delivery_at,
    actualDeliveryAt: row.actual_delivery_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    weightKg: row.total_weight_kg,
    volumeM3: row.volume_m3,
    currency: row.currency,
    quotedAmount: money(row.quoted_amount_cents),
    finalAmount: row.final_amount_cents === null ? null : money(row.final_amount_cents),
    exceptionReason: row.exception_reason,
  };
}

const SHIPMENT_LIST_SQL = `
  SELECT s.*, c.company_name, c.contact_name, c.email AS customer_email,
         oa.city AS origin_city, oa.country_code AS origin_country,
         da.city AS destination_city, da.country_code AS destination_country
  FROM shipments s
  JOIN customers c ON c.id = s.customer_id
  JOIN addresses oa ON oa.id = s.origin_address_id
  JOIN addresses da ON da.id = s.destination_address_id`;

export interface ListShipmentsInput {
  status?: string | null;
  search?: string | null;
  customerId?: string | null;
  driverId?: string | null;
  priority?: string | null;
  page: number;
  pageSize: number;
  orderBy: string;
}

export interface ShipmentScope {
  organizationId: string;
  /** customer role: only own shipments */
  restrictCustomerId?: string | null;
  /** driver role: only shipments on stops assigned to them */
  restrictDriverId?: string | null;
}

export async function listShipments(input: ListShipmentsInput, scope: ShipmentScope, database: Db = db()) {
  const where: string[] = ["s.organization_id = ?"];
  const params: (string | number | null)[] = [scope.organizationId];

  if (input.status && isShipmentStatus(input.status)) {
    where.push("s.status = ?");
    params.push(input.status);
  }
  if (input.priority) {
    where.push("s.priority = ?");
    params.push(input.priority);
  }
  if (input.customerId) {
    where.push("s.customer_id = ?");
    params.push(input.customerId);
  }
  if (scope.restrictCustomerId) {
    where.push("s.customer_id = ?");
    params.push(scope.restrictCustomerId);
  }
  if (scope.restrictDriverId || input.driverId) {
    where.push(
      "EXISTS (SELECT 1 FROM route_stops rs WHERE rs.shipment_id = s.id AND rs.driver_id = ? AND rs.status <> 'completed')",
    );
    params.push(scope.restrictDriverId ?? input.driverId ?? "");
  }
  if (input.search) {
    where.push("(lower(s.tracking_code) LIKE ? OR lower(c.contact_name) LIKE ? OR lower(coalesce(c.company_name,'')) LIKE ?)");
    const term = `%${input.search.toLowerCase().replace(/[%_]/g, "")}%`;
    params.push(term, term, term);
  }

  const whereSql = where.join(" AND ");
  const total = await database.get<{ c: number }>(
    `SELECT COUNT(*) AS c FROM shipments s JOIN customers c ON c.id = s.customer_id WHERE ${whereSql}`,
    params,
  );
  const rows = await database.all<ShipmentListRow>(
    `${SHIPMENT_LIST_SQL} WHERE ${whereSql} ORDER BY s.${input.orderBy} LIMIT ? OFFSET ?`,
    [...params, input.pageSize, (input.page - 1) * input.pageSize],
  );

  return {
    items: rows.map(toShipmentDto),
    total: Number(total?.c ?? 0),
    page: input.page,
    pageSize: input.pageSize,
    totalPages: Math.max(1, Math.ceil(Number(total?.c ?? 0) / input.pageSize)),
  };
}

export async function getShipmentById(id: string, organizationId: string, database: Db = db()): Promise<ShipmentListRow> {
  const row = await database.get<ShipmentListRow>(`${SHIPMENT_LIST_SQL} WHERE s.id = ? AND s.organization_id = ?`, [id, organizationId]);
  if (!row) throw notFound("Encomenda não encontrada");
  return row;
}

export interface ShipmentDetail {
  shipment: ShipmentDto;
  items: ShipmentItemRow[];
  events: (ShipmentEventRow & { actor_name: string | null })[];
  proofOfDelivery: (ProofOfDeliveryRow & { signedUrls?: { signature: string | null; photos: string[] } }) | null;
  origin: AddressRow;
  destination: AddressRow;
  customer: Pick<CustomerRow, "id" | "contact_name" | "company_name" | "email" | "phone">;
  assignment: { routeId: string; routeDate: string; driverName: string | null; vehicle: string | null } | null;
  allowedNextStatuses: ShipmentStatus[];
}

export async function getShipmentDetail(
  id: string,
  organizationId: string,
  options: { customerId?: string | null; driverId?: string | null } = {},
  database: Db = db(),
): Promise<ShipmentDetail> {
  const row = await getShipmentById(id, organizationId, database);

  // Resource-level access control for portal users and drivers.
  if (options.customerId && row.customer_id !== options.customerId) throw notFound("Encomenda não encontrada");
  if (options.driverId) {
    const assigned = await database.get<{ id: string }>(
      "SELECT id FROM route_stops WHERE shipment_id = ? AND driver_id = ?",
      [id, options.driverId],
    );
    if (!assigned) throw notFound("Encomenda não encontrada");
  }

  const [items, events, pod, origin, destination, customer, assignment] = await Promise.all([
    database.all<ShipmentItemRow>("SELECT * FROM shipment_items WHERE shipment_id = ? ORDER BY created_at ASC", [id]),
    database.all<ShipmentEventRow & { actor_name: string | null }>(
      `SELECT e.*, p.full_name AS actor_name FROM shipment_events e
       LEFT JOIN profiles p ON p.id = e.actor_id
       WHERE e.shipment_id = ? ORDER BY e.occurred_at DESC`,
      [id],
    ),
    database.get<ProofOfDeliveryRow>("SELECT * FROM proof_of_delivery WHERE shipment_id = ?", [id]),
    database.get<AddressRow>("SELECT * FROM addresses WHERE id = ?", [row.origin_address_id]),
    database.get<AddressRow>("SELECT * FROM addresses WHERE id = ?", [row.destination_address_id]),
    database.get<CustomerRow>("SELECT * FROM customers WHERE id = ?", [row.customer_id]),
    database.get<{ route_id: string; route_date: string; driver_name: string | null; registration_number: string | null }>(
      `SELECT r.id AS route_id, r.route_date, p.full_name AS driver_name, v.registration_number
       FROM route_stops rs
       JOIN routes r ON r.id = rs.route_id
       LEFT JOIN drivers d ON d.id = rs.driver_id
       LEFT JOIN profiles p ON p.id = d.profile_id
       LEFT JOIN vehicles v ON v.id = rs.vehicle_id
       WHERE rs.shipment_id = ? ORDER BY r.route_date DESC`,
      [id],
    ),
  ]);

  return {
    shipment: toShipmentDto(row),
    items,
    events,
    proofOfDelivery: pod ?? null,
    origin: origin as AddressRow,
    destination: destination as AddressRow,
    customer: customer
      ? { id: customer.id, contact_name: customer.contact_name, company_name: customer.company_name, email: customer.email, phone: customer.phone }
      : { id: "", contact_name: "", company_name: null, email: "", phone: null },
    assignment: assignment
      ? { routeId: assignment.route_id, routeDate: assignment.route_date, driverName: assignment.driver_name, vehicle: assignment.registration_number }
      : null,
    allowedNextStatuses: nextStatuses(row.status),
  };
}

async function resolveCustomer(database: Db, customerId: string, organizationId: string): Promise<CustomerRow> {
  const customer = await database.get<CustomerRow>("SELECT * FROM customers WHERE id = ? AND organization_id = ?", [customerId, organizationId]);
  if (!customer) throw validationError("Cliente inválido ou inexistente");
  if (customer.status !== "active") throw conflict("Cliente não está ativo");
  return customer;
}

async function insertAddress(database: Db, organizationId: string, customerId: string | null, input: CreateShipmentInput["origin"]): Promise<string> {
  const id = newId();
  await database.run(
    `INSERT INTO addresses (id, organization_id, customer_id, label, address_line, postal_code, city, region, country_code, latitude, longitude, validated_at, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id,
      organizationId,
      customerId,
      input.label || null,
      input.addressLine,
      input.postalCode || null,
      input.city,
      input.region || null,
      input.countryCode,
      input.latitude ?? null,
      input.longitude ?? null,
      input.latitude !== undefined && input.longitude !== undefined ? nowIso() : null,
      nowIso(),
    ],
  );
  return id;
}

export interface CreateShipmentResult {
  id: string;
  trackingCode: string;
}

export async function createShipment(
  input: CreateShipmentInput,
  user: SessionUser,
  meta: { ip?: string | null } = {},
  database: Db = db(),
): Promise<CreateShipmentResult> {
  const customer = await resolveCustomer(database, input.customerId, user.organizationId);

  // Customer self-service creates a *request* (pending_quote). Staff may create
  // either a request or a confirmed order, but never skip the quote stage from
  // the public portal.
  const isCustomer = user.role === "customer";
  if (isCustomer && customer.id !== user.customerId) {
    throw forbidden("Só pode criar pedidos para a sua própria conta.");
  }
  if (isCustomer && !user.permissions.includes("shipments:request")) {
    throw forbidden("A sua conta não pode criar pedidos.");
  }
  const initialStatus: ShipmentStatus = isCustomer ? "pending_quote" : "pending_quote";

  const totalWeight = input.items.reduce((sum, item) => sum + item.weightKg * item.quantity, 0);
  const totalVolume = input.items.reduce((sum, item) => {
    if (!item.lengthCm || !item.widthCm || !item.heightCm) return sum;
    return sum + (item.lengthCm * item.widthCm * item.heightCm * item.quantity) / 1_000_000;
  }, 0);

  return database.transaction(async (tx) => {
    if (input.idempotencyKey) {
      const existing = await tx.get<{ response_body: string | null }>(
        "SELECT response_body FROM idempotency_keys WHERE scope = ? AND key = ?",
        [`shipment.create:${user.organizationId}`, input.idempotencyKey],
      );
      if (existing?.response_body) {
        return JSON.parse(existing.response_body) as CreateShipmentResult;
      }
    }

    const originId = await insertAddress(tx, user.organizationId, customer.id, input.origin);
    const destinationId = await insertAddress(tx, user.organizationId, customer.id, input.destination);

    let trackingCode = newTrackingCode();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const clash = await tx.get<{ id: string }>("SELECT id FROM shipments WHERE tracking_code = ?", [trackingCode]);
      if (!clash) break;
      trackingCode = newTrackingCode();
    }

    const id = newId();
    const now = nowIso();
    await tx.run(
      `INSERT INTO shipments (id, organization_id, tracking_code, customer_id, origin_address_id, destination_address_id, service_type, status, priority,
        requested_pickup_at, estimated_delivery_at, actual_delivery_at, total_weight_kg, volume_m3, currency, quoted_amount_cents, final_amount_cents,
        notes, exception_reason, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id, user.organizationId, trackingCode, customer.id, originId, destinationId, input.serviceType, initialStatus, input.priority,
        input.requestedPickupAt || null, input.estimatedDeliveryAt || null, null,
        Math.round(totalWeight * 100) / 100, Math.round(totalVolume * 1000) / 1000, "EUR",
        // 0 means "not priced yet": a customer request must never inherit a made-up amount.
        Math.max(0, Math.round(input.quotedAmountCents ?? 0)), null,
        input.notes || null, null, user.id, now, now,
      ],
    );

    for (const item of input.items) {
      await tx.run(
        `INSERT INTO shipment_items (id, shipment_id, description, quantity, weight_kg, length_cm, width_cm, height_cm, declared_value_cents, handling_instructions, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [
          newId(), id, item.description, item.quantity, item.weightKg,
          item.lengthCm ?? null, item.widthCm ?? null, item.heightCm ?? null,
          item.declaredValueCents ?? null, item.handlingInstructions || null, now,
        ],
      );
    }

    await tx.run(
      `INSERT INTO shipment_events (id, shipment_id, event_type, previous_status, new_status, description, location, latitude, longitude, actor_id, occurred_at, metadata)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        newId(), id, "created", null, initialStatus,
        isCustomer ? "Pedido de transporte submetido pelo cliente" : "Encomenda criada",
        input.origin.city, input.origin.latitude ?? null, input.origin.longitude ?? null, user.id, now, null,
      ],
    );

    await enqueueNotification(tx, {
      organizationId: user.organizationId,
      recipient: customer.email,
      channel: "email",
      template: "shipment.created",
      subject: `VELTRIX — pedido ${trackingCode} registado`,
      body: `A encomenda ${trackingCode} foi registada e aguarda confirmação. Acompanhe em ${process.env.APP_URL ?? "http://localhost:3000"}/tracking/${trackingCode}.`,
      dedupeKey: `created:${id}`,
    });

    const result = { id, trackingCode };
    if (input.idempotencyKey) {
      await tx.run(
        `INSERT INTO idempotency_keys (id, scope, key, request_hash, response_status, response_body, created_at)
         VALUES (?,?,?,?,?,?,?)
         ON CONFLICT (scope, key) DO NOTHING`,
        [newId(), `shipment.create:${user.organizationId}`, input.idempotencyKey, null, 201, JSON.stringify(result), now],
      );
    }

    await writeAudit(
      {
        organizationId: user.organizationId,
        actorId: user.id,
        actorEmail: user.email,
        action: "shipment.created",
        resourceType: "shipment",
        resourceId: id,
        metadata: { trackingCode, serviceType: input.serviceType, weightKg: totalWeight },
        ip: meta.ip,
      },
      tx,
    );

    return result;
  });
}

export interface TransitionInput {
  shipmentId: string;
  toStatus: ShipmentStatus;
  description?: string;
  location?: string;
  latitude?: number | null;
  longitude?: number | null;
  override?: boolean;
  justification?: string;
}

const NOTIFICATION_BY_STATUS: Partial<Record<ShipmentStatus, NotificationTemplate>> = {
  confirmed: "shipment.confirmed",
  picked_up: "shipment.picked_up",
  in_transit: "shipment.in_transit",
  delivered: "shipment.delivered",
  exception: "shipment.exception",
};

/** Applies a status change with every operational safeguard in one transaction. */
export async function transitionShipment(input: TransitionInput, user: SessionUser, meta: { ip?: string | null } = {}, database: Db = db()) {
  return database.transaction(async (tx) => {
    const shipment = await tx.get<ShipmentRow>("SELECT * FROM shipments WHERE id = ? AND organization_id = ?", [input.shipmentId, user.organizationId]);
    if (!shipment) throw notFound("Encomenda não encontrada");

    // A driver may only act on shipments assigned to them. Checked here (not only
    // in the UI) so a crafted request cannot change someone else's delivery.
    if (user.role === "driver") {
      if (!user.driverId) throw forbidden("Perfil de motorista não associado.");
      const assigned = await tx.get<{ id: string }>(
        "SELECT rs.id FROM route_stops rs WHERE rs.shipment_id = ? AND rs.driver_id = ? LIMIT 1",
        [shipment.id, user.driverId],
      );
      if (!assigned) throw notFound("Encomenda não encontrada");
    }

    const pod = await tx.get<{ id: string }>("SELECT id FROM proof_of_delivery WHERE shipment_id = ?", [shipment.id]);
    const decision = checkTransition({
      from: shipment.status,
      to: input.toStatus,
      role: user.role,
      hasProofOfDelivery: Boolean(pod),
      override: input.override,
      justification: input.justification,
      roleAllows: (to) => roleCanTransitionTo(user.role as Role, to),
    });

    if (!decision.allowed) {
      throw conflict(decision.reason ?? "Transição não permitida", { requiresOverride: decision.requiresOverride });
    }

    const now = nowIso();
    const exceptionStatuses: ShipmentStatus[] = ["exception", "failed_delivery"];
    const exceptionReason = exceptionStatuses.includes(input.toStatus)
      ? (input.justification?.trim() || input.description?.trim() || shipment.exception_reason || "Ocorrência registada")
      : null;

    await tx.run(
      `UPDATE shipments SET status = ?, updated_at = ?,
         actual_delivery_at = CASE WHEN ? = 'delivered' THEN ? ELSE actual_delivery_at END,
         exception_reason = ?
       WHERE id = ? AND organization_id = ?`,
      [input.toStatus, now, input.toStatus, now, exceptionReason, shipment.id, user.organizationId],
    );

    await tx.run(
      `INSERT INTO shipment_events (id, shipment_id, event_type, previous_status, new_status, description, location, latitude, longitude, actor_id, occurred_at, metadata)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        newId(), shipment.id, decision.requiresOverride ? "status_override" : "status_change",
        shipment.status, input.toStatus,
        input.justification?.trim() || input.description?.trim() || null,
        input.location ?? null, input.latitude ?? null, input.longitude ?? null,
        user.id, now,
        decision.requiresOverride ? JSON.stringify({ override: true, justification: input.justification ?? null }) : null,
      ],
    );

    const template = NOTIFICATION_BY_STATUS[input.toStatus];
    if (template) {
      const customer = await tx.get<{ email: string; contact_name: string }>("SELECT email, contact_name FROM customers WHERE id = ?", [shipment.customer_id]);
      if (customer?.email) {
        await enqueueNotification(tx, {
          organizationId: user.organizationId,
          recipient: customer.email,
          channel: "email",
          template,
          subject: `VELTRIX — encomenda ${shipment.tracking_code}: ${input.toStatus}`,
          body: `Olá ${customer.contact_name}, a encomenda ${shipment.tracking_code} passou ao estado "${input.toStatus}".`,
          dedupeKey: `${template}:${shipment.id}:${now}`,
        });
      }
    }

    await writeAudit(
      {
        organizationId: user.organizationId,
        actorId: user.id,
        actorEmail: user.email,
        action: decision.requiresOverride ? "shipment.status_override" : "shipment.status_changed",
        resourceType: "shipment",
        resourceId: shipment.id,
        metadata: { from: shipment.status, to: input.toStatus, justification: input.justification ?? null },
        ip: meta.ip,
      },
      tx,
    );

    return { id: shipment.id, from: shipment.status, to: input.toStatus, override: decision.requiresOverride };
  });
}

export async function assignShipment(
  shipmentId: string,
  input: { driverId: string; vehicleId?: string | null; routeId?: string | null; routeDate?: string },
  user: SessionUser,
  meta: { ip?: string | null } = {},
  database: Db = db(),
) {
  return database.transaction(async (tx) => {
    const shipment = await tx.get<ShipmentRow>("SELECT * FROM shipments WHERE id = ? AND organization_id = ?", [shipmentId, user.organizationId]);
    if (!shipment) throw notFound("Encomenda não encontrada");

    const driver = await tx.get<{ id: string; employment_status: string; profile_id: string }>(
      "SELECT id, employment_status, profile_id FROM drivers WHERE id = ? AND organization_id = ?",
      [input.driverId, user.organizationId],
    );
    if (!driver) throw validationError("Motorista inválido");
    if (driver.employment_status !== "active") throw conflict("Motorista não está ativo");

    let vehicle: { id: string; capacity_weight_kg: number; capacity_volume_m3: number; status: string } | undefined;
    if (input.vehicleId) {
      vehicle = await tx.get<{ id: string; capacity_weight_kg: number; capacity_volume_m3: number; status: string }>(
        "SELECT id, capacity_weight_kg, capacity_volume_m3, status FROM vehicles WHERE id = ? AND organization_id = ?",
        [input.vehicleId, user.organizationId],
      );
      if (!vehicle) throw validationError("Veículo inválido");
      if (vehicle.status === "maintenance" || vehicle.status === "retired") throw conflict("Veículo indisponível");
      if (vehicle.capacity_weight_kg < shipment.total_weight_kg) {
        throw conflict(
          `Capacidade insuficiente: carga ${shipment.total_weight_kg} kg > capacidade ${vehicle.capacity_weight_kg} kg`,
        );
      }
      if (vehicle.capacity_volume_m3 < shipment.volume_m3) {
        throw conflict(`Volume insuficiente: ${shipment.volume_m3} m³ > ${vehicle.capacity_volume_m3} m³`);
      }
    }

    const routeDate = input.routeDate ?? shipment.estimated_delivery_at?.slice(0, 10) ?? nowIso().slice(0, 10);
    let routeId = input.routeId ?? null;
    if (!routeId) {
      const existing = await tx.get<{ id: string }>(
        "SELECT id FROM routes WHERE organization_id = ? AND route_date = ? AND status IN ('draft','planned') ORDER BY created_at ASC",
        [user.organizationId, routeDate],
      );
      if (existing) {
        routeId = existing.id;
      } else {
        routeId = newId();
        await tx.run(
          `INSERT INTO routes (id, organization_id, route_date, name, status, planned_distance_km, planned_duration_min, created_by, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [routeId, user.organizationId, routeDate, `Rota ${routeDate}`, "planned", null, null, user.id, nowIso(), nowIso()],
        );
      }
    }

    const maxSeq = await tx.get<{ m: number | null }>("SELECT MAX(sequence_number) AS m FROM route_stops WHERE route_id = ?", [routeId]);
    const sequence = Number(maxSeq?.m ?? 0) + 1;
    const destination = await tx.get<AddressRow>("SELECT * FROM addresses WHERE id = ?", [shipment.destination_address_id]);

    await tx.run(
      `INSERT INTO route_stops (id, route_id, shipment_id, driver_id, vehicle_id, sequence_number, stop_type, planned_arrival_at, actual_arrival_at, status, latitude, longitude, notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        newId(), routeId, shipment.id, driver.id, vehicle?.id ?? null, sequence, "delivery",
        shipment.estimated_delivery_at, null, "pending", destination?.latitude ?? null, destination?.longitude ?? null, null,
      ],
    );

    if (shipment.status === "confirmed") {
      await tx.run("UPDATE shipments SET status = 'assigned', updated_at = ? WHERE id = ?", [nowIso(), shipment.id]);
      await tx.run(
        `INSERT INTO shipment_events (id, shipment_id, event_type, previous_status, new_status, description, location, latitude, longitude, actor_id, occurred_at, metadata)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [newId(), shipment.id, "assigned", "confirmed", "assigned", "Atribuída a motorista e veículo", null, null, null, user.id, nowIso(), null],
      );
    }

    await writeAudit(
      {
        organizationId: user.organizationId,
        actorId: user.id,
        actorEmail: user.email,
        action: "shipment.assigned",
        resourceType: "shipment",
        resourceId: shipment.id,
        metadata: { driverId: driver.id, vehicleId: vehicle?.id ?? null, routeId },
        ip: meta.ip,
      },
      tx,
    );

    return { routeId, sequence, driverId: driver.id, shipmentStatus: shipment.status === "confirmed" ? "assigned" : shipment.status };
  });
}

export async function submitProofOfDelivery(
  shipmentId: string,
  input: { receivedBy: string; notes?: string; latitude?: number | null; longitude?: number | null; signaturePath?: string | null; photoPaths?: string[] },
  user: SessionUser,
  meta: { ip?: string | null } = {},
  database: Db = db(),
) {
  return database.transaction(async (tx) => {
    const shipment = await tx.get<ShipmentRow>("SELECT * FROM shipments WHERE id = ? AND organization_id = ?", [shipmentId, user.organizationId]);
    if (!shipment) throw notFound("Encomenda não encontrada");
    if (shipment.status === "delivered") throw conflict("A entrega já foi confirmada");
    if (shipment.status === "cancelled") throw conflict("Encomenda cancelada");

    if (user.role === "driver") {
      if (!user.driverId) throw forbidden("Perfil de motorista não associado.");
      const assigned = await tx.get<{ id: string }>("SELECT id FROM route_stops WHERE shipment_id = ? AND driver_id = ?", [shipmentId, user.driverId]);
      if (!assigned) throw notFound("Encomenda não atribuída a este motorista");
    }
    // Proof is only accepted while the shipment is physically with the courier.
    if (!["in_transit", "out_for_delivery", "assigned"].includes(shipment.status)) {
      throw conflict(`A prova de entrega só pode ser registada com a encomenda em curso (estado atual: ${shipment.status}).`);
    }

    if (!input.receivedBy.trim()) throw validationError("Indique quem recebeu a encomenda");
    const deliveredAt = nowIso();
    await tx.run(
      `INSERT INTO proof_of_delivery (id, shipment_id, received_by, signature_path, photo_paths, notes, latitude, longitude, delivered_at, submitted_by)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        newId(), shipmentId, input.receivedBy.trim().slice(0, 120), input.signaturePath ?? null,
        JSON.stringify(input.photoPaths ?? []), input.notes?.trim() || null,
        input.latitude ?? null, input.longitude ?? null, deliveredAt, user.id,
      ],
    );

    await tx.run("UPDATE shipments SET status = 'delivered', actual_delivery_at = ?, updated_at = ? WHERE id = ?", [deliveredAt, deliveredAt, shipmentId]);
    await tx.run(
      `INSERT INTO shipment_events (id, shipment_id, event_type, previous_status, new_status, description, location, latitude, longitude, actor_id, occurred_at, metadata)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [newId(), shipmentId, "delivery_confirmed", shipment.status, "delivered", `Entregue a ${input.receivedBy.trim().slice(0, 80)}`, null, input.latitude ?? null, input.longitude ?? null, user.id, deliveredAt, null],
    );
    await tx.run("UPDATE route_stops SET status = 'completed', actual_arrival_at = ? WHERE shipment_id = ?", [deliveredAt, shipmentId]);

    const customer = await tx.get<{ email: string; contact_name: string }>("SELECT email, contact_name FROM customers WHERE id = ?", [shipment.customer_id]);
    if (customer?.email) {
      await enqueueNotification(tx, {
        organizationId: user.organizationId,
        recipient: customer.email,
        channel: "email",
        template: "shipment.delivered",
        subject: `VELTRIX — encomenda ${shipment.tracking_code} entregue`,
        body: `A encomenda ${shipment.tracking_code} foi entregue e a prova de entrega está disponível no portal.`,
        dedupeKey: `delivered:${shipmentId}`,
      });
    }

    await writeAudit(
      {
        organizationId: user.organizationId,
        actorId: user.id,
        actorEmail: user.email,
        action: "pod.submitted",
        resourceType: "shipment",
        resourceId: shipmentId,
        metadata: { receivedBy: input.receivedBy.slice(0, 40), photos: input.photoPaths?.length ?? 0 },
        ip: meta.ip,
      },
      tx,
    );

    return { deliveredAt };
  });
}

/** Driver task list: only assigned stops, newest route first. */
export async function listDriverTasks(driverId: string, organizationId: string, database: Db = db()) {
  const rows = await database.all<{
    stop_id: string;
    route_id: string;
    route_date: string;
    sequence_number: number;
    stop_status: string;
    shipment_id: string;
    tracking_code: string;
    shipment_status: ShipmentStatus;
    priority: string;
    service_type: string;
    contact_name: string;
    company_name: string | null;
    phone: string | null;
    address_line: string;
    city: string;
    postal_code: string | null;
    country_code: string;
    latitude: number | null;
    longitude: number | null;
    estimated_delivery_at: string | null;
    weight_kg: number;
    registration_number: string | null;
  }>(
    `SELECT rs.id AS stop_id, rs.route_id, r.route_date, rs.sequence_number, rs.status AS stop_status,
            s.id AS shipment_id, s.tracking_code, s.status AS shipment_status, s.priority, s.service_type,
            c.contact_name, c.company_name, c.phone,
            a.address_line, a.city, a.postal_code, a.country_code, a.latitude, a.longitude,
            s.estimated_delivery_at, s.total_weight_kg AS weight_kg, v.registration_number
     FROM route_stops rs
     JOIN routes r ON r.id = rs.route_id
     JOIN shipments s ON s.id = rs.shipment_id
     JOIN customers c ON c.id = s.customer_id
     JOIN addresses a ON a.id = s.destination_address_id
     LEFT JOIN vehicles v ON v.id = rs.vehicle_id
     WHERE rs.driver_id = ? AND r.organization_id = ? AND rs.status IN ('pending','en_route','arrived')
     ORDER BY r.route_date ASC, rs.sequence_number ASC`,
    [driverId, organizationId],
  );

  return rows.map((row) => ({
    stopId: row.stop_id,
    routeId: row.route_id,
    routeDate: row.route_date,
    sequence: row.sequence_number,
    stopStatus: row.stop_status,
    shipmentId: row.shipment_id,
    trackingCode: row.tracking_code,
    shipmentStatus: row.shipment_status,
    priority: row.priority,
    serviceType: row.service_type,
    customerName: row.company_name ?? row.contact_name,
    contactName: row.contact_name,
    phone: row.phone,
    address: { line: row.address_line, city: row.city, postalCode: row.postal_code, country: row.country_code },
    coordinates: row.latitude !== null && row.longitude !== null ? { lat: row.latitude, lng: row.longitude } : null,
    estimatedDeliveryAt: row.estimated_delivery_at,
    weightKg: row.weight_kg,
    vehicle: row.registration_number,
  }));
}

export async function updateStopStatus(stopId: string, status: "en_route" | "arrived" | "completed" | "failed", user: SessionUser, database: Db = db()) {
  return database.transaction(async (tx) => {
    const stop = await tx.get<{ id: string; driver_id: string | null; shipment_id: string }>(
      "SELECT id, driver_id, shipment_id FROM route_stops WHERE id = ?",
      [stopId],
    );
    if (!stop) throw notFound("Paragem não encontrada");
    if (user.role === "driver" && stop.driver_id !== user.driverId) throw forbidden("Paragem não atribuída a este motorista");
    const now = nowIso();
    await tx.run("UPDATE route_stops SET status = ?, actual_arrival_at = CASE WHEN ? = 'arrived' THEN ? ELSE actual_arrival_at END WHERE id = ?", [
      status, status, now, stopId,
    ]);
    await writeAudit(
      {
        organizationId: user.organizationId,
        actorId: user.id,
        actorEmail: user.email,
        action: "route.stop_status_changed",
        resourceType: "route_stop",
        resourceId: stopId,
        metadata: { status },
      },
      tx,
    );
    return { id: stopId, status };
  });
}

/** Adds a manual event (e.g. warehouse custody change) without changing status. */
export async function addShipmentEvent(
  shipmentId: string,
  input: { eventType: string; description: string; location?: string; latitude?: number | null; longitude?: number | null },
  user: SessionUser,
  database: Db = db(),
) {
  const shipment = await database.get<ShipmentRow>("SELECT * FROM shipments WHERE id = ? AND organization_id = ?", [shipmentId, user.organizationId]);
  if (!shipment) throw notFound("Encomenda não encontrada");
  const id = newId();
  await database.run(
    `INSERT INTO shipment_events (id, shipment_id, event_type, previous_status, new_status, description, location, latitude, longitude, actor_id, occurred_at, metadata)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, shipmentId, input.eventType.slice(0, 60), shipment.status, shipment.status, input.description.slice(0, 500), input.location ?? null, input.latitude ?? null, input.longitude ?? null, user.id, nowIso(), null],
  );
  await writeAudit({
    organizationId: user.organizationId,
    actorId: user.id,
    actorEmail: user.email,
    action: "shipment.event_added",
    resourceType: "shipment",
    resourceId: shipmentId,
    metadata: { eventType: input.eventType },
  });
  return { id };
}

export function assertShipmentTransitionAllowed(shipment: ShipmentRow, toStatus: ShipmentStatus): void {
  if (!(nextStatuses(shipment.status) as string[]).includes(toStatus)) {
    throw new AppError("Transição inválida", 409, "invalid_transition");
  }
}

import "server-only";
import { db, type Db } from "@/lib/db";
import { newId, nowIso } from "@/lib/ids";
import { conflict, notFound, validationError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth/session";
import { haversineKm, type LatLng } from "@/lib/routing/geo";
import { routeBetween, type RouteResult } from "@/lib/routing/provider";

const PRIORITY_WEIGHT: Record<string, number> = { urgent: 0.45, high: 0.7, normal: 1, low: 1.5 };

export interface RouteListRow {
  id: string;
  route_date: string;
  name: string | null;
  status: string;
  planned_distance_km: number | null;
  planned_duration_min: number | null;
  stops: number;
  completed_stops: number;
  driver_name: string | null;
  vehicle: string | null;
}

export async function listRoutes(organizationId: string, database: Db = db()): Promise<RouteListRow[]> {
  return database.all<RouteListRow>(
    `SELECT r.id, r.route_date, r.name, r.status, r.planned_distance_km, r.planned_duration_min,
            (SELECT COUNT(*) FROM route_stops rs WHERE rs.route_id = r.id) AS stops,
            (SELECT COUNT(*) FROM route_stops rs WHERE rs.route_id = r.id AND rs.status = 'completed') AS completed_stops,
            (SELECT p.full_name FROM route_stops rs JOIN drivers d ON d.id = rs.driver_id JOIN profiles p ON p.id = d.profile_id
              WHERE rs.route_id = r.id LIMIT 1) AS driver_name,
            (SELECT v.registration_number FROM route_stops rs JOIN vehicles v ON v.id = rs.vehicle_id
              WHERE rs.route_id = r.id LIMIT 1) AS vehicle
     FROM routes r WHERE r.organization_id = ?
     ORDER BY r.route_date DESC, r.created_at DESC LIMIT 100`,
    [organizationId],
  );
}

export interface RouteStopDetail {
  id: string;
  sequenceNumber: number;
  shipmentId: string;
  trackingCode: string;
  shipmentStatus: string;
  priority: string;
  city: string;
  postalCode: string | null;
  countryCode: string;
  weightKg: number;
  volumeM3: number;
  plannedArrivalAt: string | null;
  status: string;
  latitude: number | null;
  longitude: number | null;
}

export interface RouteDetail {
  route: {
    id: string;
    routeDate: string;
    name: string | null;
    status: string;
    plannedDistanceKm: number | null;
    plannedDurationMin: number | null;
  };
  stops: RouteStopDetail[];
  capacity: {
    vehicle: string | null;
    maxWeightKg: number | null;
    maxVolumeM3: number | null;
    loadWeightKg: number;
    loadVolumeM3: number;
    withinCapacity: boolean;
  };
}

export async function getRouteDetail(routeId: string, organizationId: string, database: Db = db()): Promise<RouteDetail> {
  const route = await database.get<{
    id: string; organization_id: string; route_date: string; name: string | null; status: string;
    planned_distance_km: number | null; planned_duration_min: number | null;
  }>("SELECT * FROM routes WHERE id = ? AND organization_id = ?", [routeId, organizationId]);
  if (!route) throw notFound("Rota não encontrada");

  const stops = await database.all<RouteStopDetail & { organization_id: string }>(
    `SELECT rs.id, rs.sequence_number AS sequenceNumber, rs.shipment_id AS shipmentId, s.tracking_code AS trackingCode,
            s.status AS shipmentStatus, s.priority, a.city, a.postal_code AS postalCode, a.country_code AS countryCode,
            s.total_weight_kg AS weightKg, s.volume_m3 AS volumeM3, rs.planned_arrival_at AS plannedArrivalAt,
            rs.status, rs.latitude, rs.longitude
     FROM route_stops rs
     JOIN shipments s ON s.id = rs.shipment_id
     JOIN addresses a ON a.id = s.destination_address_id
     WHERE rs.route_id = ? ORDER BY rs.sequence_number ASC`,
    [routeId],
  );

  const vehicle = await database.get<{ registration_number: string; capacity_weight_kg: number; capacity_volume_m3: number }>(
    `SELECT v.registration_number, v.capacity_weight_kg, v.capacity_volume_m3
     FROM route_stops rs JOIN vehicles v ON v.id = rs.vehicle_id WHERE rs.route_id = ? LIMIT 1`,
    [routeId],
  );

  const loadWeight = stops.reduce((sum, stop) => sum + Number(stop.weightKg), 0);
  const loadVolume = stops.reduce((sum, stop) => sum + Number(stop.volumeM3), 0);

  return {
    route: {
      id: route.id,
      routeDate: route.route_date,
      name: route.name,
      status: route.status,
      plannedDistanceKm: route.planned_distance_km,
      plannedDurationMin: route.planned_duration_min,
    },
    stops,
    capacity: {
      vehicle: vehicle?.registration_number ?? null,
      maxWeightKg: vehicle?.capacity_weight_kg ?? null,
      maxVolumeM3: vehicle?.capacity_volume_m3 ?? null,
      loadWeightKg: Math.round(loadWeight * 100) / 100,
      loadVolumeM3: Math.round(loadVolume * 1000) / 1000,
      withinCapacity:
        !vehicle || (loadWeight <= vehicle.capacity_weight_kg && loadVolume <= vehicle.capacity_volume_m3),
    },
  };
}

export interface CreateRouteInput {
  routeDate: string;
  name?: string;
  driverId?: string | null;
  vehicleId?: string | null;
  shipmentIds: string[];
}

export async function createRoute(input: CreateRouteInput, user: SessionUser, database: Db = db()) {
  return database.transaction(async (tx) => {
    const routeId = newId();
    const now = nowIso();

    const shipments = [] as {
      id: string; tracking_code: string; status: string; priority: string; total_weight_kg: number; volume_m3: number;
      latitude: number | null; longitude: number | null; city: string;
    }[];
    for (const shipmentId of input.shipmentIds) {
      const shipment = await tx.get<{
        id: string; tracking_code: string; status: string; priority: string; total_weight_kg: number; volume_m3: number;
        latitude: number | null; longitude: number | null; city: string;
      }>(
        `SELECT s.id, s.tracking_code, s.status, s.priority, s.total_weight_kg, s.volume_m3,
                a.latitude, a.longitude, a.city
         FROM shipments s JOIN addresses a ON a.id = s.destination_address_id
         WHERE s.id = ? AND s.organization_id = ?`,
        [shipmentId, user.organizationId],
      );
      if (!shipment) throw validationError("Encomenda inexistente na organização");
      if (!["confirmed", "assigned"].includes(shipment.status)) {
        throw conflict(`A encomenda ${shipment.tracking_code} não está em estado planificável (${shipment.status}).`);
      }
      const alreadyAssigned = await tx.get<{ id: string }>(
        `SELECT rs.id FROM route_stops rs JOIN routes r ON r.id = rs.route_id
         WHERE rs.shipment_id = ? AND r.status IN ('draft','planned','dispatched','in_progress')`,
        [shipmentId],
      );
      if (alreadyAssigned) throw conflict(`A encomenda ${shipment.tracking_code} já está numa rota ativa.`);
      shipments.push(shipment);
    }

    let vehicle: { capacity_weight_kg: number; capacity_volume_m3: number } | undefined;
    if (input.vehicleId) {
      vehicle = await tx.get<{ capacity_weight_kg: number; capacity_volume_m3: number }>(
        "SELECT capacity_weight_kg, capacity_volume_m3 FROM vehicles WHERE id = ? AND organization_id = ? AND status <> 'retired'",
        [input.vehicleId, user.organizationId],
      );
      if (!vehicle) throw validationError("Veículo inválido");
      const totalWeight = shipments.reduce((sum, s) => sum + Number(s.total_weight_kg), 0);
      const totalVolume = shipments.reduce((sum, s) => sum + Number(s.volume_m3), 0);
      if (totalWeight > vehicle.capacity_weight_kg) {
        throw conflict(`Carga de ${Math.round(totalWeight)} kg excede a capacidade de ${vehicle.capacity_weight_kg} kg do veículo.`);
      }
      if (totalVolume > vehicle.capacity_volume_m3) {
        throw conflict(`Volume de ${Math.round(totalVolume * 100) / 100} m³ excede a capacidade de ${vehicle.capacity_volume_m3} m³.`);
      }
    }

    const sequenced = sequenceStops(shipments, null);
    await tx.run(
      `INSERT INTO routes (id, organization_id, route_date, name, status, planned_distance_km, planned_duration_min, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [routeId, user.organizationId, input.routeDate, input.name || `Rota ${input.routeDate}`, "planned", null, null, user.id, now, now],
    );

    let sequence = 1;
    for (const shipment of sequenced) {
      await tx.run(
        `INSERT INTO route_stops (id, route_id, shipment_id, driver_id, vehicle_id, sequence_number, stop_type, planned_arrival_at, actual_arrival_at, status, latitude, longitude, notes)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          newId(), routeId, shipment.id, input.driverId ?? null, input.vehicleId ?? null, sequence, "delivery",
          `${input.routeDate}T${String(8 + Math.floor(sequence / 3)).padStart(2, "0")}:00:00.000Z`, null, "pending",
          shipment.latitude, shipment.longitude, null,
        ],
      );
      sequence += 1;
    }

    await writeAudit(
      {
        organizationId: user.organizationId,
        actorId: user.id,
        actorEmail: user.email,
        action: "route.created",
        resourceType: "route",
        resourceId: routeId,
        metadata: { shipments: shipments.length, routeDate: input.routeDate },
      },
      tx,
    );

    return { id: routeId, stops: shipments.length };
  });
}

/**
 * Nearest-neighbour heuristic with priority weighting.
 * This is an ordering heuristic, not an optimal solver: results are always
 * labelled as such in the UI. Advanced optimisation (OR-Tools) is out of scope
 * for v1 and documented in docs/ROUTING.md.
 */
export function sequenceStops<T extends { latitude: number | null; longitude: number | null; priority: string }>(
  stops: T[],
  start: LatLng | null,
): T[] {
  const remaining = [...stops];
  const ordered: T[] = [];
  let current: LatLng | null = start;

  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let i = 0; i < remaining.length; i += 1) {
      const candidate = remaining[i] as T;
      const weight = PRIORITY_WEIGHT[candidate.priority] ?? 1;
      if (candidate.latitude === null || candidate.longitude === null) {
        const score = 10_000 * weight; // ungeocoded stops go last
        if (score < bestScore) {
          bestScore = score;
          bestIndex = i;
        }
        continue;
      }
      const point: LatLng = { lat: candidate.latitude, lng: candidate.longitude };
      const distance = current ? haversineKm(current, point) : 0;
      const score = distance * weight;
      if (score < bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }
    const [next] = remaining.splice(bestIndex, 1);
    if (!next) break;
    ordered.push(next);
    if (next.latitude !== null && next.longitude !== null) current = { lat: next.latitude, lng: next.longitude };
  }
  return ordered;
}

export interface OptimizeResult {
  routeId: string;
  method: "provider" | "heuristic_estimate";
  provider: string;
  estimated: boolean;
  distanceKm: number;
  durationMin: number;
  sequence: { stopId: string; shipmentId: string; trackingCode: string; sequence: number; city: string }[];
}

export async function optimizeRoute(
  routeId: string,
  user: SessionUser,
  options: { startLatitude?: number; startLongitude?: number } = {},
  database: Db = db(),
): Promise<OptimizeResult> {
  return database.transaction(async (tx) => {
    const route = await tx.get<{ id: string; route_date: string; status: string }>(
      "SELECT id, route_date, status FROM routes WHERE id = ? AND organization_id = ?",
      [routeId, user.organizationId],
    );
    if (!route) throw notFound("Rota não encontrada");
    if (route.status === "in_progress" || route.status === "completed") {
      throw conflict("Não é possível replanear uma rota em curso ou concluída.");
    }

    const stops = await tx.all<{
      id: string; shipment_id: string; tracking_code: string; priority: string; city: string;
      latitude: number | null; longitude: number | null;
    }>(
      `SELECT rs.id, rs.shipment_id, s.tracking_code, s.priority, a.city, a.latitude, a.longitude
       FROM route_stops rs
       JOIN shipments s ON s.id = rs.shipment_id
       JOIN addresses a ON a.id = s.destination_address_id
       WHERE rs.route_id = ?`,
      [routeId],
    );
    if (stops.length === 0) throw conflict("A rota não tem paragens.");

    const start = options.startLatitude !== undefined && options.startLongitude !== undefined
      ? { lat: options.startLatitude, lng: options.startLongitude }
      : null;
    const ordered = sequenceStops(stops, start);

    const points: LatLng[] = [];
    if (start) points.push(start);
    for (const stop of ordered) {
      if (stop.latitude !== null && stop.longitude !== null) points.push({ lat: stop.latitude, lng: stop.longitude });
    }

    let result: RouteResult | null = null;
    if (points.length >= 2) {
      result = await routeBetween(points);
    }

    let sequence = 1;
    for (const stop of ordered) {
      await tx.run("UPDATE route_stops SET sequence_number = ? WHERE id = ?", [10_000 + sequence, stop.id]);
      sequence += 1;
    }
    sequence = 1;
    for (const stop of ordered) {
      await tx.run("UPDATE route_stops SET sequence_number = ?, planned_arrival_at = ? WHERE id = ?", [
        sequence,
        `${route.route_date}T${String(8 + Math.floor((sequence - 1) * 0.5)).padStart(2, "0")}:${sequence % 2 === 0 ? "30" : "00"}:00.000Z`,
        stop.id,
      ]);
      sequence += 1;
    }

    if (result) {
      await tx.run("UPDATE routes SET planned_distance_km = ?, planned_duration_min = ?, updated_at = ? WHERE id = ?", [
        result.totalDistanceKm, result.totalDurationMin, nowIso(), routeId,
      ]);
    }

    await writeAudit(
      {
        organizationId: user.organizationId,
        actorId: user.id,
        actorEmail: user.email,
        action: "route.optimized",
        resourceType: "route",
        resourceId: routeId,
        metadata: { method: result?.estimated ? "heuristic_estimate" : "provider", distanceKm: result?.totalDistanceKm ?? null },
      },
      tx,
    );

    return {
      routeId,
      method: result?.estimated === false ? "provider" : "heuristic_estimate",
      provider: result?.provider ?? "n/d",
      estimated: result?.estimated ?? true,
      distanceKm: result?.totalDistanceKm ?? 0,
      durationMin: result?.totalDurationMin ?? 0,
      sequence: ordered.map((stop, index) => ({
        stopId: stop.id,
        shipmentId: stop.shipment_id,
        trackingCode: stop.tracking_code,
        sequence: index + 1,
        city: stop.city,
      })),
    };
  });
}

export async function updateRouteStatus(routeId: string, status: string, user: SessionUser, database: Db = db()) {
  const allowed = ["draft", "planned", "dispatched", "in_progress", "completed", "cancelled"];
  if (!allowed.includes(status)) throw validationError("Estado de rota inválido");
  const route = await database.get<{ id: string }>("SELECT id FROM routes WHERE id = ? AND organization_id = ?", [routeId, user.organizationId]);
  if (!route) throw notFound("Rota não encontrada");
  await database.run("UPDATE routes SET status = ?, updated_at = ? WHERE id = ?", [status, nowIso(), routeId]);
  await writeAudit({
    organizationId: user.organizationId,
    actorId: user.id,
    actorEmail: user.email,
    action: "route.status_changed",
    resourceType: "route",
    resourceId: routeId,
    metadata: { status },
  });
  return { id: routeId, status };
}

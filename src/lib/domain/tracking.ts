import "server-only";
import { db } from "@/lib/db";
import { STATUS_LABELS, type ShipmentStatus } from "./shipment-status";

/**
 * Public tracking payload — an explicit allowlist.
 * Never included: customer name, email, phone, street address, courier identity,
 * live coordinates, prices or internal notes.
 */
export interface PublicTrackingEvent {
  status: ShipmentStatus | null;
  label: string;
  description: string | null;
  location: string | null;
  occurredAt: string;
}

export interface PublicTrackingResult {
  trackingCode: string;
  status: ShipmentStatus;
  statusLabel: string;
  serviceType: string;
  createdAt: string;
  updatedAt: string;
  lastEventAt: string | null;
  estimatedDeliveryAt: string | null;
  estimatedDeliveryNote: string | null;
  deliveredAt: string | null;
  origin: { city: string; country: string };
  destination: { city: string; country: string };
  hasException: boolean;
  events: PublicTrackingEvent[];
}

interface TrackingRow {
  id: string;
  tracking_code: string;
  status: ShipmentStatus;
  service_type: string;
  created_at: string;
  updated_at: string;
  estimated_delivery_at: string | null;
  actual_delivery_at: string | null;
  exception_reason: string | null;
  origin_city: string;
  origin_country: string;
  destination_city: string;
  destination_country: string;
}

const OK_STATUSES: ShipmentStatus[] = [
  "pending_quote", "quoted", "confirmed", "assigned", "picked_up",
  "in_transit", "out_for_delivery", "delivered", "on_hold", "exception",
  "failed_delivery", "returned", "cancelled",
];

export async function lookupTracking(rawCode: string): Promise<PublicTrackingResult | null> {
  const code = rawCode.trim().toUpperCase();
  if (!/^[A-Z0-9-]{6,32}$/.test(code)) return null;

  const row = await db().get<TrackingRow>(
    `SELECT s.id, s.tracking_code, s.status, s.service_type, s.created_at, s.updated_at,
            s.estimated_delivery_at, s.actual_delivery_at, s.exception_reason,
            oa.city AS origin_city, oa.country_code AS origin_country,
            da.city AS destination_city, da.country_code AS destination_country
     FROM shipments s
     JOIN addresses oa ON oa.id = s.origin_address_id
     JOIN addresses da ON da.id = s.destination_address_id
     WHERE s.tracking_code = ?`,
    [code],
  );
  if (!row) return null;

  const events = await db().all<{
    new_status: string | null;
    event_type: string;
    description: string | null;
    location: string | null;
    occurred_at: string;
  }>(
    `SELECT new_status, event_type, description, location, occurred_at
     FROM shipment_events WHERE shipment_id = ? ORDER BY occurred_at DESC LIMIT 50`,
    [row.id],
  );

  const finished = row.status === "delivered" || row.status === "cancelled" || row.status === "returned";
  const exceptionStatuses: ShipmentStatus[] = ["exception", "failed_delivery", "returned"];

  return {
    trackingCode: row.tracking_code,
    status: row.status,
    statusLabel: STATUS_LABELS[row.status] ?? row.status,
    serviceType: row.service_type,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastEventAt: events[0]?.occurred_at ?? null,
    // An estimate is only shown while it can still change.
    estimatedDeliveryAt: finished ? null : row.estimated_delivery_at,
    estimatedDeliveryNote: finished ? null : "Estimativa sujeita a condições operacionais.",
    deliveredAt: row.actual_delivery_at,
    origin: { city: row.origin_city, country: row.origin_country },
    destination: { city: row.destination_city, country: row.destination_country },
    hasException: exceptionStatuses.includes(row.status),
    events: events.map((event) => ({
      status: event.new_status && OK_STATUSES.includes(event.new_status as ShipmentStatus) ? (event.new_status as ShipmentStatus) : null,
      label: event.new_status && STATUS_LABELS[event.new_status as ShipmentStatus]
        ? STATUS_LABELS[event.new_status as ShipmentStatus]
        : event.event_type,
      description: event.description,
      location: event.location,
      occurredAt: event.occurred_at,
    })),
  };
}

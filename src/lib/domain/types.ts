import type { ShipmentStatus } from "./shipment-status";

export interface ShipmentRow {
  id: string;
  organization_id: string;
  tracking_code: string;
  customer_id: string;
  origin_address_id: string;
  destination_address_id: string;
  service_type: string;
  status: ShipmentStatus;
  priority: string;
  requested_pickup_at: string | null;
  estimated_delivery_at: string | null;
  actual_delivery_at: string | null;
  total_weight_kg: number;
  volume_m3: number;
  currency: string;
  quoted_amount_cents: number;
  final_amount_cents: number | null;
  notes: string | null;
  exception_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShipmentListRow extends ShipmentRow {
  company_name: string | null;
  contact_name: string;
  customer_email: string;
  origin_city: string;
  origin_country: string;
  destination_city: string;
  destination_country: string;
}

export interface ShipmentItemRow {
  id: string;
  shipment_id: string;
  description: string;
  quantity: number;
  weight_kg: number;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  declared_value_cents: number | null;
  handling_instructions: string | null;
  created_at: string;
}

export interface ShipmentEventRow {
  id: string;
  shipment_id: string;
  event_type: string;
  previous_status: string | null;
  new_status: string | null;
  description: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  actor_id: string | null;
  actor_name?: string | null;
  occurred_at: string;
  metadata: string | null;
}

export interface ProofOfDeliveryRow {
  id: string;
  shipment_id: string;
  received_by: string;
  signature_path: string | null;
  photo_paths: string | null;
  notes: string | null;
  latitude: number | null;
  longitude: number | null;
  delivered_at: string;
  submitted_by: string | null;
}

export interface CustomerRow {
  id: string;
  organization_id: string;
  customer_type: "business" | "individual";
  company_name: string | null;
  contact_name: string;
  email: string;
  phone: string | null;
  tax_number: string | null;
  billing_address: string | null;
  billing_postal_code: string | null;
  billing_city: string | null;
  billing_country_code: string;
  status: "active" | "inactive" | "blocked";
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AddressRow {
  id: string;
  organization_id: string;
  customer_id: string | null;
  label: string | null;
  address_line: string;
  postal_code: string | null;
  city: string;
  region: string | null;
  country_code: string;
  latitude: number | null;
  longitude: number | null;
  validated_at: string | null;
  created_at: string;
}

export interface ShipmentDto {
  id: string;
  trackingCode: string;
  status: ShipmentStatus;
  priority: string;
  serviceType: string;
  customer: { id: string; name: string; email: string };
  origin: { city: string; country: string };
  destination: { city: string; country: string };
  requestedPickupAt: string | null;
  estimatedDeliveryAt: string | null;
  actualDeliveryAt: string | null;
  createdAt: string;
  updatedAt: string;
  weightKg: number;
  volumeM3: number;
  currency: string;
  quotedAmount: number;
  finalAmount: number | null;
  exceptionReason: string | null;
}

export interface RouteStopRow {
  id: string;
  route_id: string;
  shipment_id: string;
  driver_id: string | null;
  vehicle_id: string | null;
  sequence_number: number;
  stop_type: "pickup" | "delivery";
  planned_arrival_at: string | null;
  actual_arrival_at: string | null;
  status: "pending" | "en_route" | "arrived" | "completed" | "failed";
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
}

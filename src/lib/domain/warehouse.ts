import "server-only";
import { db, type Db } from "@/lib/db";
import { newId, nowIso } from "@/lib/ids";
import { conflict, notFound, validationError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth/session";

export interface WarehouseOverview {
  warehouse: { id: string; name: string; city: string | null } | null;
  zones: {
    id: string;
    name: string;
    zoneType: string;
    capacityPallets: number;
    occupiedPallets: number;
    utilizationPct: number;
    status: string;
    unitsOnHand: number;
  }[];
  totals: { capacityPallets: number; occupiedPallets: number; utilizationPct: number };
  inventory: {
    itemId: string;
    sku: string;
    name: string;
    unitOfMeasure: string;
    onHand: number;
    lastMovementAt: string | null;
  }[];
  movements: {
    id: string;
    movementType: string;
    quantity: number;
    reference: string | null;
    createdAt: string;
    sku: string;
    itemName: string;
    zoneName: string | null;
    actorName: string | null;
    shipmentTracking: string | null;
  }[];
}

/**
 * Occupancy note (documented limitation): `occupied_pallets` is a physical,
 * manually registered figure maintained by warehouse staff (with audit trail),
 * while movements track *units*. Units are never silently converted into
 * pallets, because that would fabricate a capacity number.
 */
export async function getWarehouseOverview(organizationId: string, database: Db = db()): Promise<WarehouseOverview> {
  const warehouse = await database.get<{ id: string; name: string; city: string | null }>(
    `SELECT w.id, w.name, a.city FROM warehouses w LEFT JOIN addresses a ON a.id = w.address_id
     WHERE w.organization_id = ? AND w.status = 'active' ORDER BY w.created_at ASC`,
    [organizationId],
  );

  if (!warehouse) {
    return {
      warehouse: null,
      zones: [],
      totals: { capacityPallets: 0, occupiedPallets: 0, utilizationPct: 0 },
      inventory: [],
      movements: [],
    };
  }

  const zones = await database.all<{
    id: string; name: string; zone_type: string; capacity_pallets: number; occupied_pallets: number; status: string; units: number | null;
  }>(
    `SELECT z.id, z.name, z.zone_type, z.capacity_pallets, z.occupied_pallets, z.status,
            (SELECT SUM(m.quantity) FROM inventory_movements m WHERE m.zone_id = z.id) AS units
     FROM warehouse_zones z WHERE z.warehouse_id = ? ORDER BY z.name ASC`,
    [warehouse.id],
  );

  const inventory = await database.all<{
    item_id: string; sku: string; name: string; unit_of_measure: string; on_hand: number | null; last_movement_at: string | null;
  }>(
    `SELECT i.id AS item_id, i.sku, i.name, i.unit_of_measure,
            SUM(m.quantity) AS on_hand, MAX(m.created_at) AS last_movement_at
     FROM inventory_items i
     LEFT JOIN inventory_movements m ON m.inventory_item_id = i.id
     WHERE i.organization_id = ?
     GROUP BY i.id, i.sku, i.name, i.unit_of_measure
     ORDER BY i.sku ASC`,
    [organizationId],
  );

  const movements = await database.all<{
    id: string; movement_type: string; quantity: number; reference: string | null; created_at: string;
    sku: string; item_name: string; zone_name: string | null; actor_name: string | null; tracking_code: string | null;
  }>(
    `SELECT m.id, m.movement_type, m.quantity, m.reference, m.created_at, i.sku, i.name AS item_name,
            z.name AS zone_name, p.full_name AS actor_name, s.tracking_code
     FROM inventory_movements m
     JOIN inventory_items i ON i.id = m.inventory_item_id
     JOIN warehouses w ON w.id = m.warehouse_id
     LEFT JOIN warehouse_zones z ON z.id = m.zone_id
     LEFT JOIN profiles p ON p.id = m.actor_id
     LEFT JOIN shipments s ON s.id = m.shipment_id
     WHERE w.organization_id = ?
     ORDER BY m.created_at DESC LIMIT 40`,
    [organizationId],
  );

  const capacityPallets = zones.reduce((sum, z) => sum + z.capacity_pallets, 0);
  const occupiedPallets = zones.reduce((sum, z) => sum + z.occupied_pallets, 0);

  return {
    warehouse: { id: warehouse.id, name: warehouse.name, city: warehouse.city },
    zones: zones.map((zone) => ({
      id: zone.id,
      name: zone.name,
      zoneType: zone.zone_type,
      capacityPallets: zone.capacity_pallets,
      occupiedPallets: zone.occupied_pallets,
      utilizationPct: zone.capacity_pallets > 0 ? Math.round((zone.occupied_pallets / zone.capacity_pallets) * 100) : 0,
      status: zone.status,
      unitsOnHand: Number(zone.units ?? 0),
    })),
    totals: {
      capacityPallets,
      occupiedPallets,
      utilizationPct: capacityPallets > 0 ? Math.round((occupiedPallets / capacityPallets) * 100) : 0,
    },
    inventory: inventory.map((item) => ({
      itemId: item.item_id,
      sku: item.sku,
      name: item.name,
      unitOfMeasure: item.unit_of_measure,
      onHand: Number(item.on_hand ?? 0),
      lastMovementAt: item.last_movement_at,
    })),
    movements: movements.map((movement) => ({
      id: movement.id,
      movementType: movement.movement_type,
      quantity: movement.quantity,
      reference: movement.reference,
      createdAt: movement.created_at,
      sku: movement.sku,
      itemName: movement.item_name,
      zoneName: movement.zone_name,
      actorName: movement.actor_name,
      shipmentTracking: movement.tracking_code,
    })),
  };
}

export interface MovementInput {
  warehouseId: string;
  zoneId?: string | null;
  inventoryItemId: string;
  shipmentId?: string | null;
  movementType: "receipt" | "putaway" | "transfer" | "pick" | "dispatch" | "adjustment" | "return";
  quantity: number;
  reference?: string;
}

const INBOUND = ["receipt", "putaway", "return"];

export async function recordInventoryMovement(input: MovementInput, user: SessionUser, database: Db = db()) {
  return database.transaction(async (tx) => {
    const warehouse = await tx.get<{ id: string }>("SELECT id FROM warehouses WHERE id = ? AND organization_id = ?", [
      input.warehouseId, user.organizationId,
    ]);
    if (!warehouse) throw validationError("Armazém inválido");

    const item = await tx.get<{ id: string; sku: string }>("SELECT id, sku FROM inventory_items WHERE id = ? AND organization_id = ?", [
      input.inventoryItemId, user.organizationId,
    ]);
    if (!item) throw validationError("Artigo inválido");

    if (input.zoneId) {
      const zone = await tx.get<{ id: string }>("SELECT id FROM warehouse_zones WHERE id = ? AND warehouse_id = ?", [input.zoneId, input.warehouseId]);
      if (!zone) throw validationError("Zona inválida para este armazém");
    }

    if (input.shipmentId) {
      const shipment = await tx.get<{ id: string }>("SELECT id FROM shipments WHERE id = ? AND organization_id = ?", [input.shipmentId, user.organizationId]);
      if (!shipment) throw validationError("Encomenda inválida");
    }

    // Signed quantity convention: inbound positive, outbound negative.
    let signed = input.quantity;
    if (INBOUND.includes(input.movementType)) signed = Math.abs(input.quantity);
    else if (input.movementType === "pick" || input.movementType === "dispatch") signed = -Math.abs(input.quantity);

    const balance = await tx.get<{ total: number | null }>(
      "SELECT SUM(quantity) AS total FROM inventory_movements WHERE inventory_item_id = ? AND warehouse_id = ?",
      [input.inventoryItemId, input.warehouseId],
    );
    const onHand = Number(balance?.total ?? 0);
    if (onHand + signed < 0) {
      throw conflict(`Stock insuficiente: disponível ${onHand}, movimento ${signed}.`, { onHand, requested: signed });
    }

    const id = newId();
    await tx.run(
      `INSERT INTO inventory_movements (id, warehouse_id, zone_id, inventory_item_id, shipment_id, movement_type, quantity, reference, actor_id, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [id, input.warehouseId, input.zoneId ?? null, input.inventoryItemId, input.shipmentId ?? null, input.movementType, signed, input.reference || null, user.id, nowIso()],
    );

    await writeAudit(
      {
        organizationId: user.organizationId,
        actorId: user.id,
        actorEmail: user.email,
        action: "inventory.movement_recorded",
        resourceType: "inventory_item",
        resourceId: input.inventoryItemId,
        metadata: { type: input.movementType, quantity: signed, warehouseId: input.warehouseId, zoneId: input.zoneId ?? null },
      },
      tx,
    );

    return { id, onHand: onHand + signed, sku: item.sku };
  });
}

/** Explicit, audited occupancy update — the only sanctioned way to change pallet occupancy. */
export async function setZoneOccupancy(zoneId: string, occupiedPallets: number, user: SessionUser, reason: string, database: Db = db()) {
  if (!Number.isInteger(occupiedPallets) || occupiedPallets < 0) throw validationError("Ocupação inválida");
  if (reason.trim().length < 5) throw validationError("Indique o motivo do ajuste");
  return database.transaction(async (tx) => {
    const zone = await tx.get<{ id: string; capacity_pallets: number; name: string }>(
      `SELECT z.id, z.capacity_pallets, z.name FROM warehouse_zones z
       JOIN warehouses w ON w.id = z.warehouse_id WHERE z.id = ? AND w.organization_id = ?`,
      [zoneId, user.organizationId],
    );
    if (!zone) throw notFound("Zona não encontrada");
    if (occupiedPallets > zone.capacity_pallets) {
      throw conflict(`Ocupação excede a capacidade registada (${zone.capacity_pallets} paletes).`);
    }
    await tx.run("UPDATE warehouse_zones SET occupied_pallets = ?, status = ? WHERE id = ?", [
      occupiedPallets, occupiedPallets >= zone.capacity_pallets ? "full" : "active", zoneId,
    ]);
    await writeAudit(
      {
        organizationId: user.organizationId,
        actorId: user.id,
        actorEmail: user.email,
        action: "warehouse.occupancy_adjusted",
        resourceType: "warehouse_zone",
        resourceId: zoneId,
        metadata: { occupiedPallets, reason },
      },
      tx,
    );
    return { id: zoneId, occupiedPallets };
  });
}

/** Data for the 3D logistics centre: zones mapped to physical grid coordinates. */
export async function getFacilityLayout(organizationId: string, database: Db = db()) {
  const warehouse = await database.get<{ id: string; name: string }>(
    "SELECT id, name FROM warehouses WHERE organization_id = ? AND status = 'active' ORDER BY created_at ASC",
    [organizationId],
  );
  if (!warehouse) return { warehouse: null, zones: [], isDemo: true };

  const zones = await database.all<{
    id: string; name: string; zone_type: string; capacity_pallets: number; occupied_pallets: number; status: string;
  }>("SELECT id, name, zone_type, capacity_pallets, occupied_pallets, status FROM warehouse_zones WHERE warehouse_id = ? ORDER BY name ASC", [warehouse.id]);

  return {
    warehouse: { id: warehouse.id, name: warehouse.name },
    zones: zones.map((zone) => ({
      id: zone.id,
      name: zone.name,
      zoneType: zone.zone_type,
      capacityPallets: zone.capacity_pallets,
      occupiedPallets: zone.occupied_pallets,
      utilizationPct: zone.capacity_pallets > 0 ? Math.round((zone.occupied_pallets / zone.capacity_pallets) * 100) : 0,
      status: zone.status,
      occupancySource: "registo_manual_auditado" as const,
    })),
    isDemo: false,
  };
}

import type { NextRequest } from "next/server";
import { created, requireApiPermission, withApi } from "@/lib/api/http";
import { inventoryMovementSchema } from "@/lib/validation/schemas";
import { recordInventoryMovement } from "@/lib/domain/warehouse";

export const POST = withApi(async (request: NextRequest) => {
  const user = await requireApiPermission("inventory:write");
  const parsed = inventoryMovementSchema.parse(await request.json());
  const result = await recordInventoryMovement(
    {
      warehouseId: parsed.warehouseId,
      zoneId: parsed.zoneId ?? null,
      inventoryItemId: parsed.inventoryItemId,
      shipmentId: parsed.shipmentId ?? null,
      movementType: parsed.movementType,
      quantity: parsed.quantity,
      reference: parsed.reference || undefined,
    },
    user,
  );
  return created(result);
});

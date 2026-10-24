import type { NextRequest } from "next/server";
import { created, requireApiPermission, withApi } from "@/lib/api/http";
import { documentUploadSchema } from "@/lib/validation/schemas";
import { decodeUpload, savePrivateFile } from "@/lib/storage";
import { db } from "@/lib/db";
import { newId, nowIso } from "@/lib/ids";
import { validationError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";

export const POST = withApi(async (request: NextRequest) => {
  const user = await requireApiPermission("documents:write");
  const parsed = documentUploadSchema.parse(await request.json());

  if (parsed.shipmentId) {
    const shipment = await db().get<{ id: string }>("SELECT id FROM shipments WHERE id = ? AND organization_id = ?", [parsed.shipmentId, user.organizationId]);
    if (!shipment) throw validationError("Encomenda inválida");
  }
  if (parsed.customerId) {
    const customer = await db().get<{ id: string }>("SELECT id FROM customers WHERE id = ? AND organization_id = ?", [parsed.customerId, user.organizationId]);
    if (!customer) throw validationError("Cliente inválido");
  }

  const { buffer, extension } = decodeUpload(parsed.dataBase64, parsed.mimeType);
  const path = await savePrivateFile(user.organizationId, "documents", buffer, extension);
  const id = newId();

  await db().run(
    `INSERT INTO documents (id, organization_id, shipment_id, customer_id, document_type, storage_path, filename, mime_type, size_bytes, uploaded_by, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [id, user.organizationId, parsed.shipmentId ?? null, parsed.customerId ?? null, parsed.documentType, path, parsed.filename, parsed.mimeType, buffer.length, user.id, nowIso()],
  );

  await writeAudit({
    organizationId: user.organizationId,
    actorId: user.id,
    actorEmail: user.email,
    action: "document.uploaded",
    resourceType: "document",
    resourceId: id,
    metadata: { documentType: parsed.documentType, sizeBytes: buffer.length },
  });

  return created({ id, filename: parsed.filename, mimeType: parsed.mimeType, sizeBytes: buffer.length });
});

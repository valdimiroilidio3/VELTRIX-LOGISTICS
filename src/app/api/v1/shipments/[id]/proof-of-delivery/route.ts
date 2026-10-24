import type { NextRequest } from "next/server";
import { clientIp, created, requireApiPermission, withApi, routeParam } from "@/lib/api/http";
import { podSchema } from "@/lib/validation/schemas";
import { submitProofOfDelivery } from "@/lib/domain/shipments";
import { decodeUpload, savePrivateFile } from "@/lib/storage";
import { AppError } from "@/lib/errors";

/**
 * Accepts the POD payload as JSON with base64 images (validated by magic bytes,
 * size-limited, stored privately). Files are never publicly addressable: the
 * response only contains flags, never raw storage paths.
 */
export const POST = withApi(async (request: NextRequest, context) => {
  const user = await requireApiPermission("pod:submit");
  const id = await routeParam(context, "id");
  const parsed = podSchema.parse(await request.json());

  const detail = await submitProofOfDeliveryPreview(id, user.organizationId);
  if (!detail) throw new AppError("Encomenda não encontrada", 404, "not_found");

  let signaturePath: string | null = null;
  if (parsed.signatureDataUrl) {
    const { buffer } = decodeUpload(parsed.signatureDataUrl, "image/png");
    signaturePath = await savePrivateFile(user.organizationId, "signatures", buffer, "png");
  }

  const photoPaths: string[] = [];
  for (const photo of parsed.photos ?? []) {
    const mime = photo.startsWith("data:image/png") ? "image/png" : photo.startsWith("data:image/webp") ? "image/webp" : "image/jpeg";
    const { buffer, extension } = decodeUpload(photo, mime);
    photoPaths.push(await savePrivateFile(user.organizationId, "pod-photos", buffer, extension));
  }

  const result = await submitProofOfDelivery(
    id,
    {
      receivedBy: parsed.receivedBy,
      notes: parsed.notes || undefined,
      latitude: parsed.latitude ?? null,
      longitude: parsed.longitude ?? null,
      signaturePath,
      photoPaths,
    },
    user,
    { ip: clientIp(request) },
  );

  return created({ ...result, hasSignature: Boolean(signaturePath), photos: photoPaths.length });
});

async function submitProofOfDeliveryPreview(shipmentId: string, organizationId: string) {
  const { db } = await import("@/lib/db");
  return db().get<{ id: string }>("SELECT id FROM shipments WHERE id = ? AND organization_id = ?", [shipmentId, organizationId]);
}

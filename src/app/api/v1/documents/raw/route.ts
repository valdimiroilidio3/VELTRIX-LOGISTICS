import type { NextRequest } from "next/server";
import { withApi } from "@/lib/api/http";
import { readPrivateFile, verifyStorageSignature } from "@/lib/storage";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";

/**
 * Serves private files only through signed, short-lived links *and* an
 * authenticated session belonging to the owning organisation. The signature
 * alone is not sufficient — defence in depth in case a URL leaks.
 */
export const GET = withApi(async (request: NextRequest) => {
  const params = request.nextUrl.searchParams;
  const storagePath = params.get("path") ?? "";
  const expires = params.get("expires") ?? "";
  const signature = params.get("signature") ?? "";

  verifyStorageSignature(storagePath, expires, signature);
  const user = await requireUser();

  const organizationId = storagePath.split("/")[0] ?? "";
  if (organizationId !== user.organizationId) throw notFound("Documento não encontrado");

  const document = await db().get<{ mime_type: string; filename: string }>(
    "SELECT mime_type, filename FROM documents WHERE storage_path = ? AND organization_id = ?",
    [storagePath, user.organizationId],
  );

  const buffer = await readPrivateFile(storagePath);
  const mime = document?.mime_type ?? (storagePath.endsWith(".png") ? "image/png" : storagePath.endsWith(".pdf") ? "application/pdf" : "image/jpeg");

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});

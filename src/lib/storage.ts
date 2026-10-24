import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env, requireAuthSecret } from "@/lib/env";
import { newId } from "@/lib/ids";
import { AppError, notFound } from "@/lib/errors";

/**
 * Private file storage for proof-of-delivery material and documents.
 *
 * Demo/local: filesystem under `.data/uploads` (never web-accessible; served
 * only through the signed-URL route). Production on Vercel should use Supabase
 * Storage — the `StorageAdapter` seam below is where that implementation lands;
 * see docs/INTEGRACOES.md. Signed URLs work identically for both.
 */

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const ALLOWED_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
const SIGNED_URL_TTL_SECONDS = 300;

const root = () => path.resolve(process.cwd(), env.uploadDir);

function safeSegment(value: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) throw new AppError("Caminho inválido", 400, "invalid_path");
  return value;
}

/** Decodes and validates a base64 data payload (size + magic bytes). */
export function decodeUpload(dataBase64: string, declaredMime: string): { buffer: Buffer; extension: string } {
  const extension = ALLOWED_MIME[declaredMime];
  if (!extension) throw new AppError("Tipo de ficheiro não permitido", 415, "unsupported_media_type");
  const cleaned = dataBase64.replace(/^data:[^;]+;base64,/, "");
  const buffer = Buffer.from(cleaned, "base64");
  if (buffer.length === 0) throw new AppError("Ficheiro vazio", 422, "empty_file");
  if (buffer.length > MAX_UPLOAD_BYTES) throw new AppError("Ficheiro excede 5 MB", 413, "file_too_large");

  const magicMatches =
    (declaredMime === "image/png" && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) ||
    (declaredMime === "image/jpeg" && buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) ||
    (declaredMime === "image/webp" && buffer.subarray(0, 4).toString("ascii") === "RIFF") ||
    (declaredMime === "application/pdf" && buffer.subarray(0, 4).toString("ascii") === "%PDF");
  if (!magicMatches) throw new AppError("O conteúdo não corresponde ao tipo declarado", 422, "mime_mismatch");

  return { buffer, extension };
}

export async function savePrivateFile(organizationId: string, folder: string, buffer: Buffer, extension: string): Promise<string> {
  const dir = path.join(root(), safeSegment(organizationId), safeSegment(folder));
  await fs.mkdir(dir, { recursive: true });
  const filename = `${newId()}.${extension}`;
  await fs.writeFile(path.join(dir, filename), buffer, { mode: 0o600 });
  return `${organizationId}/${folder}/${filename}`;
}

export async function readPrivateFile(storagePath: string): Promise<Buffer> {
  const resolved = path.resolve(root(), storagePath);
  if (!resolved.startsWith(root() + path.sep)) throw notFound("Documento não encontrado");
  try {
    return await fs.readFile(resolved);
  } catch {
    throw notFound("Documento não encontrado");
  }
}

export function signStoragePath(storagePath: string, ttlSeconds = SIGNED_URL_TTL_SECONDS): string {
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const signature = createHmac("sha256", requireAuthSecret()).update(`${storagePath}:${expires}`).digest("base64url");
  const params = new URLSearchParams({ path: storagePath, expires: String(expires), signature });
  return `/api/v1/documents/raw?${params.toString()}`;
}

export function verifyStorageSignature(storagePath: string, expires: string, signature: string): void {
  const expiry = Number(expires);
  if (!Number.isFinite(expiry) || expiry * 1000 < Date.now()) {
    throw new AppError("Ligação expirada. Solicite novamente.", 403, "expired_link");
  }
  const expected = createHmac("sha256", requireAuthSecret()).update(`${storagePath}:${expiry}`).digest("base64url");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new AppError("Assinatura inválida", 403, "invalid_signature");
  }
}

import "server-only";
import { db } from "@/lib/db";
import { newId, sha256 } from "@/lib/ids";
import { logError } from "@/lib/errors";

export interface AuditInput {
  organizationId: string;
  actorId?: string | null;
  actorEmail?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
}

/** Audit writes must never break the business operation they describe. */
export async function writeAudit(input: AuditInput, database = db()): Promise<void> {
  try {
    await database.run(
      `INSERT INTO audit_logs (id, organization_id, actor_id, actor_email, action, resource_type, resource_id, metadata, ip_hash, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        newId(),
        input.organizationId,
        input.actorId ?? null,
        input.actorEmail ?? null,
        input.action,
        input.resourceType,
        input.resourceId ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
        input.ip ? sha256(input.ip) : null,
        new Date().toISOString(),
      ],
    );
  } catch (error) {
    logError("audit", error);
  }
}

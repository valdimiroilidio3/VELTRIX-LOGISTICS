import { sendEmail, emailIsConfigured } from "@/lib/integrations/email";

/**
 * Transactional notification outbox.
 *
 * Notifications are persisted before delivery (queue-first), then dispatched by
 * a cron job or an explicit admin action. Delivery failures are recorded with
 * the provider message and retried with exponential backoff — never swallowed.
 */

export type NotificationChannel = "email" | "sms" | "whatsapp" | "in_app";

export type NotificationTemplate =
  | "shipment.created"
  | "shipment.confirmed"
  | "shipment.picked_up"
  | "shipment.in_transit"
  | "shipment.status_changed"
  | "shipment.delivered"
  | "shipment.exception"
  | "quote.received"
  | "quote.sent"
  | "invoice.issued"
  | "invoice.overdue"
  | "contact.received"
  | "integration.failure"
  | "pod.registered"
  | "user.welcome";

export interface EnqueueInput {
  organizationId: string;
  recipient: string;
  channel: NotificationChannel;
  template: NotificationTemplate;
  subject: string;
  body: string;
  dedupeKey: string;
  payload?: Record<string, unknown>;
  scheduledAt?: string;
}

export interface QueueSummary {
  processed: number;
  picked: number;
  sent: number;
  failed: number;
  skipped: number;
  emailConfigured: boolean;
}

interface JobRow {
  id: string;
  organization_id: string;
  recipient: string;
  channel: string;
  template: string;
  payload: string;
  attempts: number;
}

const MAX_ATTEMPTS = 3;
const BACKOFF_MINUTES = [1, 10, 60];

export async function enqueueNotification(database: DatabaseLike, input: EnqueueInput): Promise<void> {
  const now = new Date().toISOString();
  const payload = JSON.stringify({
    subject: input.subject,
    body: input.body,
    dedupeKey: input.dedupeKey,
    ...input.payload,
  });

  // Manual dedupe keeps the same behaviour on SQLite and PostgreSQL.
  const existing = await database.get<{ id: string }>(
    "SELECT id FROM notification_jobs WHERE organization_id = ? AND template = ? AND recipient = ? AND payload LIKE ?",
    [input.organizationId, input.template, input.recipient, `%"dedupeKey":"${input.dedupeKey}"%`],
  );
  if (existing) return;

  await database.run(
    `INSERT INTO notification_jobs (id, organization_id, recipient, channel, template, payload, status, attempts, scheduled_at, created_at, updated_at)
     VALUES (?,?,?,?,?,?,'queued',0,?,?,?)`,
    [crypto.randomUUID(), input.organizationId, input.recipient, input.channel, input.template, payload, input.scheduledAt ?? now, now, now],
  );
}

export async function processNotificationQueue(limit = 25, database?: DatabaseLike): Promise<QueueSummary> {
  const db = database ?? (await import("@/lib/db")).db();
  const now = new Date().toISOString();
  const jobs = await db.all<JobRow>(
    `SELECT id, organization_id, recipient, channel, template, payload, attempts
       FROM notification_jobs
      WHERE status IN ('queued','failed')
        AND attempts < ?
        AND scheduled_at <= ?
      ORDER BY scheduled_at ASC
      LIMIT ?`,
    [MAX_ATTEMPTS, now, limit],
  );

  const summary: QueueSummary = { processed: jobs.length, picked: jobs.length, sent: 0, failed: 0, skipped: 0, emailConfigured: emailIsConfigured() };

  for (const job of jobs) {
    await db.run("UPDATE notification_jobs SET status = 'processing', updated_at = ? WHERE id = ?", [now, job.id]);

    const payload = safeParse(job.payload);
    const subject = String(payload.subject ?? "Actualização de encomenda VELTRIX");
    const body = String(payload.body ?? "");

    if (job.channel !== "email") {
      // SMS / WhatsApp adapters exist but no provider is contracted. The job is
      // parked instead of faking a successful delivery.
      summary.skipped += 1;
      await db.run(
        `UPDATE notification_jobs SET status = 'failed', attempts = attempts + 1, last_error = ?, scheduled_at = ?, updated_at = ? WHERE id = ?`,
        ["Canal sem fornecedor configurado — mensagem não enviada", scheduleRetry(job.attempts), now, job.id],
      );
      continue;
    }

    const result = await sendEmail({ to: job.recipient, subject, text: body });

    if (result.ok) {
      summary.sent += 1;
      await db.run(
        "UPDATE notification_jobs SET status = 'sent', attempts = attempts + 1, sent_at = ?, updated_at = ?, last_error = NULL WHERE id = ?",
        [now, now, job.id],
      );
      continue;
    }

    summary.failed += 1;
    const attempts = job.attempts + 1;
    const retryAt = attempts >= MAX_ATTEMPTS ? now : scheduleRetry(job.attempts);
    await db.run(
      `UPDATE notification_jobs SET status = ?, attempts = ?, last_error = ?, scheduled_at = ?, updated_at = ? WHERE id = ?`,
      [attempts >= MAX_ATTEMPTS ? "failed" : "queued", attempts, result.error ?? "Erro desconhecido", retryAt, now, job.id],
    );
  }

  return summary;
}

function scheduleRetry(attempts: number): string {
  const minutes = BACKOFF_MINUTES[Math.min(attempts, BACKOFF_MINUTES.length - 1)] ?? 60;
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function safeParse(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Minimal structural type so this module works with both drivers and tests. */
export interface DatabaseLike {
  run(sql: string, params?: unknown[]): Promise<{ changes: number }>;
  get<T>(sql: string, params?: unknown[]): Promise<T | undefined>;
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
}

export function buildShipmentStatusEmail(input: {
  trackingCode: string;
  status: string;
  statusLabel: string;
  customerName: string;
  trackingUrl: string;
}): { subject: string; body: string } {
  return {
    subject: `Encomenda ${input.trackingCode}: ${input.statusLabel}`,
    body: [
      `Olá ${input.customerName},`,
      "",
      `A encomenda ${input.trackingCode} passou ao estado «${input.statusLabel}».`,
      `Acompanhe o percurso em ${input.trackingUrl}`,
      "",
      "Este é um aviso automático. Não responda a esta mensagem.",
    ].join("\n"),
  };
}

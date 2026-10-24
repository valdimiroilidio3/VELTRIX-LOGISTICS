import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { AppError, logError } from "@/lib/errors";
import { ensureDatabase } from "@/lib/db";
import { getSessionUser, type SessionUser } from "@/lib/auth/session";
import type { Permission } from "@/lib/auth/rbac";

export interface ApiEnvelope<T> {
  data?: T;
  error?: { code: string; message: string; details?: unknown };
  meta?: Record<string, unknown>;
}

export function ok<T>(data: T, meta?: Record<string, unknown>, status = 200): NextResponse<ApiEnvelope<T>> {
  return NextResponse.json({ data, ...(meta ? { meta } : {}) }, { status });
}

export function created<T>(data: T): NextResponse<ApiEnvelope<T>> {
  return NextResponse.json({ data }, { status: 201 });
}

export function failure(error: AppError): NextResponse<ApiEnvelope<never>> {
  return NextResponse.json(
    { error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) } },
    { status: error.status },
  );
}

export function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

type Handler = (request: NextRequest, context: { params: Promise<Record<string, string>> }) => Promise<Response>;

/** Wraps a route handler with error mapping, database bootstrap and redacted logging. */
export function withApi(handler: Handler) {
  return async (request: NextRequest, context: { params: Promise<Record<string, string>> }): Promise<Response> => {
    try {
      await ensureDatabase();
      return await handler(request, context);
    } catch (error) {
      if (error instanceof AppError) return failure(error);
      if (error instanceof ZodError) {
        return failure(new AppError("Dados inválidos", 422, "validation_error", error.flatten()));
      }
      logError(`${request.method} ${request.nextUrl.pathname}`, error);
      return failure(new AppError("Erro interno do servidor", 500, "internal_error"));
    }
  };
}

/** Extracts a required dynamic route segment (throws a 400 instead of relying on `!`). */
export async function routeParam(context: { params: Promise<Record<string, string>> }, name: string): Promise<string> {
  const params = await context.params;
  const value = params[name];
  if (!value) throw new AppError(`Parâmetro '${name}' em falta`, 400, "missing_param");
  return value;
}

export async function apiUser(): Promise<SessionUser | null> {
  return getSessionUser();
}

export async function requireApiPermission(permission: Permission): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AppError("Autenticação necessária", 401, "unauthorized");
  if (!user.permissions.includes(permission)) throw new AppError("Sem permissão", 403, "forbidden");
  return user;
}

export interface Pagination {
  page: number;
  pageSize: number;
  offset: number;
}

export function pagination(request: NextRequest, defaults = { page: 1, pageSize: 20, max: 100 }): Pagination {
  const params = request.nextUrl.searchParams;
  const page = Math.max(1, Number(params.get("page") ?? defaults.page) || defaults.page);
  const pageSize = Math.min(defaults.max, Math.max(1, Number(params.get("pageSize") ?? defaults.pageSize) || defaults.pageSize));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

/** Resource-level tenancy guard: a user may only touch rows in their own organisation. */
export function assertSameOrganization(user: SessionUser, organizationId: string | null | undefined): void {
  if (!organizationId || organizationId !== user.organizationId) {
    throw new AppError("Recurso não encontrado", 404, "not_found");
  }
}

export const SORTABLE: Record<string, string[]> = {
  shipments: ["created_at", "updated_at", "estimated_delivery_at", "status", "tracking_code", "quoted_amount_cents"],
  customers: ["created_at", "company_name", "contact_name", "status"],
  invoices: ["created_at", "due_at", "total_cents", "status"],
  quotes: ["created_at", "total_cents", "status"],
  routes: ["route_date", "created_at", "status"],
  audit_logs: ["created_at"],
};

/** Whitelists ORDER BY fragments; never interpolate user input directly. */
export function orderBy(resource: keyof typeof SORTABLE, requested: string | null, fallback = "created_at"): string {
  const allowed = SORTABLE[resource] ?? [];
  const [column, directionRaw] = (requested ?? "").split(":");
  const safeColumn = column && allowed.includes(column) ? column : fallback;
  const safeDirection = directionRaw === "asc" ? "ASC" : "DESC";
  return `${safeColumn} ${safeDirection}`;
}

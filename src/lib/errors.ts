export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(message: string, status = 400, code = "bad_request", details?: unknown) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const unauthorized = (message = "Sessão inválida ou expirada") =>
  new AppError(message, 401, "unauthorized");

export const forbidden = (message = "Não tem permissões para esta operação") =>
  new AppError(message, 403, "forbidden");

export const notFound = (message = "Recurso não encontrado") =>
  new AppError(message, 404, "not_found");

export const conflict = (message: string, details?: unknown) =>
  new AppError(message, 409, "conflict", details);

export const validationError = (message: string, details?: unknown) =>
  new AppError(message, 422, "validation_error", details);

export const tooManyRequests = (message = "Demasiados pedidos. Tente novamente mais tarde.") =>
  new AppError(message, 429, "rate_limited");

export const serviceUnavailable = (message: string) =>
  new AppError(message, 503, "service_unavailable");

/**
 * Logs an error with redaction of anything that looks like a secret.
 * Never log raw request bodies for auth/payment routes.
 */
export function logError(context: string, error: unknown): void {
  const redact = (value: string) =>
    value
      .replace(/(password|token|secret|authorization|apikey|api_key)\s*[:=]\s*[^\s,;]+/gi, "$1=***")
      .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, "***jwt***");
  if (error instanceof AppError) {
    console.warn(`[${context}] ${error.status} ${error.code}: ${redact(error.message)}`);
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[${context}] ${redact(message)}`);
}

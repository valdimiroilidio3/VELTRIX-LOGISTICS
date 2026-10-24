import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const DEFAULT_TIMEZONE = "Europe/Lisbon";

export function formatCurrency(cents: number | null | undefined, currency = "EUR"): string {
  if (cents === null || cents === undefined) return "—";
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency, maximumFractionDigits: 2 }).format(cents / 100);
}

export function formatNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("pt-PT", { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(value);
}

export function formatDate(value: string | null | undefined, timezone = DEFAULT_TIMEZONE): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-PT", { dateStyle: "medium", timeZone: timezone }).format(new Date(value));
}

export function formatDateTime(value: string | null | undefined, timezone = DEFAULT_TIMEZONE): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}

export function formatRelative(value: string | null | undefined): string {
  if (!value) return "—";
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.round(diff / 60_000);
  if (Math.abs(minutes) < 1) return "agora";
  if (Math.abs(minutes) < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 31) return `há ${days} d`;
  return formatDate(value);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function isOverdue(dueAt: string | null | undefined): boolean {
  if (!dueAt) return false;
  return new Date(dueAt).getTime() < Date.now();
}

export const SERVICE_LABELS: Record<string, string> = {
  standard: "Standard",
  express: "Express",
  same_day: "Same day",
  freight: "Freight",
  international: "Internacional",
};

export const PRIORITY_LABELS: Record<string, string> = {
  low: "Baixa",
  normal: "Normal",
  high: "Alta",
  urgent: "Urgente",
};

export const ROUTE_STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  planned: "Planeada",
  dispatched: "Despachada",
  in_progress: "Em curso",
  completed: "Concluída",
  cancelled: "Cancelada",
};

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  issued: "Emitida",
  paid: "Paga",
  overdue: "Vencida",
  void: "Anulada",
};

export const QUOTE_STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  sent: "Enviado",
  accepted: "Aceite",
  rejected: "Recusado",
  expired: "Expirado",
};

export const INTEGRATION_STATUS_LABELS: Record<string, string> = {
  not_configured: "Não configurada",
  configured: "Configurada",
  operational: "Operacional",
  error: "Erro",
};

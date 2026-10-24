/**
 * Role-based access control.
 *
 * Permissions are declared here as data, evaluated on the server only.
 * The browser receives the computed permission list for rendering decisions,
 * never the authority to make them: every route handler calls `requirePermission`.
 */

export const ROLES = [
  "super_admin",
  "admin",
  "operations_manager",
  "dispatcher",
  "warehouse_operator",
  "driver",
  "finance",
  "customer",
] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super administrador",
  admin: "Administrador",
  operations_manager: "Gestor de operações",
  dispatcher: "Despachante",
  warehouse_operator: "Operador de armazém",
  driver: "Motorista",
  finance: "Financeiro",
  customer: "Cliente",
};

export const PERMISSIONS = [
  "dashboard:read",
  "shipments:read",
  "shipments:create",
  "shipments:request",
  "shipments:update",
  "shipments:transition",
  "shipments:assign",
  "customers:read",
  "customers:write",
  "quotes:read",
  "quotes:write",
  "invoices:read",
  "invoices:write",
  "payments:write",
  "routes:read",
  "routes:write",
  "routes:optimize",
  "drivers:read",
  "drivers:write",
  "fleet:read",
  "fleet:write",
  "warehouse:read",
  "warehouse:write",
  "inventory:read",
  "inventory:write",
  "documents:read",
  "documents:write",
  "pod:read",
  "pod:submit",
  "analytics:read",
  "audit:read",
  "settings:read",
  "settings:write",
  "users:manage",
  "tasks:read_own",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL: Permission[] = [...PERMISSIONS];

const operations: Permission[] = [
  "dashboard:read",
  "shipments:read",
  "shipments:create",
  "shipments:request",
  "shipments:update",
  "shipments:transition",
  "shipments:assign",
  "customers:read",
  "customers:write",
  "quotes:read",
  "quotes:write",
  "routes:read",
  "routes:write",
  "routes:optimize",
  "drivers:read",
  "drivers:write",
  "fleet:read",
  "fleet:write",
  "warehouse:read",
  "inventory:read",
  "documents:read",
  "documents:write",
  "pod:read",
  "analytics:read",
  "settings:read",
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  super_admin: ALL,
  admin: ALL,
  operations_manager: operations,
  dispatcher: [
    "dashboard:read",
    "shipments:read",
    "shipments:create",
  "shipments:request",
    "shipments:update",
    "shipments:transition",
    "shipments:assign",
    "customers:read",
    "routes:read",
    "routes:write",
    "routes:optimize",
    "drivers:read",
    "fleet:read",
    "warehouse:read",
    "documents:read",
    "documents:write",
    "pod:read",
    "analytics:read",
  ],
  warehouse_operator: [
    "dashboard:read",
    "shipments:read",
    "warehouse:read",
    "warehouse:write",
    "inventory:read",
    "inventory:write",
    "documents:read",
    "documents:write",
    "pod:read",
  ],
  driver: ["tasks:read_own", "shipments:read", "shipments:transition", "pod:submit", "pod:read", "documents:read", "documents:write", "shipments:update"],
  finance: ["dashboard:read", "shipments:read", "customers:read", "quotes:read", "quotes:write", "invoices:read", "invoices:write", "payments:write", "analytics:read", "documents:read"],
  customer: ["shipments:read", "shipments:request", "quotes:read", "invoices:read", "documents:read", "pod:read", "dashboard:read"],
};

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function permissionsForRole(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

/** Statuses allowed to be reached by each role, guarding the state machine. */
export const ROLE_ALLOWED_TRANSITIONS: Partial<Record<Role, string[]>> = {
  customer: ["cancelled"],
  driver: ["in_transit", "out_for_delivery", "delivered", "failed_delivery", "exception"],
  warehouse_operator: ["picked_up", "in_transit"],
  dispatcher: ["quoted", "confirmed", "assigned", "picked_up", "in_transit", "out_for_delivery", "exception", "on_hold", "cancelled"],
  operations_manager: ["quoted", "confirmed", "assigned", "picked_up", "in_transit", "out_for_delivery", "delivered", "exception", "on_hold", "failed_delivery", "returned", "cancelled"],
};

export function roleCanTransitionTo(role: Role, status: string): boolean {
  if (role === "super_admin" || role === "admin") return true;
  return ROLE_ALLOWED_TRANSITIONS[role]?.includes(status) ?? false;
}

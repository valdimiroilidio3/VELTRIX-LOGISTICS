export type Row = Record<string, unknown>;
export type SqlParam = string | number | null | Uint8Array;

export interface RunResult {
  changes: number;
}

/**
 * Minimal portable SQL surface. Placeholders are always `?`; the PostgreSQL
 * driver rewrites them to `$1..$n`. All statements must stay within the
 * intersection of SQLite and PostgreSQL (no vendor-specific functions), which
 * is what makes one repository layer work on both engines.
 */
export interface Db {
  readonly dialect: "sqlite" | "postgres";
  all<T = Row>(sql: string, params?: SqlParam[]): Promise<T[]>;
  get<T = Row>(sql: string, params?: SqlParam[]): Promise<T | undefined>;
  run(sql: string, params?: SqlParam[]): Promise<RunResult>;
  exec(sql: string): Promise<void>;
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
}

/** Booleans are stored as SMALLINT/INTEGER in both engines. */
export function toParam(value: unknown): SqlParam {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

/** Rewrites ? placeholders, skipping anything inside single-quoted literals. */
export function toPgPlaceholders(sql: string): string {
  let index = 0;
  let inString = false;
  let out = "";
  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    if (char === "'") inString = !inString;
    if (char === "?" && !inString) {
      index += 1;
      out += `$${index}`;
    } else {
      out += char;
    }
  }
  return out;
}

import { Pool, type PoolClient } from "pg";
import { toParam, toPgPlaceholders, type Db, type RunResult, type SqlParam } from "./types";

/**
 * PostgreSQL (Supabase) driver. Mirrors the SQLite driver's contract.
 * Uses a pool with a single reusable client per transaction so that
 * BEGIN/COMMIT are guaranteed to be on the same connection.
 */

function normaliseRows<T>(rows: Record<string, unknown>[]): T[] {
  return rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      // pg returns NUMERIC as string; the app uses integers/BIGINT-free values only.
      out[key] = typeof value === "bigint" ? Number(value) : value;
    }
    return out as T;
  });
}

function makeClient(dialect: "postgres", query: (sql: string, params?: SqlParam[]) => Promise<Record<string, unknown>[]>): Db {
  return {
    dialect,
    async all<T>(sql: string, params: SqlParam[] = []): Promise<T[]> {
      return normaliseRows<T>(await query(sql, params));
    },
    async get<T>(sql: string, params: SqlParam[] = []): Promise<T | undefined> {
      const rows = await query(sql, params);
      return normaliseRows<T>(rows)[0];
    },
    async run(sql: string, params: SqlParam[] = []): Promise<RunResult> {
      const rows = await query(sql, params);
      const first = rows[0] as { __changes?: number } | undefined;
      return { changes: first?.__changes ?? rows.length };
    },
    async exec(sql: string): Promise<void> {
      await query(sql);
    },
    async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
      return fn(makeClient(dialect, query));
    },
  };
}

const globalForPg = globalThis as unknown as { __veltrixPg?: Pool };

export function getPostgresDb(connectionString: string): Db {
  if (!globalForPg.__veltrixPg) {
    globalForPg.__veltrixPg = new Pool({
      connectionString,
      max: Number(process.env.PG_POOL_MAX ?? 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      ssl: process.env.PG_SSL === "disable" ? false : { rejectUnauthorized: false },
      application_name: "veltrix",
    });
  }
  const pool = globalForPg.__veltrixPg;

  const runOn = (client: PoolClient | Pool) => async (sql: string, params: SqlParam[] = []) => {
    const text = toPgPlaceholders(sql);
    const values = params.map((p) => toParam(p));
    const result = await client.query(text, values);
    // run() needs a change count; statements without RETURNING report rowCount.
    if (result.rows.length === 0 && result.rowCount !== null) {
      return [{ __changes: result.rowCount }];
    }
    return result.rows;
  };

  const root = makeClient("postgres", runOn(pool));

  return {
    ...root,
    async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const scoped = makeClient("postgres", runOn(client));
        const result = await fn(scoped);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // connection already broken
        }
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

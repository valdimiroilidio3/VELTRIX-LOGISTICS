import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { SQLITE_SCHEMA } from "./schema-sqlite";
import { toParam, type Db, type RunResult, type SqlParam } from "./types";

/**
 * Local SQLite driver. Used for local development and the demo build only.
 * Production uses PostgreSQL (see ./postgres.ts). The schema and every query
 * are kept in the portable subset documented in ./types.ts.
 */

function resolveDbPath(): string {
  if (process.env.SQLITE_PATH) return process.env.SQLITE_PATH;
  const dir = path.join(process.cwd(), ".data");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "veltrix.db");
}

function createSqlite(): Db {
  const file = resolveDbPath();
  const db = new DatabaseSync(file);
  db.exec(SQLITE_SCHEMA);

  // Additive safety net for databases created by an earlier build: SQLite has no
  // migration runner here, so new nullable/defaulted columns are added in place.
  const hasColumn = (table: string, column: string) =>
    (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some((row) => row.name === column);
  if (!hasColumn("profiles", "must_change_password")) {
    db.exec("ALTER TABLE profiles ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0");
  }

  // Serialise transactions: async interleaving must never mix two transactions.
  let lock: Promise<unknown> = Promise.resolve();

  const client: Db = {
    dialect: "sqlite",
    async all<T>(sql: string, params: SqlParam[] = []): Promise<T[]> {
      const statement = db.prepare(sql);
      const rows = statement.all(...params.map((p) => toParam(p)));
      // node:sqlite returns null-prototype objects, which React refuses to
      // serialise across the server/client boundary — normalise to plain objects.
      return rows.map((row) => ({ ...row })) as T[];
    },
    async get<T>(sql: string, params: SqlParam[] = []): Promise<T | undefined> {
      const statement = db.prepare(sql);
      const row = statement.get(...params.map((p) => toParam(p)));
      return row ? ({ ...row } as T) : undefined;
    },
    async run(sql: string, params: SqlParam[] = []): Promise<RunResult> {
      const statement = db.prepare(sql);
      const result = statement.run(...params.map((p) => toParam(p)));
      return { changes: Number(result.changes) };
    },
    async exec(sql: string): Promise<void> {
      db.exec(sql);
    },
    async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
      const runTx = async (): Promise<T> => {
        db.exec("BEGIN IMMEDIATE");
        try {
          const result = await fn(client);
          db.exec("COMMIT");
          return result;
        } catch (error) {
          try {
            db.exec("ROLLBACK");
          } catch {
            // the transaction was already aborted by SQLite
          }
          throw error;
        }
      };
      const next = lock.then(runTx, runTx);
      lock = next.catch(() => undefined);
      return next;
    },
  };

  return client;
}

const globalForDb = globalThis as unknown as { __veltrixSqlite?: Db };

export function getSqliteDb(): Db {
  if (!globalForDb.__veltrixSqlite) {
    globalForDb.__veltrixSqlite = createSqlite();
  }
  return globalForDb.__veltrixSqlite;
}

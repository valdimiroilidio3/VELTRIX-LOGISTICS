import { env } from "@/lib/env";
import { getPostgresDb } from "./postgres";
import { getSqliteDb } from "./sqlite";
import type { Db } from "./types";

export type { Db } from "./types";
export { toParam } from "./types";

const globalForDb = globalThis as unknown as {
  __veltrixDb?: Db;
  __veltrixInit?: Promise<void>;
};

/** Returns the configured database. PostgreSQL when DATABASE_URL exists, else local demo store. */
export function db(): Db {
  if (!globalForDb.__veltrixDb) {
    globalForDb.__veltrixDb = env.databaseUrl ? getPostgresDb(env.databaseUrl) : getSqliteDb();
  }
  return globalForDb.__veltrixDb;
}

/**
 * Ensures the local demo store is seeded. In PostgreSQL mode the schema is
 * managed by versioned migrations (`npm run db:migrate`) and this is a no-op.
 */
export async function ensureDatabase(): Promise<void> {
  if (env.databaseUrl) return;
  if (!globalForDb.__veltrixInit) {
    globalForDb.__veltrixInit = (async () => {
      const { seedDemoData } = await import("./seed");
      await seedDemoData(db());
    })();
  }
  return globalForDb.__veltrixInit;
}

export const isDemoDataMode = () => env.dataMode === "sqlite";

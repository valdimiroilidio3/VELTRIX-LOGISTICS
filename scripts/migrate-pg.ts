/**
 * Versioned PostgreSQL migration runner.
 *
 * - Reads db/postgres/*.sql in lexical order.
 * - Records applied files in `schema_migrations` (checksum protected).
 * - Each file runs inside a transaction; a failure rolls back that file only.
 * - Refuses destructive statements unless `--allow-destructive` is passed, and
 *   only allows them when the target is not flagged as production.
 *
 * Usage:
 *   DATABASE_URL=postgres://... npm run db:migrate
 *   DATABASE_URL=... npm run db:migrate -- --dry-run
 */
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { Client } from "pg";

const MIGRATIONS_DIR = path.join(process.cwd(), "db", "postgres");
const DESTRUCTIVE = /\b(drop\s+table|truncate|drop\s+schema|delete\s+from)\b/i;

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("[migrate] DATABASE_URL is not set.");
    process.exit(1);
  }
  const dryRun = process.argv.includes("--dry-run");
  const allowDestructive = process.argv.includes("--allow-destructive");
  const isProduction = process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";

  const files = (await fs.readdir(MIGRATIONS_DIR)).filter((file) => file.endsWith(".sql")).sort();
  const client = new Client({ connectionString, ssl: process.env.PG_SSL === "disable" ? false : { rejectUnauthorized: false } });
  await client.connect();

  try {
    await client.query(`
      create table if not exists schema_migrations (
        filename text primary key,
        checksum text not null,
        applied_at timestamptz not null default now()
      )
    `);

    for (const file of files) {
      const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const existing = await client.query<{ checksum: string }>("select checksum from schema_migrations where filename = $1", [file]);

      if (existing.rowCount && existing.rows[0]) {
        if (existing.rows[0].checksum !== checksum) {
          console.error(`[migrate] ${file} was modified after being applied. Create a new migration instead.`);
          process.exit(1);
        }
        console.log(`[migrate] skip ${file} (already applied)`);
        continue;
      }

      if (DESTRUCTIVE.test(sql) && (!allowDestructive || isProduction)) {
        console.error(`[migrate] ${file} contains destructive statements — refused. Back up first and pass --allow-destructive outside production.`);
        process.exit(1);
      }

      if (dryRun) {
        console.log(`[migrate] would apply ${file}`);
        continue;
      }

      console.log(`[migrate] applying ${file}`);
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into schema_migrations (filename, checksum) values ($1, $2)", [file, checksum]);
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }
    console.log("[migrate] done");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("[migrate] failed", error);
  process.exit(1);
});

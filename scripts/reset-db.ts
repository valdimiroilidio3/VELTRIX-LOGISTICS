/** Deletes the local SQLite demo database (development only — never touches PostgreSQL). */
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../src/lib/env";

async function main() {
  if (env.dataMode !== "sqlite") {
    console.error("[reset-db] refused: DATABASE_URL is configured (PostgreSQL). Drop tables manually after a backup.");
    process.exit(1);
  }
  const dir = path.join(process.cwd(), ".data");
  await fs.rm(dir, { recursive: true, force: true });
  console.log("[reset-db] local demo database removed; it will be recreated on next start.");
}

main();

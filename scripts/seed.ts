/**
 * Seeds the configured database with demonstration data.
 * PostgreSQL mode also requires `npm run db:migrate` first.
 */
import { db, ensureDatabase } from "../src/lib/db";
import { seedDemoData } from "../src/lib/db/seed";
import { env } from "../src/lib/env";

async function main() {
  console.log(`[seed] dialect=${env.dataMode}`);
  await ensureDatabase(); // sqlite: creates schema + seeds automatically
  if (env.dataMode === "postgres") {
    await seedDemoData(db());
  }
  const org = await db().get<{ id: string }>("SELECT id FROM organizations ORDER BY created_at ASC");
  console.log(org ? `[seed] ok — organisation ${org.id}` : "[seed] no organisation created");
}

main().catch((error) => {
  console.error("[seed] failed", error);
  process.exit(1);
});

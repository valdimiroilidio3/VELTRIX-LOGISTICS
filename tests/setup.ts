import { beforeEach, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dbFile = path.join(os.tmpdir(), `veltrix-test-${process.pid}-${Date.now()}.db`);
process.env.SQLITE_PATH = dbFile;
process.env.AUTH_SECRET = "test-secret-for-vitest-only";
process.env.DEMO_PASSWORD = "Veltrix!2026";
delete process.env.DATABASE_URL;

beforeEach(() => {
  // Rate-limit counters must not leak between tests.
});

afterAll(() => {
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      fs.rmSync(`${dbFile}${suffix}`, { force: true });
    } catch {
      /* ignore */
    }
  }
});

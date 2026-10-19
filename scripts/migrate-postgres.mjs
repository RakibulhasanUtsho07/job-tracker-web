import postgres from "postgres";

try { process.loadEnvFile?.(".env.local"); } catch (error) { if (error?.code !== "ENOENT") throw error; }

import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  console.error("DATABASE_URL is required. Configure PostgreSQL before running migrations.");
  process.exit(1);
}

const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../db/migrations");
const files = (await readdir(directory)).filter((name) => /^\d{3}_.+\.sql$/.test(name)).sort();
const sql = postgres(connectionString, { max: 1, prepare: false, connect_timeout: 10, ...(process.env.DATABASE_SSL === "require" ? { ssl: "require" } : {}) });
try {
  for (const name of files) {
    const version = Number(name.slice(0, 3));
    if (version > 0) {
      const known = await sql.unsafe('SELECT 1 FROM "_HireFlowMigration" WHERE "version" = $1 LIMIT 1', [version]);
      if (known.length) { console.log("skip " + name + " (already applied)"); continue; }
    }
    await sql.file(path.join(directory, name));
    console.log("applied " + name);
  }
} finally {
  await sql.end({ timeout: 5 });
}

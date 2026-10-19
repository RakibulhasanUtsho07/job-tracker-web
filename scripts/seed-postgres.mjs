import postgres from "postgres";
import path from "node:path";
import { fileURLToPath } from "node:url";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  console.error("DATABASE_URL is required. Configure PostgreSQL before seeding.");
  process.exit(1);
}
const sql = postgres(connectionString, { max: 1, prepare: false, connect_timeout: 10, ...(process.env.DATABASE_SSL === "require" ? { ssl: "require" } : {}) });
try {
  const seed = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../db/seeds/legacy_careers_jobs.sql");
  await sql.file(seed);
  console.log("Seeded the six compatibility jobs without overwriting existing job records.");
} finally {
  await sql.end({ timeout: 5 });
}

import postgres from "postgres";

try { process.loadEnvFile?.(".env.local"); } catch (error) { if (error?.code !== "ENOENT") throw error; }

import { randomBytes, randomUUID, scryptSync } from "node:crypto";

const connectionString = process.env.DATABASE_URL?.trim();
const email = process.env.RECRUITER_EMAIL?.trim().toLowerCase();
const password = process.env.RECRUITER_PASSWORD ?? "";
const name = (process.env.RECRUITER_NAME ?? "Demo Recruiter").trim();
if (!connectionString || !email || !password || password.length < 12 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("Configure DATABASE_URL, RECRUITER_EMAIL, and a RECRUITER_PASSWORD of at least 12 characters. This is a trusted operator action, not a public API.");
  process.exit(1);
}
const sql = postgres(connectionString, { max: 1, prepare: false, connect_timeout: 10, ...(process.env.DATABASE_SSL === "require" ? { ssl: "require" } : {}) });
try {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  const requestedId = randomUUID();
  const created = await sql.unsafe('INSERT INTO "User" ("id", "name", "email", "passwordSalt", "passwordHash", "role") VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING RETURNING "id", "email", "role"', [requestedId, name || "Demo Recruiter", email, salt, hash, "RECRUITER"]);
  let current = created[0];
  if (!current) {
    const existing = await sql.unsafe('SELECT "id", "email", "role" FROM "User" WHERE lower(btrim("email")) = $1 LIMIT 1', [email]);
    if (!existing[0]) throw new Error("Could not create or locate the configured recruiter account.");
    const updated = await sql.unsafe('UPDATE "User" SET "role" = CASE WHEN "role" = $1 THEN $1 ELSE $2 END WHERE "id" = $3 RETURNING "id", "email", "role"', ["ADMIN", "RECRUITER", existing[0].id]);
    current = updated[0];
  }
  await sql.unsafe('UPDATE "Job" SET "recruiterId" = $1 WHERE "recruiterId" IS NULL AND "id" IN ($2, $3, $4, $5, $6, $7)', [current.id, "web-developer", "product-designer", "backend-engineer", "qa-engineer", "data-analyst-intern", "customer-success"]);
  console.log("Trusted recruiter ready: " + current.email + " (" + current.role + "). Credentials were not printed.");
} finally {
  await sql.end({ timeout: 5 });
}

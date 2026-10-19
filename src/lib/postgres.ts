import "server-only";

import postgres from "postgres";

let client: ReturnType<typeof postgres> | undefined;

/** Lazily create the PostgreSQL pool so importing a route never connects during
 * the Next.js build. Runtime requests fail closed when DATABASE_URL is missing. */
export function getPostgres() {
  if (client) return client;
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("DATABASE_URL is required. Copy .env.example, configure PostgreSQL, and run npm run db:migrate.");
  }

  const max = Number(process.env.DATABASE_POOL_MAX ?? 10);
  client = postgres(connectionString, {
    max: Number.isInteger(max) && max >= 1 && max <= 30 ? max : 10,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
    ...(process.env.DATABASE_SSL === "require" ? { ssl: "require" as const } : {}),
    onnotice: () => undefined,
  });
  return client;
}

import "server-only";
import { createHash } from "node:crypto";
import { getPostgres } from "@/lib/postgres";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;
const BLOCK_MS = 15 * 60 * 1000;

function bucketKey(request: Request): string {
  // Prefer a reverse-proxy supplied single client IP. If only X-Forwarded-For
  // exists, use its right-most entry to avoid trusting client-prepended values.
  const realIp = request.headers.get("x-real-ip")?.trim();
  const forwarded = request.headers.get("x-forwarded-for")
    ?.split(",").map(value => value.trim()).filter(Boolean).at(-1);
  const client = realIp || forwarded || "unknown-client";
  return createHash("sha256").update("hireflow:login-ip:" + client).digest("hex");
}

function remainingSeconds(value: unknown): number {
  if (!value) return 0;
  const blockedUntil = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
  return Number.isFinite(blockedUntil) && blockedUntil > Date.now()
    ? Math.ceil((blockedUntil - Date.now()) / 1000)
    : 0;
}

export async function getLoginBlockSeconds(request: Request): Promise<number> {
  if (process.env.NODE_ENV !== "production") return 0;
  const rows = await getPostgres().unsafe(
    'SELECT "blockedUntil" FROM "AuthRateLimit" WHERE "bucketKey"=$1 LIMIT 1',
    [bucketKey(request)],
  );
  return remainingSeconds(rows[0]?.blockedUntil);
}

export async function recordFailedLogin(request: Request): Promise<number> {
  if (process.env.NODE_ENV !== "production") return 0;
  const now = new Date();
  const key = bucketKey(request);
  const rows = await getPostgres().unsafe(
    `INSERT INTO "AuthRateLimit" ("bucketKey","windowStartedAt","attemptCount","blockedUntil","updatedAt")
     VALUES ($1,$2,1,NULL,$2)
     ON CONFLICT ("bucketKey") DO UPDATE SET
       "windowStartedAt" = CASE
         WHEN "AuthRateLimit"."windowStartedAt" <= $2::timestamptz - ($3::int * INTERVAL '1 millisecond')
           OR ("AuthRateLimit"."blockedUntil" IS NOT NULL AND "AuthRateLimit"."blockedUntil" <= $2::timestamptz)
         THEN $2::timestamptz ELSE "AuthRateLimit"."windowStartedAt" END,
       "attemptCount" = CASE
         WHEN "AuthRateLimit"."windowStartedAt" <= $2::timestamptz - ($3::int * INTERVAL '1 millisecond')
           OR ("AuthRateLimit"."blockedUntil" IS NOT NULL AND "AuthRateLimit"."blockedUntil" <= $2::timestamptz)
         THEN 1 ELSE "AuthRateLimit"."attemptCount" + 1 END,
       "blockedUntil" = CASE
         WHEN "AuthRateLimit"."blockedUntil" > $2::timestamptz THEN "AuthRateLimit"."blockedUntil"
         WHEN "AuthRateLimit"."windowStartedAt" <= $2::timestamptz - ($3::int * INTERVAL '1 millisecond')
           OR ("AuthRateLimit"."blockedUntil" IS NOT NULL AND "AuthRateLimit"."blockedUntil" <= $2::timestamptz)
         THEN NULL
         WHEN "AuthRateLimit"."attemptCount" + 1 >= $4::int
         THEN $2::timestamptz + ($5::int * INTERVAL '1 millisecond')
         ELSE NULL END,
       "updatedAt" = $2::timestamptz
     RETURNING "blockedUntil"`,
    [key, now, WINDOW_MS, MAX_FAILURES, BLOCK_MS],
  );
  return remainingSeconds(rows[0]?.blockedUntil);
}


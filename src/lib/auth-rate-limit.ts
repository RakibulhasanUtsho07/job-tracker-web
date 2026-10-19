import "server-only";
import { createHash } from "node:crypto";
import { getPostgres } from "@/lib/postgres";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;
const BLOCK_MS = 15 * 60 * 1000;

function bucketKey(request: Request): string | null {
  // The reverse proxy must strip client-supplied headers and set a trusted IP.
  const realIp = request.headers.get("x-real-ip")?.trim();
  const forwarded = request.headers.get("x-forwarded-for")
    ?.split(",").map(value => value.trim()).filter(Boolean).at(-1);
  const client = realIp || forwarded;
  // Never put every visitor into one shared "unknown" bucket when no trusted IP
  // is configured; the deployment should fix its proxy instead of locking out all users.
  if (!client) return null;
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
  const key = bucketKey(request);
  if (!key) return 0;
  const rows = await getPostgres().unsafe(
    'SELECT "blockedUntil" FROM "AuthRateLimit" WHERE "bucketKey"=$1 LIMIT 1',
    [key],
  );
  return remainingSeconds(rows[0]?.blockedUntil);
}

export async function recordFailedLogin(request: Request): Promise<number> {
  if (process.env.NODE_ENV !== "production") return 0;
  const key = bucketKey(request);
  if (!key) return 0;
  const now = new Date();
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


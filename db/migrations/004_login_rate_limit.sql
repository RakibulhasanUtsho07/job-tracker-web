-- Persistent failed-login rate limit buckets, keyed by a one-way digest of client identity.
BEGIN;
CREATE TABLE IF NOT EXISTS "AuthRateLimit" (
  "bucketKey" CHAR(64) PRIMARY KEY CHECK ("bucketKey" ~ '^[a-f0-9]{64}$'),
  "windowStartedAt" TIMESTAMPTZ NOT NULL,
  "attemptCount" INTEGER NOT NULL CHECK ("attemptCount" >= 0),
  "blockedUntil" TIMESTAMPTZ,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AuthRateLimit_updated_idx" ON "AuthRateLimit" ("updatedAt");
INSERT INTO "_HireFlowMigration" ("version","name")
VALUES (4,'persistent_login_rate_limit')
ON CONFLICT ("version") DO NOTHING;
COMMIT;

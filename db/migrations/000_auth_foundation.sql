-- HireFlow migration 000: application-owned authentication storage.
-- This preserves the opaque-session + scrypt password approach while moving the
-- source of truth from SQLite to PostgreSQL. Public signup can only create
-- CANDIDATE accounts; recruiter promotion is restricted to trusted bootstrap.
BEGIN;

CREATE TABLE IF NOT EXISTS "_HireFlowMigration" (
  "version" INTEGER PRIMARY KEY,
  "name" TEXT NOT NULL,
  "appliedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT PRIMARY KEY,
  "name" VARCHAR(160) NOT NULL CHECK (length(trim("name")) BETWEEN 2 AND 160),
  "email" VARCHAR(320) NOT NULL,
  "passwordSalt" VARCHAR(128) NOT NULL,
  "passwordHash" VARCHAR(256) NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'CANDIDATE'
    CHECK ("role" IN ('CANDIDATE', 'RECRUITER', 'ADMIN')),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Session" (
  "tokenHash" CHAR(64) PRIMARY KEY CHECK ("tokenHash" ~ '^[a-f0-9]{64}$'),
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "csrfToken" VARCHAR(128) NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "Session_user_idx" ON "Session" ("userId");
CREATE INDEX IF NOT EXISTS "Session_expiry_idx" ON "Session" ("expiresAt");

INSERT INTO "_HireFlowMigration" ("version", "name")
VALUES (0, 'hireflow_auth_foundation')
ON CONFLICT ("version") DO NOTHING;
COMMIT;

-- HireFlow migration 002: user-scoped idempotency for application submissions.
BEGIN;
CREATE TABLE IF NOT EXISTS "IdempotencyRecord" (
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "idempotencyKey" VARCHAR(128) NOT NULL,
  "responseStatus" SMALLINT NOT NULL CHECK ("responseStatus" BETWEEN 100 AND 599),
  "responseJson" JSONB NOT NULL CHECK (jsonb_typeof("responseJson") = 'object'),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("userId", "idempotencyKey")
);
CREATE INDEX IF NOT EXISTS "IdempotencyRecord_created_idx"
  ON "IdempotencyRecord" ("createdAt");
INSERT INTO "_HireFlowMigration" ("version", "name")
VALUES (2, 'application_idempotency_records')
ON CONFLICT ("version") DO NOTHING;
COMMIT;

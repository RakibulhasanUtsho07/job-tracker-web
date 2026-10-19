-- Bind each idempotency key to the canonical application payload.
-- Existing records remain nullable for a safe upgrade; their old payload cannot be reconstructed.
BEGIN;
ALTER TABLE "IdempotencyRecord"
  ADD COLUMN IF NOT EXISTS "requestHash" VARCHAR(64);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = '"IdempotencyRecord"'::regclass
      AND conname = 'IdempotencyRecord_request_hash_check'
  ) THEN
    ALTER TABLE "IdempotencyRecord"
      ADD CONSTRAINT "IdempotencyRecord_request_hash_check"
      CHECK ("requestHash" IS NULL OR "requestHash" ~ '^[a-f0-9]{64}$');
  END IF;
END
$$;
INSERT INTO "_HireFlowMigration" ("version","name")
VALUES (3,'idempotency_payload_binding')
ON CONFLICT ("version") DO NOTHING;
COMMIT;

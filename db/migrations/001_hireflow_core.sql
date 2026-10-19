-- HireFlow PostgreSQL business schema, migration 001.
-- Run the selected auth provider's own migration first. This file intentionally
-- extends the auth provider's "User" table and does not recreate auth tables.
-- Application code must still be migrated from the legacy SQLite implementation
-- before PostgreSQL can be considered the runtime source of truth.

BEGIN;

DO $$
BEGIN
  IF to_regclass('"User"') IS NULL THEN
    RAISE EXCEPTION
      'HireFlow migration requires the auth provider migration to create the quoted "User" table first';
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "_HireFlowMigration" (
  "version" INTEGER PRIMARY KEY,
  "name" TEXT NOT NULL,
  "appliedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Application-managed authorization field on the auth library's user identity.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'CANDIDATE';

UPDATE "User"
SET "role" = UPPER("role")
WHERE "role" IS NOT NULL AND "role" <> UPPER("role");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = '"User"'::regclass
      AND conname = 'User_role_allowed_check'
  ) THEN
    ALTER TABLE "User"
      ADD CONSTRAINT "User_role_allowed_check"
      CHECK ("role" IN ('CANDIDATE', 'RECRUITER', 'ADMIN'));
  END IF;
END
$$;

DO $$
BEGIN
  CREATE TYPE "JobStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE "ApplicationStatus" AS ENUM (
    'APPLIED',
    'SCREENING',
    'SHORTLISTED',
    'INTERVIEW',
    'OFFERED',
    'HIRED',
    'REJECTED',
    'WITHDRAWN'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE "JobSkillKind" AS ENUM ('REQUIRED', 'PREFERRED');
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE "MatchAnalysisStatus" AS ENUM ('COMPLETED', 'UNAVAILABLE', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS "CandidateProfile" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL UNIQUE
    REFERENCES "User"("id") ON DELETE RESTRICT,
  "headline" VARCHAR(160),
  "location" VARCHAR(160),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Job" (
  "id" TEXT PRIMARY KEY,
  -- NULL is reserved for imported legacy/demo rows; newly created jobs must
  -- always be owned by an authenticated recruiter at the service layer.
  "recruiterId" TEXT REFERENCES "User"("id") ON DELETE RESTRICT,
  "title" VARCHAR(160) NOT NULL CHECK (length(trim("title")) > 0),
  "department" VARCHAR(120),
  "description" TEXT NOT NULL CHECK (length(trim("description")) > 0),
  "location" VARCHAR(160),
  "workMode" TEXT CHECK ("workMode" IS NULL OR "workMode" IN ('REMOTE', 'HYBRID', 'ON_SITE')),
  "employmentType" TEXT CHECK (
    "employmentType" IS NULL OR
    "employmentType" IN ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'TEMPORARY')
  ),
  "level" VARCHAR(120),
  "salary" VARCHAR(120),
  "highlights" JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof("highlights") = 'array'),
  "status" "JobStatus" NOT NULL DEFAULT 'DRAFT',
  "closingAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "JobSkill" (
  "id" TEXT PRIMARY KEY,
  "jobId" TEXT NOT NULL REFERENCES "Job"("id") ON DELETE RESTRICT,
  "nameNormalized" VARCHAR(100) NOT NULL CHECK (length(trim("nameNormalized")) > 0),
  "displayName" VARCHAR(120) NOT NULL CHECK (length(trim("displayName")) > 0),
  "kind" "JobSkillKind" NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JobSkill_job_name_kind_unique"
    UNIQUE ("jobId", "nameNormalized", "kind")
);

CREATE TABLE IF NOT EXISTS "Application" (
  "id" TEXT PRIMARY KEY,
  "candidateId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "jobId" TEXT NOT NULL REFERENCES "Job"("id") ON DELETE RESTRICT,
  -- Snapshot the submitted identity/details so later profile edits do not
  -- rewrite the historical application.
  "fullName" VARCHAR(160) NOT NULL CHECK (length(trim("fullName")) > 0),
  "email" VARCHAR(320) NOT NULL CHECK (length(trim("email")) > 0),
  "linkedinUrl" VARCHAR(500) NOT NULL DEFAULT '',
  "experienceLevel" VARCHAR(40) NOT NULL,
  "coverLetter" VARCHAR(5000) NOT NULL DEFAULT '',
  "status" "ApplicationStatus" NOT NULL DEFAULT 'APPLIED',
  "submittedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Application_candidate_job_unique" UNIQUE ("candidateId", "jobId")
);

CREATE TABLE IF NOT EXISTS "ResumeAsset" (
  "id" TEXT PRIMARY KEY,
  "applicationId" TEXT NOT NULL UNIQUE
    REFERENCES "Application"("id") ON DELETE RESTRICT,
  "storageKey" VARCHAR(512) NOT NULL UNIQUE
    CHECK (length(trim("storageKey")) > 0),
  "originalFileName" VARCHAR(255) NOT NULL,
  "mimeType" VARCHAR(100) NOT NULL CHECK ("mimeType" = 'application/pdf'),
  "sizeBytes" INTEGER NOT NULL CHECK ("sizeBytes" BETWEEN 1 AND 5000000),
  "checksum" VARCHAR(64) CHECK ("checksum" IS NULL OR "checksum" ~ '^[a-f0-9]{64}$'),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "ApplicationEvent" (
  "id" TEXT PRIMARY KEY,
  "applicationId" TEXT NOT NULL
    REFERENCES "Application"("id") ON DELETE RESTRICT,
  "actorId" TEXT REFERENCES "User"("id") ON DELETE RESTRICT,
  "fromStatus" "ApplicationStatus",
  "toStatus" "ApplicationStatus" NOT NULL,
  "eventSource" TEXT NOT NULL DEFAULT 'USER_ACTION'
    CHECK ("eventSource" IN ('USER_ACTION', 'MIGRATION_BASELINE', 'SYSTEM')),
  "note" VARCHAR(1000),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApplicationEvent_initial_status_check"
    CHECK ("fromStatus" IS NOT NULL OR "eventSource" IN ('MIGRATION_BASELINE', 'SYSTEM', 'USER_ACTION'))
);

CREATE TABLE IF NOT EXISTS "MatchAnalysis" (
  "id" TEXT PRIMARY KEY,
  "applicationId" TEXT NOT NULL
    REFERENCES "Application"("id") ON DELETE RESTRICT,
  "algorithmVersion" VARCHAR(80) NOT NULL CHECK (length(trim("algorithmVersion")) > 0),
  "overallScore" NUMERIC(5, 2) CHECK ("overallScore" IS NULL OR "overallScore" BETWEEN 0 AND 100),
  "skillCoverageScore" NUMERIC(5, 2)
    CHECK ("skillCoverageScore" IS NULL OR "skillCoverageScore" BETWEEN 0 AND 100),
  "textSimilarityScore" NUMERIC(5, 2)
    CHECK ("textSimilarityScore" IS NULL OR "textSimilarityScore" BETWEEN 0 AND 100),
  "matchedSkills" JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof("matchedSkills") = 'array'),
  "missingRequiredSkills" JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof("missingRequiredSkills") = 'array'),
  "analysisStatus" "MatchAnalysisStatus" NOT NULL,
  "analysisMessage" VARCHAR(1000),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "Job_public_listing_idx"
  ON "Job" ("status", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "Job_recruiter_status_idx"
  ON "Job" ("recruiterId", "status");
CREATE INDEX IF NOT EXISTS "Job_closing_at_idx"
  ON "Job" ("closingAt");
CREATE INDEX IF NOT EXISTS "JobSkill_job_kind_idx"
  ON "JobSkill" ("jobId", "kind");
CREATE INDEX IF NOT EXISTS "Application_review_queue_idx"
  ON "Application" ("jobId", "status", "submittedAt" DESC);
CREATE INDEX IF NOT EXISTS "Application_candidate_dashboard_idx"
  ON "Application" ("candidateId", "submittedAt" DESC);
CREATE INDEX IF NOT EXISTS "ApplicationEvent_timeline_idx"
  ON "ApplicationEvent" ("applicationId", "createdAt" DESC, "id");
CREATE INDEX IF NOT EXISTS "MatchAnalysis_history_idx"
  ON "MatchAnalysis" ("applicationId", "createdAt" DESC, "id");

-- Database-enforced timestamps for updates, even when a caller bypasses Prisma.
CREATE OR REPLACE FUNCTION "hireflow_set_updated_at"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW."updatedAt" = CURRENT_TIMESTAMP;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS "CandidateProfile_set_updated_at" ON "CandidateProfile";
CREATE TRIGGER "CandidateProfile_set_updated_at"
  BEFORE UPDATE ON "CandidateProfile"
  FOR EACH ROW EXECUTE FUNCTION "hireflow_set_updated_at"();

DROP TRIGGER IF EXISTS "Job_set_updated_at" ON "Job";
CREATE TRIGGER "Job_set_updated_at"
  BEFORE UPDATE ON "Job"
  FOR EACH ROW EXECUTE FUNCTION "hireflow_set_updated_at"();

DROP TRIGGER IF EXISTS "Application_set_updated_at" ON "Application";
CREATE TRIGGER "Application_set_updated_at"
  BEFORE UPDATE ON "Application"
  FOR EACH ROW EXECUTE FUNCTION "hireflow_set_updated_at"();

-- Audit and analysis rows are append-only. Application services may INSERT;
-- corrections require a new event/analysis instead of rewriting old evidence.
CREATE OR REPLACE FUNCTION "hireflow_reject_history_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% rows are append-only; insert a new record instead', TG_TABLE_NAME
    USING ERRCODE = '55000';
END
$$;

DROP TRIGGER IF EXISTS "ApplicationEvent_append_only" ON "ApplicationEvent";
CREATE TRIGGER "ApplicationEvent_append_only"
  BEFORE UPDATE OR DELETE ON "ApplicationEvent"
  FOR EACH ROW EXECUTE FUNCTION "hireflow_reject_history_mutation"();

DROP TRIGGER IF EXISTS "MatchAnalysis_append_only" ON "MatchAnalysis";
CREATE TRIGGER "MatchAnalysis_append_only"
  BEFORE UPDATE OR DELETE ON "MatchAnalysis"
  FOR EACH ROW EXECUTE FUNCTION "hireflow_reject_history_mutation"();

INSERT INTO "_HireFlowMigration" ("version", "name")
VALUES (1, 'hireflow_core_business_schema')
ON CONFLICT ("version") DO NOTHING;

COMMIT;

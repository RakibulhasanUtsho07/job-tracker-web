-- Executed by scripts/verify-postgres-migrations.sh against a disposable database.

INSERT INTO "User" ("id", "name", "email", "passwordSalt", "passwordHash", "role")
VALUES
  ('ci-recruiter', 'CI Recruiter', 'ci-recruiter@example.invalid', 'ci-salt', 'ci-hash', 'RECRUITER'),
  ('ci-candidate', 'CI Candidate', 'ci-candidate@example.invalid', 'ci-salt', 'ci-hash', 'CANDIDATE')
ON CONFLICT ("id") DO NOTHING;

-- Public, legacy job IDs must all survive two seed passes.
DO $$
DECLARE
  legacy_count INTEGER;
  migration_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO legacy_count
  FROM "Job"
  WHERE "id" IN (
    'web-developer',
    'product-designer',
    'backend-engineer',
    'qa-engineer',
    'data-analyst-intern',
    'customer-success'
  );

  IF legacy_count <> 6 THEN
    RAISE EXCEPTION 'Expected 6 legacy job IDs, found %', legacy_count;
  END IF;

  SELECT COUNT(*) INTO migration_count
  FROM "_HireFlowMigration"
  WHERE "version" = 1 AND "name" = 'hireflow_core_business_schema';

  IF migration_count <> 1 THEN
    RAISE EXCEPTION 'Expected one recorded version-1 migration, found %', migration_count;
  END IF;

  IF (SELECT "role" FROM "User" WHERE "id" = 'ci-candidate') <> 'CANDIDATE' THEN
    RAISE EXCEPTION 'Candidate role default/constraint is not preserved';
  END IF;
END
$$;

INSERT INTO "Job"
  ("id", "recruiterId", "title", "description", "status", "closingAt")
VALUES
  ('ci-test-job', 'ci-recruiter', 'CI Test Job', 'Fixture used only for schema tests.', 'PUBLISHED', NULL)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "Application"
  ("id", "candidateId", "jobId", "fullName", "email", "experienceLevel", "status")
VALUES
  ('ci-test-application', 'ci-candidate', 'ci-test-job', 'CI Candidate',
   'ci-candidate@example.invalid', 'Mid-level', 'APPLIED')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "ApplicationEvent"
  ("id", "applicationId", "actorId", "fromStatus", "toStatus", "eventSource", "note")
VALUES
  ('ci-test-event', 'ci-test-application', 'ci-candidate', NULL, 'APPLIED', 'USER_ACTION', 'Initial submission')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "MatchAnalysis"
  ("id", "applicationId", "algorithmVersion", "overallScore", "skillCoverageScore",
   "textSimilarityScore", "matchedSkills", "missingRequiredSkills", "analysisStatus")
VALUES
  ('ci-test-analysis', 'ci-test-application', 'baseline-v1', 75.00, 80.00, 70.00,
   '[{"name":"typescript","kind":"REQUIRED"}]'::jsonb, '[]'::jsonb, 'COMPLETED')
ON CONFLICT ("id") DO NOTHING;

-- The database, not just API code, prevents a second application for a job.
DO $$
BEGIN
  BEGIN
    INSERT INTO "Application"
      ("id", "candidateId", "jobId", "fullName", "email", "experienceLevel", "status")
    VALUES
      ('ci-test-duplicate-application', 'ci-candidate', 'ci-test-job', 'CI Candidate',
       'ci-candidate@example.invalid', 'Mid-level', 'APPLIED');
    RAISE EXCEPTION 'Unique candidate/job application constraint did not reject duplicate';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
END
$$;

-- Application role values are constrained at the persistence boundary.
DO $$
BEGIN
  BEGIN
    UPDATE "User" SET "role" = 'SUPERADMIN' WHERE "id" = 'ci-candidate';
    RAISE EXCEPTION 'Role constraint accepted an unsupported role';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END
$$;

-- Status history and match results cannot be rewritten or deleted.
DO $$
BEGIN
  BEGIN
    UPDATE "ApplicationEvent" SET "note" = 'tampered' WHERE "id" = 'ci-test-event';
    RAISE EXCEPTION 'ApplicationEvent append-only protection did not reject UPDATE';
  EXCEPTION WHEN SQLSTATE '55000' THEN
    NULL;
  END;

  BEGIN
    DELETE FROM "MatchAnalysis" WHERE "id" = 'ci-test-analysis';
    RAISE EXCEPTION 'MatchAnalysis append-only protection did not reject DELETE';
  EXCEPTION WHEN SQLSTATE '55000' THEN
    NULL;
  END;
END
$$;

-- Verify the rejected attempts did not mutate the protected rows.
DO $$
BEGIN
  IF (SELECT "note" FROM "ApplicationEvent" WHERE "id" = 'ci-test-event') <> 'Initial submission' THEN
    RAISE EXCEPTION 'ApplicationEvent changed despite append-only trigger';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM "MatchAnalysis" WHERE "id" = 'ci-test-analysis') THEN
    RAISE EXCEPTION 'MatchAnalysis disappeared despite append-only trigger';
  END IF;
END
$$;

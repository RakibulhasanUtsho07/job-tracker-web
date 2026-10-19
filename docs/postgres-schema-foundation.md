# PostgreSQL schema foundation — migration 001

**Status:** Added on the `feat/hireflow-postgres-foundation` branch; runtime cutover is not complete.  
**Scope:** PostgreSQL business schema, the application-managed user role extension, legacy job identifiers, and repeatable schema validation.  
**This is not a claim that current portal routes already use PostgreSQL.**

## Order of operations

1. Provision a disposable PostgreSQL database.
2. Run the selected authentication provider's supported schema migration first. HireFlow's migration intentionally does not recreate auth-owned `User`, `Session`, `Account`, or `Verification` tables.
3. Run `db/migrations/001_hireflow_core.sql`.
4. Run `db/seeds/legacy_careers_jobs.sql` for the six fictional legacy jobs.
5. Verify schema, duplicate protection, role constraints, migration reruns and append-only history with `bash scripts/verify-postgres-migrations.sh`.

The GitHub Actions workflow has a dedicated PostgreSQL service job. It creates a minimal auth-table fixture to test the business migration contract, then runs the migration and compatibility seed twice against that disposable database.

## Schema guarantees

- Existing auth identities receive an application role default of `CANDIDATE`; only `CANDIDATE`, `RECRUITER` and `ADMIN` are accepted by the database constraint.
- Email addresses are canonicalized to trimmed lowercase. If pre-existing rows collide after normalization, the migration stops instead of picking an account to discard.
- Candidate profile, job, skill, application, resume metadata, application event and match analysis tables use foreign keys and constraints.
- A database unique constraint permits only one application per candidate/job, even if the application has been withdrawn.
- Resume metadata contains an opaque storage key, not a public URL or file bytes; the actual object-storage integration is a separate step.
- Application events and matching results are append-only at the database trigger layer.
- Scores are bounded from 0 to 100; match skill evidence is JSONB arrays; a resume's declared storage metadata must describe a PDF of 1–5,000,000 bytes.
- Legacy role IDs are retained exactly. Seed conflicts are left untouched so reruns do not overwrite recruiter-edited records.

## Legacy compatibility and current limits

The current production routes still use the old local SQLite implementation. This migration does not copy SQLite rows or switch authentication, job reads, applications, or file uploads to PostgreSQL. Until the runtime cutover work is implemented and tested:

- `DATABASE_URL` does not control the existing route handlers.
- The legacy seed's `recruiterId = NULL` represents imported fictional jobs without ownership; it grants no recruiter edit permission. A trusted ownership assignment is needed before recruiter CRUD can manage those rows.
- Legacy statuses map as follows during a separately tested data migration: `submitted → APPLIED`, `in_review → SCREENING`, `shortlisted → SHORTLISTED`, `rejected → REJECTED`.
- SQLite database files and resume files must not be deleted as a shortcut. A later cutover must inventory/backup existing demo data and address storage object cleanup on database transaction failure.

## Why this is split from the route rewrite

The existing route handlers use synchronous `node:sqlite` statements, while a PostgreSQL client/ORM is asynchronous and needs a schema compatible with the selected authentication adapter. Converting persistence inside every route without first exercising the target schema creates a large, difficult-to-review risk. This branch introduces the schema and executable CI gate first; application services, authentication and file storage must be migrated as subsequent work packages.

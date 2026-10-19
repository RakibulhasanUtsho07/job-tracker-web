# WP-02 — HireFlow Database Model & Migration Plan

**Status:** Historical SQLite-era plan — superseded as the HireFlow business-record target by [`docs/postgres-schema-foundation.md`](postgres-schema-foundation.md) and [`db/migrations/001_hireflow_core.sql`](../db/migrations/001_hireflow_core.sql).  
**Current target:** PostgreSQL.  
**Active implementation branch:** `feat/hireflow-postgres-foundation`  
**Related issue:** [#10 — Define database model and safe SQLite migrations](https://github.com/RakibulhasanUtsho07/job-tracker-web/issues/10)

> This file records the earlier SQLite proposal for historical context only. Do not implement the HireFlow business schema from this plan. The running application still uses SQLite; PostgreSQL becomes the runtime source of truth only after a separately tested application/auth cutover. Preserve any existing demo database and private uploads until that work is complete.

## 1. Current repository findings

Audited from the current `main` branch:

- `src/lib/roles.ts` holds six job listings in the static `JOB_ROLES` array.
- `users` stores identity and password fields, but does not have an account-role column.
- Public registration creates normal candidate-style accounts.
- `applications.role_id` is a text value and currently does not reference a persisted jobs table.
- Current application statuses are constrained to `submitted`, `in_review`, `shortlisted`, and `rejected`.
- `getDatabase()` initializes tables using `CREATE TABLE IF NOT EXISTS`; there is no explicit schema-version migration runner yet.
- Existing application records refer to current static role IDs. Resume bytes are stored separately under the private upload directory.

**Preservation rule:** Never reset the database or remove the private-upload directory as a shortcut for schema changes. Test migrations against a copy first.

## 2. Target relationships

```text
users
 ├──< sessions
 ├──< applications >── jobs
 ├──< jobs (created_by recruiter)
 └──< status_history (actor)

applications
 └──< status_history
```

The drawing represents the target relationships. The implementation may use a staged migration for the existing `applications.role_id` column so that old data is preserved.

## 3. Proposed tables and constraints

### users — extend existing table

Add `role` with a database-enforced allowed set: `candidate` or `recruiter`. Existing users migrate to `candidate` by default.

Security rules:

- Public registration must not accept or honor a client-provided role.
- Only a trusted, explicit setup/migration path may promote a test account to recruiter.
- Authorization must be checked server-side on each recruiter operation; hiding UI controls is not authorization.

### jobs — new persistent table

| Field | Purpose / rule |
|---|---|
| `id` TEXT PRIMARY KEY | Preserve the six existing role IDs where possible so old URLs and applications still resolve. |
| `title`, `department`, `location` | Required, trimmed display/search data. |
| `work_mode` | Constrained to Remote, Hybrid, On-site. |
| `employment_type` | Constrained to Full-time, Internship, Contract. |
| `level`, `salary`, `description` | Required or explicitly optional according to form validation; do not silently invent data. |
| `highlights` | Store structured highlights consistently (JSON text with validation or a normalized child table); choose one approach before implementation. |
| `status` | Constrained to DRAFT, PUBLISHED, CLOSED. |
| `created_by` | Nullable only for migrated legacy seed rows; otherwise references the recruiter user. |
| `created_at`, `updated_at`, `closing_at` | Integer timestamps; a past closing time makes a job ineligible for new applications even if stale data says PUBLISHED. |

Add indexes for public status/closing time and recruiter-owned job queries. Public listing must include only published and not-expired jobs.

### applications — preserve existing rows

Keep the existing applicant fields, resume storage names, idempotency behavior, and unique constraint on `(user_id, role_id)`.

- Keep the duplicate-application rule: withdrawing later must not permit applying again to the same job in v1.
- Before new submissions, confirm the referenced job exists, is PUBLISHED, and has not reached its closing time.
- A status change is a recruiter-authorized server operation; candidate endpoints must not set recruiter review statuses.

**Foreign-key migration decision:** Do not assume SQLite can add the desired foreign key to the existing column in place. First persist and seed `jobs`, audit all distinct legacy `applications.role_id` values, then decide whether to rebuild the applications table in a transaction to add `REFERENCES jobs(id)`. Only rebuild if a test on a populated database copy proves all records, indexes, constraints, and resume filenames survive. If the deadline does not allow that safely, retain the legacy text column and enforce job existence in the service layer for this submission; document that limitation.

### status_history — new append-only table

| Field | Purpose / rule |
|---|---|
| `id` TEXT PRIMARY KEY | Unique event. |
| `application_id` | Required FK to applications, with history deleted only if its owning application is legitimately removed under an explicit retention policy. |
| `from_status` | Nullable for initial/baseline events. |
| `to_status` | Must be one of the supported application statuses. |
| `actor_user_id` | Nullable for a migration baseline/system event; otherwise FK to the actor. |
| `event_source` | Distinguish `migration_baseline` from `user_action`. |
| `note` | Optional, length-limited internal reason; never expose recruiter-only notes to candidates. |
| `created_at` | Integer timestamp from the server, not a trusted client value. |

Backfill one `migration_baseline` event for each existing application with its current status. Do not pretend that the migration event identifies who originally reviewed the application.

### sessions and idempotency_records

Keep their existing behavior and constraints during WP-02. Do not combine schema migration with a redesign of login/session or upload handling.

## 4. Migration approach

1. **Inventory and backup:** inspect current schema, counts, role IDs, application statuses, indexes, and foreign-key configuration. Stop if unknown role IDs are found.
2. **Test copy:** create a disposable copy of the SQLite database and a matching copy of private uploads. Run all migration experiments only against this copy first.
3. **Versioning:** introduce a migration/version mechanism (for example, `PRAGMA user_version`) and sequential, transactional migration steps. Do not rely solely on `CREATE TABLE IF NOT EXISTS` to evolve existing tables.
4. **Additive schema:** add the user role column with `candidate` default; create `jobs` and `status_history`; create the necessary indexes.
5. **Seed compatibility:** insert the six existing role records by their exact IDs using an idempotent seed operation. Existing database values take precedence over placeholder seed values.
6. **Backfill history:** record the existing current application state as a `migration_baseline` event, with no fabricated actor.
7. **Integrity check:** compare pre/post row counts and resume filenames; run `PRAGMA foreign_key_check`; verify the migration can run again without duplicate rows.
8. **Cutover:** only after the copy passes all checks, back up the local database and run the same migration on the working environment.
9. **Rollback:** keep the pre-migration backup. If any preservation/integrity assertion fails, stop and restore the backup rather than attempting ad hoc destructive repairs.

## 5. Test acceptance matrix

- [ ] A new empty database initializes all current and new tables.
- [ ] Migration on a populated copy preserves all users, sessions, applications, statuses, idempotency rows, and stored resume filenames.
- [ ] Existing role IDs all resolve to jobs after seed.
- [ ] Unknown legacy role IDs are reported and not silently dropped.
- [ ] Existing users receive `candidate`; registration cannot self-assign `recruiter`.
- [ ] Only an authenticated recruiter can create/edit/publish/close jobs.
- [ ] Draft/closed/expired jobs cannot accept new applications.
- [ ] Every actual application status transition creates exactly one history entry.
- [ ] History indicates migration baseline vs user action and does not claim a fabricated reviewer.
- [ ] Foreign keys are enabled on database connections and `PRAGMA foreign_key_check` is clean.
- [ ] Running migrations twice produces no duplicate jobs/history and no errors.
- [ ] Existing auth, upload, idempotency, duplicate guard, and download smoke checks remain green.
- [ ] `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `npm run smoke` pass.

## 6. Scope boundary

This work package covers database design and safe migration only. Do not include recruiter pages, AI matching, saved jobs, internal review notes, or dashboard styling in the same change. Those are separate work packages after the migration is verified.

## 7. Baseline dependency-audit note

At the time of the local baseline check, `npm audit` reported a high-severity advisory for `braces@3.0.3` through development-only lint dependencies, while `npm audit --omit=dev` reported zero vulnerabilities. Do not use `npm audit fix --force` to downgrade `eslint-config-next` across major versions. Re-check the advisory before submission and change versions only with a verified compatible resolution.

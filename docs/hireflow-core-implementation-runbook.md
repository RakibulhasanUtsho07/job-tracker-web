# HireFlow Core Implementation Runbook

**Status:** Documentation-only execution guide  
**Baseline:** `main` at `2ad72fcc28ebdc6bac2e2fbd5cc5126ed02f6128`  
**Scope:** Sequence and acceptance criteria for the remaining P0 implementation  
**Important:** The assessment's independence policy requires the candidate to implement, understand, explain, and modify submitted source code personally. This runbook deliberately contains no generated implementation code or SQL.

## 1. Blocker to resolve before changing persistence

There is a material mismatch between the reviewed HireFlow pack and the repository's current implementation plan:

- The assessment mapping and architecture/database documents specify PostgreSQL as the target database.
- The current portal and `docs/wp-02-database-migration-plan.md` describe the built-in Node SQLite database.
- The current application uses a custom password/session implementation, while the architecture document recommends evaluating Better Auth rather than adding another parallel authentication path.
- The repository currently stores resume files on the local filesystem. The HireFlow architecture expects a private object-storage abstraction/key and explicitly requires cleanup when database persistence fails.

Do not describe the existing SQLite slice as satisfying the PostgreSQL requirement. Before implementation, record one architecture decision: PostgreSQL is the HireFlow target; identify the selected database client/ORM and migration mechanism, and confirm the authentication adapter can safely persist application roles. Treat SQLite as the legacy demo store to be deliberately migrated or retired, not as the new source of truth.

Never delete the local database or uploaded resumes to make a migration pass. Use synthetic data and a backup/copy for preservation experiments.

## 2. Ordered P0 work

### WP-02 — Persistence foundation and data preservation

**Prerequisites:** The PostgreSQL/client/ORM and authentication-adapter decision above is recorded.

Implement personally:
- A reproducible schema migration path for users/application roles, jobs, candidate profiles, applications, resume metadata, status history, and match-analysis results.
- Foreign keys and database-level uniqueness for normalized user email and one application per candidate/job.
- The six legacy job identifiers remain resolvable: `web-developer`, `product-designer`, `backend-engineer`, `qa-engineer`, `data-analyst-intern`, `customer-success`.
- A safe approach for existing fictional SQLite demo data. Preserve records if a migration is in scope; otherwise document why only synthetic demo data is recreated and ensure the old store is not silently destroyed.
- A documented, repeatable development setup for provisioning and migrating PostgreSQL.

**Exit gate:**
- Fresh database migration completes from an empty database.
- Migration can be rerun safely or explicitly refuses to run twice with a clear version check.
- Foreign-key and uniqueness constraints reject invalid references and duplicate candidate/job applications.
- Existing data and private resume metadata are either demonstrably preserved or the accepted synthetic-data reset strategy is documented.
- No secrets or real applicant data enter Git.

### WP-03 — Server-side identity, roles, and authorization

Implement personally:
- Candidate registration cannot accept a client-supplied role.
- Recruiter demo access is established only through trusted setup/seed/admin steps, never public sign-up.
- Central authorization helpers derive user identity and role from the trusted server session.
- Every recruiter endpoint and page applies role and job-ownership checks.
- Candidate application lists and resume downloads are scoped to the signed-in candidate; recruiter resume access is limited to a job they may manage.

**Exit gate:** Automated checks prove unauthenticated requests are rejected, candidate accounts are forbidden from recruiter operations, and unauthorized cross-candidate/cross-job reads do not disclose protected data.

### WP-04 — Persistent job lifecycle

Implement personally:
- Move the six static roles into persistent job records without changing their identifiers.
- Support draft-first creation, validated editing, publishing, closing, and safe draft deletion.
- Public listings/detail pages expose only published, non-expired jobs.
- Applications are rejected for unknown, draft, closed, or expired jobs.
- A published/closed job or a job with applications cannot be physically deleted.

**Exit gate:** Create/edit/publish/close behavior persists after restart; public and recruiter views differ correctly; deadline boundaries and invalid lifecycle transitions have tests.

### WP-05 — Application review and auditable history

Implement personally:
- A recruiter review queue filtered to jobs the recruiter may manage.
- Server-validated transitions using the documented status vocabulary.
- Status update and one append-only history event occur in the same database transaction.
- Historical baseline entries are explicitly marked as migration/system records; do not invent past reviewers.
- Keep the candidate dashboard restricted to candidate-safe application fields.

**Exit gate:** Valid transitions create exactly one event; invalid transitions do not change state; the actor, previous/new status, and server timestamp are persisted; candidate/recruiter access boundaries are tested.

### WP-06 — Explainable SkillMatch baseline

Implement personally:
- Select a maintained PDF text-extraction library that is compatible with the project runtime and verify the dependency's current support/security posture.
- Match actual extracted resume text to an explicit, versioned job-skill vocabulary. A filename or `%PDF-` signature is not extracted text and is not AI matching.
- Return a reproducible metric, matched skills, missing skills, algorithm/version, and analysis state.
- If parsing or matching fails, preserve the valid application and report an unavailable/failed analysis state.
- Keep the result advisory only: do not automatically reject or shortlist based on score; do not upload resume contents to an external AI service without explicit documented consent/configuration.

**Exit gate:** Deterministic examples cover a positive match, partial match, no relevant text, and extraction failure. Limitations are disclosed and the recruiter retains the decision.

### WP-08 — Final quality and submission readiness

Run the repository's full quality sequence after the implementation is complete:
1. Install from the lockfile with a clean dependency install.
2. Run lint and TypeScript checks.
3. Run unit and integration tests.
4. Run the production build.
5. Run the production HTTP smoke suite.
6. Run browser/manual checks for signup, login, job eligibility, application submission, duplicate application, private resume download, recruiter authorization, status history, and matching success/failure.
7. Review the dependency audit and remediate advisories only through compatible, verified updates.
8. Review the diff and Git status; ensure no credentials, local databases, private resumes, or real candidate data are committed.
9. Update README with the actual stack, setup, migration, private storage, matching formula/limitations, tests actually run, and known gaps.
10. Record the commit SHAs and CI run URLs. Never claim a check passed unless the result is visible.

## 3. Suggested review-sized implementation order

Keep each change independently reviewable and commit only after its tests pass:

1. Database/auth adapter decision and environment setup.
2. PostgreSQL schema and versioned migrations.
3. Legacy job seed and data-integrity tests.
4. Server-side role/ownership helpers and negative permission tests.
5. Persistent job CRUD and publication eligibility tests.
6. Application job eligibility enforcement.
7. Recruiter queue, status transitions, and append-only history.
8. PDF text extraction and explainable SkillMatch tests.
9. README, smoke suite, security review, and final demo checklist.

Do not combine all nine steps into one large commit and do not use commit volume as a substitute for meaningful, verified changes.

## 4. Current audit baseline (19 October 2026)

- The `main` branch's latest commit is documentation-only; it does not implement the HireFlow recruiter workflow.
- The latest visible `main` GitHub Actions quality run succeeded against the existing portal source. It is not evidence that the P0 HireFlow features are implemented.
- The existing role catalogue is static; the user model has no application role; there is no persistent jobs/recruiter review workflow or status history in the baseline described by the current repository plan.
- The current PDF check validates the file signature and does not extract resume text.
- `develop` and `rakibul-hasan-utsho` are behind `main` and must be updated/reviewed before promotion. Do not merge a stale branch blindly.

## 5. Independence and evidence checklist

Before marking any work item complete, the candidate should be able to explain without reading generated text:
- Why the schema and constraints are needed.
- Where authorization is checked and why hiding buttons is insufficient.
- How transaction failures and uploaded-file cleanup are handled.
- Why the matching metric is a heuristic, not a hiring probability.
- Which test demonstrates the important failure case.
- How to modify one implementation detail and run the relevant test again.

Use this document as a task/review guide. Write and understand the submitted implementation personally in accordance with the assessment rules.

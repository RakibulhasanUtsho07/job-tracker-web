# HireFlow Work Package Roadmap

**Repository:** https://github.com/RakibulhasanUtsho07/job-tracker-web  
**Planning branch:** feat/hireflow-database  
**Assessment deadline in source email:** 19 October 2026  
**Approach:** Small, independently reviewable work packages. Do not skip baseline checks or overwrite local work.

> The assessment brief says the submitted implementation must be the candidate's own work and complete generated project code is not permitted. This roadmap is planning and review guidance; the candidate must write, understand, explain, and modify implementation code personally.

## Progress snapshot

| WP | Purpose | State |
|---|---|---|
| WP-00 | Repository audit | Done from GitHub main branch |
| WP-01 | Local dependency/install + baseline checks | Passed locally per candidate's reported output |
| WP-02 | Database design and safe SQLite migrations | Design documented; implementation not yet done |
| WP-03 | Recruiter role and server-side authorization | Planned |
| WP-04 | Persistent job CRUD and public job eligibility | Planned |
| WP-05 | Recruiter review queue, status transitions, status history | Planned |
| WP-06 | Explainable SkillMatch AI/ML feature | Planned |
| WP-07 | Optional Saved Jobs, internal notes, queue filters | Optional after core |
| WP-08 | Final testing, documentation, demo and submission | Planned |

## Non-negotiable project rules

1. Do not create a second Next.js app. Continue in the existing App Router project.
2. Do not write candidate resumes or SQLite files under public/. Keep resume files private.
3. Do not delete the local database or upload directory to "fix" migrations. Test migration against a copy first.
4. Public signup can create only candidate accounts. No request body or client-controlled parameter may grant recruiter access.
5. All authorization checks live on the server/API, not only in UI.
6. New applications require a job that exists, is published, and has not reached its closing time.
7. Preserve current job IDs: web-developer, product-designer, backend-engineer, qa-engineer, data-analyst-intern, customer-success.
8. Keep duplicate-application behavior and idempotency semantics unless an explicit design change is reviewed and tested.
9. Never represent an AI match score as a probability of hiring success. Matching supports human review only.
10. Don't mark anything complete until the related commands/tests have actually passed.

## WP-02 — Database foundation

**Work item:** [Issue #10](https://github.com/RakibulhasanUtsho07/job-tracker-web/issues/10)  
**Design:** [Database migration plan](wp-02-database-migration-plan.md)

Files likely involved (verify actual local tree first):
- src/lib/database.ts: schema initialization/migration/versioning
- src/lib/roles.ts: current static job catalogue (preserve as seed source during transition)
- tests/ and scripts/smoke-test.mjs: fresh DB and populated legacy DB checks

Done means:
- [ ] Versioned, rerunnable migration plan
- [ ] Existing users/applications/session/idempotency data preserved
- [ ] Existing resume storage filenames unchanged
- [ ] Jobs seed uses the exact existing IDs
- [ ] Role defaults are safe
- [ ] Foreign-key and integrity checks pass
- [ ] Fresh and copied populated DB migrations tested twice

## WP-03 — Role-based authorization

Create/review a trusted way to establish a recruiter test account that is not reachable through public signup. Avoid building a general public "become recruiter" feature.

Review:
- src/lib/database.ts user model/role
- src/lib/auth.ts session context
- auth registration route and all new recruiter endpoints

Done means:
- [ ] Candidate remains the default and only public registration role
- [ ] Unauthenticated write request receives 401
- [ ] Candidate recruiter-endpoint request receives 403
- [ ] Recruiter request is scoped to permitted operations
- [ ] Automated tests exercise the negative permission cases
- [ ] Demo credentials are fictional and documented through environment example; no secrets committed

## WP-04 — Job lifecycle and persistent CRUD

Start only after WP-02 and WP-03 are verified. Make database records the source of truth, then replace static catalogue reads in a deliberate migration (don't silently mix static and database state).

Suggested API surface to adapt to repository conventions:
- GET /api/roles: public jobs only; filter out expired/closed roles
- Recruiter-owned create/update routes: draft-first
- Explicit publish/close action validates required data and closing time
- Delete only empty drafts; preserve published/closed jobs and application references

Done means:
- [ ] Create/edit/list/close/delete behavior works with DB persistence
- [ ] Existing six IDs remain resolvable
- [ ] Public cannot see drafts
- [ ] Invalid or expired jobs cannot accept applications
- [ ] Missing job/invalid status/invalid fields have consistent errors
- [ ] Integration smoke test covers recruiter and candidate permissions

## WP-05 — Application review workflow

The existing application schema uses submitted, in_review, shortlisted, rejected. Keep that vocabulary for v1 unless a deliberate, tested migration changes it.

Done means:
- [ ] Recruiter-only queue lists applications for accessible jobs
- [ ] Candidate endpoint continues to show only the signed-in candidate's applications
- [ ] Valid transitions are explicitly checked on the server
- [ ] Each actual transition appends exactly one status-history row with timestamp and actor
- [ ] Migration baseline history is labeled as migration/system data, not a fabricated human action
- [ ] Optional recruiter-only notes are not visible to candidates
- [ ] Duplicate application, idempotent replay, resume privacy and owner checks remain green

## WP-06 — SkillMatch AI/ML

This feature must analyze actual extracted resume text or another clearly disclosed, relevant input. The current %PDF- signature check is not text extraction and must not be described as AI.

Minimum explainable baseline:
1. Use an actively maintained PDF text-extraction dependency or choose a transparent alternative after checking compatibility.
2. Define a small versioned vocabulary of job-relevant skills from the job description and explicit job requirements.
3. Normalize case/whitespace and conservative aliases (for example, ts to typescript only with a documented rule).
4. Report matched skills, missing skills, and a reproducible match metric.
5. State limitations: PDF layout/text extraction may fail, keyword overlap misses context, and score is not hiring probability or an automatic decision.
6. Provide fallback UNAVAILABLE for failed extraction without rejecting a valid application.

Done means:
- [ ] Uses real extracted text (not only filenames or the PDF header)
- [ ] Deterministic unit tests cover known samples, no-text PDFs, and extraction failures
- [ ] Inputs, outputs, assumptions, limitations and evaluation examples are in README/demo
- [ ] No automatic reject/shortlist based solely on the score
- [ ] Resume content is not sent to an external provider without explicit, documented configuration/consent

## WP-07 — Optional features (only after core)

Implement at most one or two if WP-02 through WP-06 are stable:
- Candidate Saved Jobs
- Recruiter-only internal review notes
- Search/filters/pagination for the recruiter review queue
- Database-backed overview counts

Do not jeopardize the submission workflow to add visual polish or optional features.

## WP-08 — Final verification and submission

Run from a clean working state after implementation:
1. npm ci
2. npm run lint
3. npm run typecheck
4. npm test
5. npm run build
6. npm run smoke
7. Manual browser QA: signup, sign-in, candidate application, duplicate guard, private resume access, recruiter role denial/approval, job publish/expiry, status history, AI happy path and failure path.
8. Check git diff --check, git status, and remove secrets/test data from commit.
9. README must explain setup, DB/storage, API/architecture, AI inputs/outputs/limitations, tests, known limitations and exactly how to run the demo.
10. Commit in small meaningful steps; verify the branch and CI before opening/revising the final PR.

## Dependency and security note

The local baseline report showed zero vulnerabilities in production dependencies (npm audit --omit=dev) and a high-severity advisory under development tooling for braces@3.0.3. Do not use npm audit fix --force if it downgrades the Next ESLint config across a major version. Recheck advisory status and compatible dependency fixes before final submission.

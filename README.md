# HireFlow — Job Tracker

HireFlow is a full-stack candidate/recruiter job-tracking application built with Next.js App Router, React, TypeScript and PostgreSQL. It keeps the original fictional role IDs for compatibility and stores resume PDFs outside the public static directory.

## Implemented product slices

- Responsive public careers landing page, role search/filtering and role-detail/application pages.
- Candidate sign-up/sign-in with salted scrypt password hashes, random opaque HTTP-only sessions, server-side CSRF checks and candidate-only public registration.
- PostgreSQL-backed role listing with published/closing-date filtering; recruiter-owned job draft, edit, publish, close and safe draft-delete lifecycle.
- Candidate application submission with server-side field checks, PDF signature/size checks, private random file names, owner-only resume downloads, idempotent replay and database-enforced one-application-per-candidate/job uniqueness.
- Recruiter queue scoped to the recruiter's jobs, private resume download, status transition rules, transactional status events, and a candidate-facing history timeline that never includes private reviewer notes.
- Versioned keyword-v1 SkillMatch: PDF text extraction via PDF.js, normalized phrase/alias matching, required/preferred skill coverage, matched/missing required skills, and persisted append-only analysis. Matching is explainable keyword overlap only; it is not a probability or an automated hiring decision. Scanned/empty PDFs or extraction/configuration failures yield UNAVAILABLE, not a rejection.
- PostgreSQL schema constraints and indexes, idempotent schema/seed operations, database-level append-only audit and match-analysis rows, and a one-time SQLite-to-PostgreSQL importer that opens the source read-only and never deletes source database/uploads.
- GitHub Actions checks for the app, application integration smoke flow, and repeatable PostgreSQL schema/constraint checks.

## Local setup (Node 22.13+; Node 24 is recommended)

1. Install Node and Docker Desktop.
2. Run npm ci.
3. Copy .env.example to .env.local. Change POSTGRES_PASSWORD and RECRUITER_PASSWORD before sharing the environment.
4. Start PostgreSQL: docker compose up -d postgres.
5. Initialize the database and trusted recruiter account:

       npm run db:migrate
       npm run db:seed
       npm run db:bootstrap-recruiter

6. Start the site with npm run dev; open http://localhost:3000. Candidates register at /sign-up. The configured trusted recruiter can visit /recruiter.

The startup scripts read .env.local (environment variables already supplied by the shell/CI take precedence). For a TLS-required managed PostgreSQL instance, set DATABASE_SSL=require. The default Docker credentials are development-only values: change them before any shared environment.

## Existing SQLite installations

Back up the SQLite database and private-upload directory first. Configure CAREERS_DB_PATH, SQLITE_UPLOAD_DIR and CAREERS_UPLOAD_DIR as needed, then run npm run db:import-sqlite against a disposable/validated PostgreSQL database after migrations and seed data have been created. The importer checks ID/email collisions, imports user credential hashes, sessions, applications, available resume files, an explicit baseline history event and idempotency records. It leaves the SQLite database and original uploaded files untouched. Review the command's row counts and missingResumeFiles warnings before switching a real deployment over.

Resumes are stored under CAREERS_UPLOAD_DIR (default ./data/private-uploads) and must not be put in public/. The configured directory must live on persistent writable storage; ephemeral serverless filesystems are unsuitable unless resume storage is replaced with durable object storage.

## Quality checks

Use an isolated disposable PostgreSQL database, never production, for the smoke suite because it creates a fictional candidate and application.

       npm ci
       npm run db:migrate
       npm run db:seed
       npm run db:bootstrap-recruiter
       npm run lint
       npm run typecheck
       npm test
       npm run build
       npm run smoke

npm run smoke covers candidate registration/sign-in, candidate denial for recruiter endpoints, role publication/closure visibility, PDF upload validation, idempotent replay, duplicate-application prevention, candidate and recruiter private resume access, recruiter status transitions, status history and logout. GitHub Actions uses fresh PostgreSQL services for both integration smoke and schema checks.

## Security and product boundaries

- Server-side authorization is authoritative. Public sign-up always creates CANDIDATE accounts; recruiter/admin access is assigned only by a trusted operator.
- Session tokens are generated randomly; only SHA-256 token digests are stored in PostgreSQL. Passwords are never stored in plaintext.
- Job/application mutations validate the session-bound CSRF token. Candidate and recruiter queries scope data by ownership.
- Resume filenames are generated server-side; only validated UUID-based .pdf keys are read back. Downloads use attachment, no-store, nosniff and restrictive CSP headers.
- PostgreSQL constraints, unique keys and transaction boundaries protect important data invariants. Application events and MatchAnalysis records are append-only.
- Login requests are capped at 16 KiB and repeated failed sign-ins are rate-limited in PostgreSQL (10 failures per client IP within a 15-minute window). Production deployments must supply trustworthy client IP headers through a configured reverse proxy; broader application/API abuse controls remain a deployment follow-up.
- Password-reset/email verification, malware scanning, production-grade object storage and a human-reviewed privacy/retention policy remain deployment follow-ups. SkillMatch must never make employment decisions by itself.

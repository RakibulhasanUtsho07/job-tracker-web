# Northstar Careers

A fictional, self-contained Careers Portal built as a production-minded web engineering project. It replaces the default Next.js starter page with an accessible job directory, secure sign-in, PDF-backed application flow, and a candidate dashboard.

All roles, candidate information, and salaries are fictional. The app uses no external auth provider, file service, or recruiting API.

## What is implemented

- Responsive landing page with searchable roles and work-style/team filters.
- Six fictional job listings with role detail and application pages.
- Public candidate registration and sign-in using an HttpOnly, SameSite=Lax cookie session.
- Server-side name/email/password validation, unique email enforcement, and salted scrypt password hashes (never plaintext passwords).
- Database-backed sessions and a session-bound CSRF token for state-changing requests.
- Accessible application form with linked inline errors, a focusable error summary, status announcements, a 20-second request timeout, an in-flight guard, retry support, and a focus-trapped session-expiry dialog.
- Server-side validation for required fields, allowed experience levels, LinkedIn URLs, and PDF resumes up to 5 MiB.
- PDF signature validation for the expected %PDF- header, random storage names, private filesystem storage outside public/, owner-only download routes, and attachment/nosniff/CSP response headers.
- SQLite constraints for one application per user per role and an idempotency record so a retry can safely replay the initial response.
- Candidate dashboard with status filters and authorized resume downloads.
- Browser security headers, reduced-motion handling, visible keyboard focus, a skip link, a branded 404 page, and a recoverable error boundary.
- Unit tests, a production HTTP smoke test, and a browser QA checklist.

## Stack

- Next.js App Router, React, TypeScript
- Node.js built-in SQLite API (node:sqlite) for a local file-backed database
- Native Node file APIs for private resume storage
- Node's built-in test runner; no test framework or external service is required

The SQLite module's stability status varies across Node releases. Use a current Node 24 release for this project. The package declares Node 22.13+ because that is where the module is available, but a newer patch release is recommended.

## Run locally

1. Install a current Node.js 24 release.
2. Install the exact dependencies from the lockfile:

       npm ci

3. Copy the example environment file to .env.local and keep local values out of Git.

   PowerShell:

       Copy-Item .env.example .env.local

   macOS/Linux:

       cp .env.example .env.local

4. Start the app:

       npm run dev

5. Open http://localhost:3000.

A new candidate can register at `/sign-up`; a successful registration creates the account in SQLite and signs the candidate in. The registered account can then submit applications and use the candidate dashboard. Email verification and password reset are not configured in this demo.

For local QA, a demo account is also configured in .env.example:

- Email: demo@careers.local
- Password: DemoPass123!

These are fictional demo credentials only. Change them before sharing any environment. In production mode the app does not silently seed the local demo account; configure DEMO_EMAIL, DEMO_PASSWORD, and optionally DEMO_NAME explicitly.

## HireFlow PostgreSQL foundation (in progress)

The separate `feat/hireflow-postgres-foundation` branch introduces the first PostgreSQL business-schema migration, a compatibility seed for the six legacy job IDs, append-only history triggers, and a CI smoke script that exercises a real PostgreSQL service.

**Important:** the existing route handlers still use local SQLite and private local-file storage. The PostgreSQL schema is not yet connected to sign-in, job listing/CRUD, application submission, or resume upload/download. Do not set `DATABASE_URL` and assume the current runtime has switched databases. That cutover must be implemented and verified separately; existing SQLite files and private uploads must not be deleted as part of this schema scaffold.

See [PostgreSQL schema foundation](docs/postgres-schema-foundation.md) for migration order and known boundaries.

## Storage and configuration

- SQLite database: `data/careers.sqlite` by default. It stores candidate profiles (name, normalized email, salted password hash and salt), sessions, applications, and retry/idempotency records.
- Private resume directory: `data/private-uploads/` by default. Uploaded resume PDF bytes are stored as private files there; the database stores the generated storage filename and original filename.
- Optional CAREERS_DB_PATH and CAREERS_UPLOAD_DIR environment variables can place those stores elsewhere. Keep both outside public/static hosting folders.
- Local database files and uploads are ignored by Git.

This app needs a Node.js process and persistent writable storage. Do not deploy it to a serverless target with an ephemeral filesystem and expect SQLite rows or resumes to survive instance replacement. For a production deployment, attach a persistent volume, back it up, set production credentials, and review operational access/retention policies first.

## Quality checks

Run these commands in order:

    npm run lint
    npm run typecheck
    npm test
    npm run build
    npm run smoke

The smoke test expects a production build to exist (run it after npm run build). It starts a local HTTP server with a fresh temporary database, checks registration, password-length and duplicate-email rejection, sign-in, CSRF, upload, idempotency, duplicate application prevention, private resume download, fake PDF rejection, file-size limit, and logout, then removes the temporary storage.

For mobile, screen-reader, keyboard-only, timeout injection, and session-recovery scenarios, follow the application quality checklist at docs/quality-checklist.md.

## Important security notes

- The server is authoritative. Client-side validation is only a convenience.
- Session tokens are random opaque values; only their SHA-256 digests are stored in SQLite.
- State-changing application and logout requests require a session-bound CSRF token. Sign-in rejects a mismatched Origin and cross-site fetch metadata.
- SQL statements are parameterized.
- The application transaction and SQLite unique constraint prevent a second application for the same account/role; user-scoped idempotency records replay the first response for retries.
- Resume files are stored with generated UUID filenames and restricted filesystem permissions. Downloads are authorized by application owner and always returned as attachments.
- The PDF check validates the extension and expected leading signature specified by the project. It is not a malware scanner or a full PDF parser; a production hiring system should add content-disarm/malware inspection and a retention/deletion policy before accepting real resumes.
- Public registration creates accounts immediately; no email verification, password reset, email delivery, external identity provider, account deletion UI, or admin status-management UI is configured.
- Before accepting real public traffic, add durable server-side rate limiting/abuse controls, verify email ownership if required, configure backups and data-retention/deletion policies, and arrange malware/content inspection for uploaded resumes.

## Branching

- main: stable/default branch
- develop: integration branch
- rakibul-hasan-utsho: active implementation branch for this feature

Changes are organized into small conventional commits and verified by GitHub Actions on push and pull request. Dependabot checks npm packages and GitHub Actions weekly and groups routine patch/minor updates into reviewable pull requests.

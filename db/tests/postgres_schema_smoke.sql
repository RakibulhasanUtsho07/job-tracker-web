#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to a disposable PostgreSQL database}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PSQL=(psql "$DATABASE_URL" --no-psqlrc --set ON_ERROR_STOP=1)

# Bootstrap only the shape expected from the selected auth adapter. Auth-owned
# tables are not created by the HireFlow business migration itself.
"${PSQL[@]}" <<'SQL'
CREATE TABLE "User" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "emailVerified" BOOLEAN NOT NULL DEFAULT FALSE,
  "image" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
SQL

# Rerunning the business migration must not duplicate types, constraints or indexes.
"${PSQL[@]}" --file db/migrations/001_hireflow_core.sql
"${PSQL[@]}" --file db/migrations/001_hireflow_core.sql

# Legacy records are imported without overwriting any edited database rows.
"${PSQL[@]}" --file db/seeds/legacy_careers_jobs.sql
"${PSQL[@]}" --file db/seeds/legacy_careers_jobs.sql

"${PSQL[@]}" --file db/tests/postgres_schema_smoke.sql

echo "PostgreSQL schema migration, idempotency, compatibility seed, constraints, and append-only checks passed."

#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to a disposable PostgreSQL database}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
PSQL=(psql "$DATABASE_URL" --no-psqlrc --set ON_ERROR_STOP=1)

# Exercise the same migration chain as local development and production.
# A fresh disposable database is used so repeated schema creation cannot hide data.
"${PSQL[@]}" --file db/migrations/000_auth_foundation.sql
"${PSQL[@]}" --file db/migrations/000_auth_foundation.sql
"${PSQL[@]}" --file db/migrations/001_hireflow_core.sql
"${PSQL[@]}" --file db/migrations/001_hireflow_core.sql
"${PSQL[@]}" --file db/migrations/002_application_idempotency.sql
"${PSQL[@]}" --file db/migrations/002_application_idempotency.sql
"${PSQL[@]}" --file db/migrations/003_idempotency_payload_binding.sql
"${PSQL[@]}" --file db/migrations/003_idempotency_payload_binding.sql
"${PSQL[@]}" --file db/migrations/004_login_rate_limit.sql
"${PSQL[@]}" --file db/migrations/004_login_rate_limit.sql
"${PSQL[@]}" --file db/seeds/legacy_careers_jobs.sql
"${PSQL[@]}" --file db/seeds/legacy_careers_jobs.sql
"${PSQL[@]}" --file db/tests/postgres_schema_smoke.sql

echo "PostgreSQL migration reruns, compatibility seeds, uniqueness, roles and append-only controls passed."

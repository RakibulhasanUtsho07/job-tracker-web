import "server-only";

import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export type PortalUser = {
  id: string;
  name: string;
  email: string;
};

export type SessionContext = {
  user: PortalUser;
  csrfToken: string;
  expiresAt: number;
};

let database: DatabaseSync | undefined;
const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

function databasePath(): string {
  return process.env.CAREERS_DB_PATH || path.join(process.cwd(), "data", "careers.sqlite");
}

function seedLocalDemoUser(db: DatabaseSync): void {
  const isProduction = process.env.NODE_ENV === "production";
  const email = (process.env.DEMO_EMAIL ?? (isProduction ? "" : "demo@careers.local")).trim().toLowerCase();
  const password = process.env.DEMO_PASSWORD ?? (isProduction ? "" : "DemoPass123!");
  const name = (process.env.DEMO_NAME ?? (isProduction ? "" : "Alex Morgan")).trim();

  // Shared or production environments must configure credentials explicitly.
  if (!email || !password || password.length < 12) return;

  const exists = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (exists) return;

  const salt = randomBytes(16).toString("hex");
  const passwordHash = scryptSync(password, salt, 64).toString("hex");
  db.prepare(
    "INSERT INTO users (id, name, email, password_salt, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(randomUUID(), name || "Demo Candidate", email, salt, passwordHash, Date.now());
}

export function getDatabase(): DatabaseSync {
  if (database) return database;

  const location = databasePath();
  mkdirSync(path.dirname(location), { recursive: true, mode: 0o700 });
  database = new DatabaseSync(location);
  database.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      csrf_token TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);

    CREATE TABLE IF NOT EXISTS applications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role_id TEXT NOT NULL,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      linkedin_url TEXT NOT NULL DEFAULT '',
      experience_level TEXT NOT NULL,
      cover_letter TEXT NOT NULL DEFAULT '',
      resume_storage_name TEXT NOT NULL,
      resume_original_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted', 'in_review', 'shortlisted', 'rejected')),
      created_at INTEGER NOT NULL,
      UNIQUE(user_id, role_id)
    );

    CREATE INDEX IF NOT EXISTS applications_user_created_idx
      ON applications(user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS idempotency_records (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      idempotency_key TEXT NOT NULL,
      response_status INTEGER NOT NULL,
      response_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY(user_id, idempotency_key)
    );
  `);

  seedLocalDemoUser(database);
  return database;
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function authenticateCredentials(emailInput: string, password: string): PortalUser | null {
  const email = emailInput.trim().toLowerCase();
  const db = getDatabase();
  const row = db.prepare(
    "SELECT id, name, email, password_salt, password_hash FROM users WHERE email = ?",
  ).get(email);

  if (!row) return null;
  const salt = String(row.password_salt);
  const saved = Buffer.from(String(row.password_hash), "hex");
  const candidate = scryptSync(password, salt, 64);
  if (saved.length !== candidate.length || !timingSafeEqual(saved, candidate)) return null;

  return { id: String(row.id), name: String(row.name), email: String(row.email) };
}

export function createSession(userId: string): { token: string; csrfToken: string; expiresAt: number } {
  const token = randomBytes(32).toString("base64url");
  const csrfToken = randomBytes(24).toString("base64url");
  const now = Date.now();
  const expiresAt = now + SESSION_LIFETIME_MS;

  getDatabase().prepare(
    "INSERT INTO sessions (token_hash, user_id, csrf_token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(hashSessionToken(token), userId, csrfToken, expiresAt, now);

  return { token, csrfToken, expiresAt };
}

export function readSession(token: string | undefined): SessionContext | null {
  if (!token) return null;
  const db = getDatabase();
  const row = db.prepare(`
    SELECT s.csrf_token, s.expires_at, u.id, u.name, u.email
    FROM sessions s
    INNER JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?
  `).get(hashSessionToken(token));

  if (!row) return null;
  const expiresAt = Number(row.expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashSessionToken(token));
    return null;
  }

  return {
    user: { id: String(row.id), name: String(row.name), email: String(row.email) },
    csrfToken: String(row.csrf_token),
    expiresAt,
  };
}

export function deleteSession(token: string | undefined): void {
  if (!token) return;
  getDatabase().prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashSessionToken(token));
}

import "server-only";
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { getPostgres } from "@/lib/postgres";

export type PortalRole = "CANDIDATE" | "RECRUITER" | "ADMIN";
export type PortalUser = { id: string; name: string; email: string; role: PortalRole };
export type SessionContext = { user: PortalUser; csrfToken: string; expiresAt: number };
const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

function userFromRow(row: Record<string, unknown>): PortalUser {
  const role = String(row.role);
  return { id: String(row.id), name: String(row.name), email: String(row.email),
    role: role === "RECRUITER" || role === "ADMIN" ? role : "CANDIDATE" };
}
function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error
    && (error as { code?: unknown }).code === "23505";
}
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
export async function authenticateCredentials(emailInput: string, password: string): Promise<PortalUser | null> {
  const email = emailInput.trim().toLowerCase();
  const sql = getPostgres();
  const rows = await sql.unsafe('SELECT "id","name","email","passwordSalt","passwordHash","role" FROM "User" WHERE lower(btrim("email"))=$1 LIMIT 1',[email]);
  const row = rows[0];
  if (!row) return null;
  const saved = Buffer.from(String(row.passwordHash),"hex");
  const candidate = scryptSync(password,String(row.passwordSalt),64);
  if (saved.length !== candidate.length || !timingSafeEqual(saved,candidate)) return null;
  return userFromRow(row);
}
export async function registerUser(nameInput: string, emailInput: string, password: string): Promise<PortalUser | null> {
  const name = nameInput.trim().replace(/\s+/g," ");
  const email = emailInput.trim().toLowerCase();
  const salt = randomBytes(16).toString("hex");
  const passwordHash = scryptSync(password,salt,64).toString("hex");
  try {
    const rows = await getPostgres().unsafe(
      'INSERT INTO "User" ("id","name","email","passwordSalt","passwordHash","role") VALUES ($1,$2,$3,$4,$5,$6) RETURNING "id","name","email","role"',
      [randomUUID(),name,email,salt,passwordHash,"CANDIDATE"]);
    return rows[0] ? userFromRow(rows[0]) : null;
  } catch (error) {
    if (isUniqueViolation(error)) return null;
    throw error;
  }
}
export async function createSession(userId: string): Promise<{token:string;csrfToken:string;expiresAt:number}> {
  const token = randomBytes(32).toString("base64url");
  const csrfToken = randomBytes(24).toString("base64url");
  const now = Date.now();
  const expiresAt = now + SESSION_LIFETIME_MS;
  await getPostgres().unsafe(
    'INSERT INTO "Session" ("tokenHash","userId","csrfToken","expiresAt","createdAt") VALUES ($1,$2,$3,$4,$5)',
    [hashSessionToken(token),userId,csrfToken,new Date(expiresAt),new Date(now)]);
  return {token,csrfToken,expiresAt};
}
export async function readSession(token: string | undefined): Promise<SessionContext | null> {
  if (!token) return null;
  const tokenHash = hashSessionToken(token);
  const rows = await getPostgres().unsafe(
    'SELECT s."csrfToken",s."expiresAt",u."id",u."name",u."email",u."role" FROM "Session" s INNER JOIN "User" u ON u."id"=s."userId" WHERE s."tokenHash"=$1 LIMIT 1',
    [tokenHash]);
  const row = rows[0];
  if (!row) return null;
  const expiresAt = row.expiresAt instanceof Date ? row.expiresAt.getTime() : new Date(String(row.expiresAt)).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    await getPostgres().unsafe('DELETE FROM "Session" WHERE "tokenHash"=$1',[tokenHash]);
    return null;
  }
  return {user:userFromRow(row),csrfToken:String(row.csrfToken),expiresAt};
}
export async function deleteSession(token: string | undefined): Promise<void> {
  if (!token) return;
  await getPostgres().unsafe('DELETE FROM "Session" WHERE "tokenHash"=$1',[hashSessionToken(token)]);
}

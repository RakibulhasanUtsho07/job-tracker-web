import "server-only";

import { cookies } from "next/headers";
import { createSession, deleteSession, readSession, type PortalUser, type SessionContext } from "@/lib/pg-auth";

export const SESSION_COOKIE = "careers_session";
export const SESSION_COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export async function getCurrentSession(): Promise<SessionContext | null> {
  const cookieStore = await cookies();
  return readSession(cookieStore.get(SESSION_COOKIE)?.value);
}

export async function getCookieToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE)?.value;
}

export function startSession(user: PortalUser) {
  return createSession(user.id);
}

export async function endCurrentSession(): Promise<void> {
  await deleteSession(await getCookieToken());
}

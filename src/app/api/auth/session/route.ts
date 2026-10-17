import { cookies } from "next/headers";
import { jsonResponse } from "@/lib/http";
import { readSession, type SessionContext } from "@/lib/database";
import { SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();
  const session: SessionContext | null = readSession(cookieStore.get(SESSION_COOKIE)?.value);

  if (!session) return jsonResponse({ user: null, csrfToken: null });
  return jsonResponse({ user: session.user, csrfToken: session.csrfToken });
}

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { deleteSession, readSession } from "@/lib/database";
import { errorResponse, hasValidCsrfToken } from "@/lib/http";
import { SESSION_COOKIE } from "@/lib/auth";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = readSession(token);

  if (!session) {
    const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set({ name: SESSION_COOKIE, value: "", httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
    return response;
  }
  if (!hasValidCsrfToken(request, session.csrfToken)) {
    return errorResponse(403, "CSRF_REJECTED", "Refresh the page and try signing out again.");
  }

  deleteSession(token);
  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set({ name: SESSION_COOKIE, value: "", httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}

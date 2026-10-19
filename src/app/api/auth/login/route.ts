import { NextResponse } from "next/server";
import { authenticateCredentials, createSession } from "@/lib/pg-auth";
import { errorResponse, isAllowedOrigin } from "@/lib/http";
import { SESSION_COOKIE, SESSION_COOKIE_MAX_AGE_SECONDS } from "@/lib/auth";

export async function POST(request: Request) {
  if (!isAllowedOrigin(request)) {
    return errorResponse(403, "ORIGIN_REJECTED", "This sign-in request was not allowed.");
  }
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return errorResponse(415, "UNSUPPORTED_MEDIA_TYPE", "Send sign-in details as JSON.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "INVALID_JSON", "Please check the sign-in details and try again.");
  }

  if (!body || typeof body !== "object") {
    return errorResponse(400, "INVALID_INPUT", "Please enter your email and password.");
  }

  const input = body as Record<string, unknown>;
  const email = typeof input.email === "string" ? input.email : "";
  const password = typeof input.password === "string" ? input.password : "";

  if (email.length > 254 || password.length > 256 || !email || !password) {
    return errorResponse(422, "INVALID_CREDENTIALS", "Enter a valid email address and password.");
  }

  const user = await authenticateCredentials(email, password);
  if (!user) {
    return errorResponse(401, "SIGN_IN_FAILED", "Those email and password details did not match.");
  }

  const session = await createSession(user.id);
  const response = NextResponse.json(
    { user, csrfToken: session.csrfToken },
    { headers: { "Cache-Control": "no-store" } },
  );
  response.cookies.set({
    name: SESSION_COOKIE,
    value: session.token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
  });
  return response;
}

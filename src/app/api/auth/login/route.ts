import { NextResponse } from "next/server";
import { authenticateCredentials, createSession } from "@/lib/pg-auth";
import { errorResponse, isAllowedOrigin, readRequestBodyWithLimit } from "@/lib/http";
import { getLoginBlockSeconds, recordFailedLogin } from "@/lib/auth-rate-limit";
import { SESSION_COOKIE, SESSION_COOKIE_MAX_AGE_SECONDS } from "@/lib/auth";

const MAX_LOGIN_BODY_BYTES = 16 * 1024;

function rateLimitedResponse(retryAfterSeconds: number) {
  const response = errorResponse(429, "LOGIN_RATE_LIMITED", "Too many failed sign-in attempts. Please wait before trying again.");
  response.headers.set("Retry-After", String(retryAfterSeconds));
  return response;
}

export async function POST(request: Request) {
  if (!isAllowedOrigin(request)) {
    return errorResponse(403, "ORIGIN_REJECTED", "This sign-in request was not allowed.");
  }
  const blockedSeconds = await getLoginBlockSeconds(request);
  if (blockedSeconds > 0) return rateLimitedResponse(blockedSeconds);

  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return errorResponse(415, "UNSUPPORTED_MEDIA_TYPE", "Send sign-in details as JSON.");
  }

  const contentLengthHeader = request.headers.get("content-length");
  const contentLength = contentLengthHeader ? Number(contentLengthHeader) : 0;
  if (Number.isFinite(contentLength) && contentLength > MAX_LOGIN_BODY_BYTES) {
    return errorResponse(413, "REQUEST_TOO_LARGE", "The sign-in details are too large.");
  }
  let requestBytes: Uint8Array | null;
  try {
    requestBytes = await readRequestBodyWithLimit(request, MAX_LOGIN_BODY_BYTES);
  } catch {
    return errorResponse(400, "INVALID_REQUEST", "We could not read those details. Please try again.");
  }
  if (requestBytes === null) return errorResponse(413, "REQUEST_TOO_LARGE", "The sign-in details are too large.");

  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(requestBytes));
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
    const retryAfterSeconds = await recordFailedLogin(request);
    if (retryAfterSeconds > 0) return rateLimitedResponse(retryAfterSeconds);
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

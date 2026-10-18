import { NextResponse } from "next/server";
import { createSession, registerUser } from "@/lib/database";
import { errorResponse, isAllowedOrigin, readRequestBodyWithLimit } from "@/lib/http";
import { SESSION_COOKIE, SESSION_COOKIE_MAX_AGE_SECONDS } from "@/lib/auth";

const MAX_REGISTRATION_BODY_BYTES = 16 * 1024;

export async function POST(request: Request) {
  if (!isAllowedOrigin(request)) {
    return errorResponse(403, "ORIGIN_REJECTED", "This registration request was not allowed.");
  }
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return errorResponse(415, "UNSUPPORTED_MEDIA_TYPE", "Send your account details as JSON.");
  }

  const contentLengthHeader = request.headers.get("content-length");
  const contentLength = contentLengthHeader ? Number(contentLengthHeader) : 0;
  if (Number.isFinite(contentLength) && contentLength > MAX_REGISTRATION_BODY_BYTES) {
    return errorResponse(413, "REQUEST_TOO_LARGE", "The registration details are too large.");
  }

  let bytes: Uint8Array | null;
  try {
    bytes = await readRequestBodyWithLimit(request, MAX_REGISTRATION_BODY_BYTES);
  } catch {
    return errorResponse(400, "INVALID_REQUEST", "We could not read those details. Please try again.");
  }
  if (bytes === null) {
    return errorResponse(413, "REQUEST_TOO_LARGE", "The registration details are too large.");
  }

  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return errorResponse(400, "INVALID_JSON", "Please check your account details and try again.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return errorResponse(400, "INVALID_INPUT", "Enter your name, email address, and password.");
  }

  const input = body as Record<string, unknown>;
  const name = typeof input.name === "string" ? input.name.trim().replace(/\\s+/g, " ") : "";
  const email = typeof input.email === "string" ? input.email.trim() : "";
  const password = typeof input.password === "string" ? input.password : "";

  if (name.length < 2 || name.length > 80 || /[\\u0000-\\u001F\\u007F]/.test(name)) {
    return errorResponse(422, "INVALID_NAME", "Enter a name between 2 and 80 characters.");
  }
  if (email.length > 254 || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {
    return errorResponse(422, "INVALID_EMAIL", "Enter a valid email address.");
  }
  if (password.length < 12 || password.length > 128) {
    return errorResponse(422, "INVALID_PASSWORD", "Use a password between 12 and 128 characters.");
  }

  let user;
  try {
    user = registerUser(name, email, password);
  } catch (error) {
    console.error("Account registration failed.", error);
    return errorResponse(500, "REGISTRATION_FAILED", "We could not create your account. Please try again.");
  }
  if (!user) {
    return errorResponse(409, "EMAIL_IN_USE", "An account with this email already exists. Sign in instead.");
  }

  const session = createSession(user.id);
  const response = NextResponse.json(
    { user, csrfToken: session.csrfToken },
    { status: 201, headers: { "Cache-Control": "no-store" } },
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

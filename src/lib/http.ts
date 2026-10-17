import { timingSafeEqual } from "node:crypto";

export function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Content-Type", "application/json; charset=utf-8");
  responseHeaders.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(body), { status, headers: responseHeaders });
}

export function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");

  if (origin && origin !== new URL(request.url).origin) return false;
  if (fetchSite === "cross-site") return false;
  return true;
}

export function hasValidCsrfToken(request: Request, expectedToken: string): boolean {
  if (!isAllowedOrigin(request)) return false;

  const receivedToken = request.headers.get("x-csrf-token") ?? "";
  const expected = Buffer.from(expectedToken);
  const received = Buffer.from(receivedToken);
  if (expected.length === 0 || expected.length !== received.length) return false;

  return timingSafeEqual(expected, received);
}

export function errorResponse(status: number, code: string, message: string, extra: Record<string, unknown> = {}): Response {
  return jsonResponse({ code, message, ...extra }, status);
}


export async function readRequestBodyWithLimit(request: Request, maxBytes: number): Promise<Uint8Array | null> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new RangeError("maxBytes must be a non-negative safe integer.");
  }
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      totalBytes += part.value.byteLength;

      if (totalBytes > maxBytes) {
        await reader.cancel("Request body exceeds the configured limit.");
        return null;
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

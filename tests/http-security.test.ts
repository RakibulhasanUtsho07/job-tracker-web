import test from "node:test";
import assert from "node:assert/strict";
import { hasValidCsrfToken, isAllowedOrigin, readRequestBodyWithLimit } from "../src/lib/http.ts";

test("accepts a same-origin request and rejects a foreign origin", () => {
  const sameOrigin = new Request("https://careers.example/api/applications", {
    headers: { origin: "https://careers.example" },
  });
  const foreignOrigin = new Request("https://careers.example/api/applications", {
    headers: { origin: "https://attacker.example" },
  });

  assert.equal(isAllowedOrigin(sameOrigin), true);
  assert.equal(isAllowedOrigin(foreignOrigin), false);
});

test("rejects browser requests marked cross-site", () => {
  const request = new Request("https://careers.example/api/applications", {
    headers: {
      origin: "https://careers.example",
      "sec-fetch-site": "cross-site",
    },
  });

  assert.equal(isAllowedOrigin(request), false);
});

test("requires the expected CSRF token and rejects missing or mismatched values", () => {
  const valid = new Request("https://careers.example/api/applications", {
    headers: { origin: "https://careers.example", "x-csrf-token": "known-csrf-token" },
  });
  const missing = new Request("https://careers.example/api/applications", {
    headers: { origin: "https://careers.example" },
  });
  const invalid = new Request("https://careers.example/api/applications", {
    headers: { origin: "https://careers.example", "x-csrf-token": "other-token" },
  });

  assert.equal(hasValidCsrfToken(valid, "known-csrf-token"), true);
  assert.equal(hasValidCsrfToken(missing, "known-csrf-token"), false);
  assert.equal(hasValidCsrfToken(invalid, "known-csrf-token"), false);
});


test("reads a request body under the byte limit", async () => {
  const request = new Request("https://careers.example/api/applications", {
    method: "POST",
    body: new Blob(["small fictional payload"]),
  });
  const body = await readRequestBodyWithLimit(request, 64);

  assert.ok(body instanceof Uint8Array);
  assert.equal(new TextDecoder().decode(body), "small fictional payload");
});

test("stops reading an over-limit request body", async () => {
  const request = new Request("https://careers.example/api/applications", {
    method: "POST",
    body: new Blob([new Uint8Array(129)]),
  });
  const body = await readRequestBodyWithLimit(request, 128);

  assert.equal(body, null);
});

test("rejects an invalid configured request body limit", async () => {
  const request = new Request("https://careers.example/api/applications");
  await assert.rejects(readRequestBodyWithLimit(request, -1), RangeError);
});

import test from "node:test";
import assert from "node:assert/strict";
import { hasValidCsrfToken, isAllowedOrigin } from "../src/lib/http.ts";

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

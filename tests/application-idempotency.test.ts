import test from "node:test";
import assert from "node:assert/strict";
import { fingerprintApplicationSubmission } from "../src/lib/application-idempotency.ts";

const base = {
  roleId: "web-developer",
  fields: { fullName: "Alex Morgan", email: "alex@example.com", linkedinUrl: "", experienceLevel: "junior", coverLetter: "Hello" },
  originalFileName: "resume.pdf",
  resumeSha256: "a".repeat(64),
};

test("same normalized submission payload has a stable fingerprint", () => {
  assert.equal(fingerprintApplicationSubmission(base), fingerprintApplicationSubmission(structuredClone(base)));
});

test("changing persisted application details changes the fingerprint", () => {
  assert.notEqual(fingerprintApplicationSubmission(base), fingerprintApplicationSubmission({
    ...base, fields: { ...base.fields, coverLetter: "Different note" },
  }));
});

test("changing resume bytes or the target role changes the fingerprint", () => {
  assert.notEqual(fingerprintApplicationSubmission(base), fingerprintApplicationSubmission({
    ...base, resumeSha256: "b".repeat(64),
  }));
  assert.notEqual(fingerprintApplicationSubmission(base), fingerprintApplicationSubmission({
    ...base, roleId: "product-designer",
  }));
});

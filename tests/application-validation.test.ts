import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_RESUME_BYTES,
  normalizeApplicationFields,
  sanitizeOriginalFilename,
  validateApplicationFields,
  validatePdfResume,
} from "../src/lib/application-validation.ts";

test("normalizes fields without trusting raw input", () => {
  const fields = normalizeApplicationFields({
    fullName: "  Alex Morgan  ",
    email: " ALEX@example.com ",
    linkedinUrl: "",
    experienceLevel: "junior",
    coverLetter: " Hello ",
  });

  assert.equal(fields.fullName, "Alex Morgan");
  assert.equal(fields.email, "alex@example.com");
  assert.equal(fields.coverLetter, "Hello");
});

test("requires a valid name, email, and experience level", () => {
  const errors = validateApplicationFields({
    fullName: "A",
    email: "not-an-email",
    linkedinUrl: "",
    experienceLevel: "",
    coverLetter: "",
  });

  assert.ok(errors.fullName);
  assert.ok(errors.email);
  assert.ok(errors.experienceLevel);
});

test("rejects non-HTTPS or non-LinkedIn profile URLs", () => {
  const errors = validateApplicationFields({
    fullName: "Alex Morgan",
    email: "alex@example.com",
    linkedinUrl: "https://example.com/profile",
    experienceLevel: "junior",
    coverLetter: "",
  });

  assert.ok(errors.linkedinUrl);
});

test("accepts a small PDF signature and rejects HTML renamed to PDF", () => {
  const pdf = validatePdfResume({
    filename: "resume.pdf",
    size: 128,
    header: new TextEncoder().encode("%PDF-1.7"),
  });
  const fake = validatePdfResume({
    filename: "cv.pdf",
    size: 128,
    header: new TextEncoder().encode("<html>"),
  });

  assert.deepEqual(pdf, { ok: true });
  assert.deepEqual(fake, { ok: false, code: "INVALID_FILE" });
});

test("enforces the 5 MiB limit and rejects empty files", () => {
  assert.deepEqual(
    validatePdfResume({ filename: "resume.pdf", size: MAX_RESUME_BYTES + 1, header: new TextEncoder().encode("%PDF-") }),
    { ok: false, code: "FILE_TOO_LARGE" },
  );
  assert.deepEqual(
    validatePdfResume({ filename: "resume.pdf", size: 0, header: new TextEncoder().encode("%PDF-") }),
    { ok: false, code: "EMPTY_FILE" },
  );
});

test("removes paths and unsafe control characters from the displayed file name", () => {
  assert.equal(sanitizeOriginalFilename("../../my-resume<bad>.pdf"), "my-resume-bad-.pdf");
  assert.equal(sanitizeOriginalFilename("C:\\private\\resume.pdf"), "resume.pdf");
});

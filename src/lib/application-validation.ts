export const MAX_RESUME_BYTES = 5 * 1024 * 1024;

export type ApplicationFields = {
  fullName: string;
  email: string;
  linkedinUrl: string;
  experienceLevel: string;
  coverLetter: string;
};

export type ApplicationFieldErrors = Partial<Record<keyof ApplicationFields | "resume", string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const EXPERIENCE_LEVELS = new Set(["student", "junior", "mid", "senior"]);

export function normalizeApplicationFields(input: Record<string, unknown>): ApplicationFields {
  return {
    fullName: String(input.fullName ?? "").trim(),
    email: String(input.email ?? "").trim().toLowerCase(),
    linkedinUrl: String(input.linkedinUrl ?? "").trim(),
    experienceLevel: String(input.experienceLevel ?? "").trim(),
    coverLetter: String(input.coverLetter ?? "").trim(),
  };
}

export function validateApplicationFields(fields: ApplicationFields): ApplicationFieldErrors {
  const errors: ApplicationFieldErrors = {};

  if (fields.fullName.length < 2 || fields.fullName.length > 100) {
    errors.fullName = "Enter your full name (2–100 characters).";
  }
  if (!EMAIL_PATTERN.test(fields.email) || fields.email.length > 254) {
    errors.email = "Enter a valid email address.";
  }
  if (fields.linkedinUrl.length > 300) {
    errors.linkedinUrl = "Keep your LinkedIn profile URL under 300 characters.";
  } else if (fields.linkedinUrl.length > 0) {
    try {
      const url = new URL(fields.linkedinUrl);
      if (url.protocol !== "https:" || url.hostname !== "www.linkedin.com" && url.hostname !== "linkedin.com") {
        errors.linkedinUrl = "Use a valid https://linkedin.com profile URL.";
      }
    } catch {
      errors.linkedinUrl = "Use a valid https://linkedin.com profile URL.";
    }
  }
  if (!EXPERIENCE_LEVELS.has(fields.experienceLevel)) {
    errors.experienceLevel = "Choose your experience level.";
  }
  if (fields.coverLetter.length > 2000) {
    errors.coverLetter = "Keep your note under 2,000 characters.";
  }

  return errors;
}

export type PdfCheck = {
  filename: string;
  size: number;
  header: Uint8Array;
};

export function validatePdfResume(file: PdfCheck): { ok: true } | { ok: false; code: "FILE_TOO_LARGE" | "INVALID_FILE" | "EMPTY_FILE" } {
  if (file.size <= 0) return { ok: false, code: "EMPTY_FILE" };
  if (file.size > MAX_RESUME_BYTES) return { ok: false, code: "FILE_TOO_LARGE" };
  if (!/\.pdf$/i.test(file.filename) || file.header.length < 5) {
    return { ok: false, code: "INVALID_FILE" };
  }

  const signature = String.fromCharCode(...file.header.slice(0, 5));
  if (signature !== "%PDF-") return { ok: false, code: "INVALID_FILE" };

  return { ok: true };
}

export function sanitizeOriginalFilename(filename: string): string {
  const leaf = filename.replace(/\\/g, "/").split("/").pop() ?? "resume.pdf";
  const cleaned = leaf
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>:"|?*]/g, "-")
    .trim()
    .slice(0, 160);
  return cleaned || "resume.pdf";
}

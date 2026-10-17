import { randomUUID } from "node:crypto";
import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { cookies } from "next/headers";
import { getCurrentSession } from "@/lib/auth";
import { getDatabase } from "@/lib/database";
import { errorResponse, hasValidCsrfToken, jsonResponse, readRequestBodyWithLimit } from "@/lib/http";
import {
  MAX_RESUME_BYTES,
  normalizeApplicationFields,
  sanitizeOriginalFilename,
  validateApplicationFields,
  validatePdfResume,
} from "@/lib/application-validation";
import { getRoleById } from "@/lib/roles";

const MAX_MULTIPART_BODY_BYTES = MAX_RESUME_BYTES + 128 * 1024;

function privateUploadDirectory(): string {
  return process.env.CAREERS_UPLOAD_DIR || path.join(process.cwd(), "data", "private-uploads");
}

function replayResponse(row: Record<string, unknown>): Response {
  return jsonResponse(JSON.parse(String(row.response_json)), Number(row.response_status));
}

function saveIdempotentResponse(
  db: ReturnType<typeof getDatabase>,
  userId: string,
  key: string,
  status: number,
  body: Record<string, unknown>,
): void {
  db.prepare(
    "INSERT INTO idempotency_records (user_id, idempotency_key, response_status, response_json, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(userId, key, status, JSON.stringify(body), Date.now());
}

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return errorResponse(401, "SESSION_EXPIRED", "Please sign in to view your applications.");

  const rows = getDatabase().prepare(`
    SELECT id, role_id, full_name, email, linkedin_url, experience_level, cover_letter,
           resume_original_name, status, created_at
    FROM applications
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 100
  `).all(session.user.id);

  return jsonResponse({
    applications: rows.map((row) => {
      const role = getRoleById(String(row.role_id));
      return {
        id: String(row.id),
        roleId: String(row.role_id),
        roleTitle: role?.title ?? "Role no longer listed",
        department: role?.department ?? "Careers",
        fullName: String(row.full_name),
        email: String(row.email),
        linkedinUrl: String(row.linkedin_url),
        experienceLevel: String(row.experience_level),
        coverLetter: String(row.cover_letter),
        resumeName: String(row.resume_original_name),
        resumeAvailable: true,
        status: String(row.status),
        submittedAt: Number(row.created_at),
      };
    }),
  });
}

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return errorResponse(401, "SESSION_EXPIRED", "Your session expired. Sign in again to continue.");
  if (!hasValidCsrfToken(request, session.csrfToken)) {
    return errorResponse(403, "CSRF_REJECTED", "Refresh the form and try again.");
  }

  const key = request.headers.get("idempotency-key")?.trim() ?? "";
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(key)) {
    return errorResponse(400, "IDEMPOTENCY_KEY_REQUIRED", "Refresh the form to create a safe submission key.");
  }

  const db = getDatabase();
  const prior = db.prepare(
    "SELECT response_status, response_json FROM idempotency_records WHERE user_id = ? AND idempotency_key = ?",
  ).get(session.user.id, key);
  if (prior) return replayResponse(prior);

  const contentLengthHeader = request.headers.get("content-length");
  const contentLength = contentLengthHeader ? Number(contentLengthHeader) : 0;
  if (Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_BODY_BYTES) {
    return errorResponse(413, "FILE_TOO_LARGE", "The upload is too large. Choose a PDF up to 5 MB.");
  }
  if (!request.headers.get("content-type")?.toLowerCase().includes("multipart/form-data")) {
    return errorResponse(415, "UNSUPPORTED_MEDIA_TYPE", "Submit the application using the provided form.");
  }

  let boundedBody: Uint8Array | null;
  try {
    boundedBody = await readRequestBodyWithLimit(request, MAX_MULTIPART_BODY_BYTES);
  } catch {
    return errorResponse(400, "INVALID_MULTIPART", "We could not read this form. Please try again.");
  }
  if (boundedBody === null) {
    return errorResponse(413, "FILE_TOO_LARGE", "The upload is too large. Choose a PDF up to 5 MB.");
  }

  const parsedHeaders = new Headers(request.headers);
  parsedHeaders.delete("content-length");
  const boundedRequest = new Request(request.url, {
    method: "POST",
    headers: parsedHeaders,
    body: Buffer.from(boundedBody),
  });

  let formData: FormData;
  try {
    formData = await boundedRequest.formData();
  } catch {
    return errorResponse(400, "INVALID_MULTIPART", "We could not read this form. Please try again.");
  }

  const roleId = String(formData.get("roleId") ?? "").trim();
  const role = getRoleById(roleId);
  if (!role) return errorResponse(404, "ROLE_NOT_FOUND", "This role is no longer available.");

  const fields = normalizeApplicationFields({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    linkedinUrl: formData.get("linkedinUrl"),
    experienceLevel: formData.get("experienceLevel"),
    coverLetter: formData.get("coverLetter"),
  });
  const fieldErrors = validateApplicationFields(fields);
  const resumeValues = formData.getAll("resume");

  if (resumeValues.length !== 1 || typeof resumeValues[0] === "string") {
    fieldErrors.resume = "Choose one PDF resume to continue.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return errorResponse(422, "VALIDATION_ERROR", "Check the highlighted fields and try again.", { fieldErrors });
  }

  const resume = resumeValues[0] as File;
  const bytes = Buffer.from(await resume.arrayBuffer());
  if (bytes.byteLength > MAX_RESUME_BYTES) {
    return errorResponse(413, "FILE_TOO_LARGE", "The upload is too large. Choose a PDF up to 5 MB.");
  }
  const pdfCheck = validatePdfResume({
    filename: resume.name,
    size: bytes.byteLength,
    header: bytes.subarray(0, 8),
  });
  if (!pdfCheck.ok && pdfCheck.code === "EMPTY_FILE") {
    return errorResponse(422, "VALIDATION_ERROR", "Choose a non-empty PDF resume.", {
      fieldErrors: { resume: "Choose a non-empty PDF resume." },
    });
  }
  if (!pdfCheck.ok) {
    return errorResponse(415, "INVALID_PDF", "That file is not a valid PDF. Choose a real PDF resume.");
  }

  const originalName = sanitizeOriginalFilename(resume.name);
  const applicationId = randomUUID();
  const storedName = `${randomUUID()}.pdf`;
  const uploadDirectory = privateUploadDirectory();
  const storedPath = path.join(uploadDirectory, storedName);
  let fileWasWritten = false;
  let transactionStarted = false;

  try {
    mkdirSync(uploadDirectory, { recursive: true, mode: 0o700 });
    db.exec("BEGIN IMMEDIATE");
    transactionStarted = true;

    // Repeat the lookup inside the write transaction to make concurrent retries safe.
    const saved = db.prepare(
      "SELECT response_status, response_json FROM idempotency_records WHERE user_id = ? AND idempotency_key = ?",
    ).get(session.user.id, key);
    if (saved) {
      db.exec("ROLLBACK");
      transactionStarted = false;
      return replayResponse(saved);
    }

    const existing = db.prepare(
      "SELECT id FROM applications WHERE user_id = ? AND role_id = ?",
    ).get(session.user.id, roleId);

    if (existing) {
      const body = {
        code: "ALREADY_APPLIED",
        message: "You already applied for this role.",
        applicationId: String(existing.id),
        existingApplicationUrl: "/dashboard",
      };
      saveIdempotentResponse(db, session.user.id, key, 409, body);
      db.exec("COMMIT");
      transactionStarted = false;
      return jsonResponse(body, 409);
    }

    db.prepare(`
      INSERT INTO applications
        (id, user_id, role_id, full_name, email, linkedin_url, experience_level,
         cover_letter, resume_storage_name, resume_original_name, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?)
    `).run(
      applicationId,
      session.user.id,
      roleId,
      fields.fullName,
      fields.email,
      fields.linkedinUrl,
      fields.experienceLevel,
      fields.coverLetter,
      storedName,
      originalName,
      Date.now(),
    );

    // The file is private and is never written under public/ or served as inline content.
    writeFileSync(storedPath, bytes, { flag: "wx", mode: 0o600 });
    fileWasWritten = true;

    const body = {
      id: applicationId,
      roleId,
      roleTitle: role.title,
      status: "submitted",
      submittedAt: Date.now(),
    };
    saveIdempotentResponse(db, session.user.id, key, 201, body);
    db.exec("COMMIT");
    transactionStarted = false;
    return jsonResponse(body, 201);
  } catch (error) {
    if (transactionStarted) {
      try { db.exec("ROLLBACK"); } catch { /* Transaction may already have rolled back. */ }
    }
    if (fileWasWritten) {
      try { unlinkSync(storedPath); } catch { /* Keep the original database error. */ }
    }

    const message = error instanceof Error ? error.message : "";
    if (message.includes("UNIQUE constraint failed: applications.user_id, applications.role_id")) {
      const existing = db.prepare("SELECT id FROM applications WHERE user_id = ? AND role_id = ?").get(session.user.id, roleId);
      const body = {
        code: "ALREADY_APPLIED",
        message: "You already applied for this role.",
        applicationId: String(existing?.id ?? ""),
        existingApplicationUrl: "/dashboard",
      };
      try {
        db.exec("BEGIN IMMEDIATE");
        saveIdempotentResponse(db, session.user.id, key, 409, body);
        db.exec("COMMIT");
      } catch {
        try { db.exec("ROLLBACK"); } catch { /* No active transaction. */ }
      }
      return jsonResponse(body, 409);
    }

    console.error("Application submission failed.", error);
    return errorResponse(500, "SUBMISSION_FAILED", "We could not save your application. Retrying is safe.");
  }
}

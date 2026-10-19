import { randomUUID, createHash } from "node:crypto";
import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getCurrentSession } from "@/lib/auth";
import { getPostgres } from "@/lib/postgres";
import { errorResponse, hasValidCsrfToken, jsonResponse, readRequestBodyWithLimit } from "@/lib/http";
import { MAX_RESUME_BYTES, normalizeApplicationFields, sanitizeOriginalFilename, validateApplicationFields, validatePdfResume } from "@/lib/application-validation";
import { getPublicJobById } from "@/lib/jobs";
import { analyzeAndPersistMatch } from "@/lib/skill-match";

const MAX_MULTIPART_BODY_BYTES = MAX_RESUME_BYTES + 128 * 1024;
function privateUploadDirectory(): string {
  return process.env.CAREERS_UPLOAD_DIR || path.join(process.cwd(), "data", "private-uploads");
}
function apiStatus(status: unknown): string {
  const map: Record<string,string> = { APPLIED:"submitted", SCREENING:"in_review", SHORTLISTED:"shortlisted", INTERVIEW:"interview", OFFERED:"offered", HIRED:"hired", REJECTED:"rejected", WITHDRAWN:"withdrawn" };
  return map[String(status)] || "submitted";
}
function objectJson(value: unknown): Record<string,unknown> {
  if (typeof value === "string") {
    try { const parsed: unknown = JSON.parse(value); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string,unknown> : {}; }
    catch { return {}; }
  }
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string,unknown> : {};
}
function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as {code?:unknown}).code === "23505";
}
async function saveIdempotency(userId:string,key:string,status:number,body:Record<string,string|number|boolean|null>):Promise<void> {
  const sql = getPostgres();
  await sql.unsafe('INSERT INTO "IdempotencyRecord" ("userId","idempotencyKey","responseStatus","responseJson") VALUES ($1,$2,$3,$4::jsonb) ON CONFLICT ("userId","idempotencyKey") DO NOTHING',[userId,key,status,sql.json(body)]);
}
export async function GET() {
  const session = await getCurrentSession();
  if (!session) return errorResponse(401,"SESSION_EXPIRED","Please sign in to view your applications.");
  const rows = await getPostgres().unsafe(
    `SELECT a."id",a."jobId" AS "roleId",j."title" AS "roleTitle",
      COALESCE(j."department",'Careers') AS "department",a."fullName",a."email",a."linkedinUrl",
      a."experienceLevel",a."coverLetter",r."originalFileName" AS "resumeName",a."status",a."submittedAt"
     FROM "Application" a
     INNER JOIN "Job" j ON j."id"=a."jobId"
     LEFT JOIN "ResumeAsset" r ON r."applicationId"=a."id"
     WHERE a."candidateId"=$1 ORDER BY a."submittedAt" DESC LIMIT 100`,
    [session.user.id]);
  return jsonResponse({ applications: rows.map(row => ({
    id:String(row.id), roleId:String(row.roleId), roleTitle:String(row.roleTitle), department:String(row.department),
    fullName:String(row.fullName), email:String(row.email), linkedinUrl:String(row.linkedinUrl || ""),
    experienceLevel:String(row.experienceLevel), coverLetter:String(row.coverLetter || ""),
    resumeName:String(row.resumeName || "Resume unavailable"), resumeAvailable:Boolean(row.resumeName),
    status:apiStatus(row.status), submittedAt:(row.submittedAt instanceof Date ? row.submittedAt : new Date(String(row.submittedAt))).getTime()
  })) });
}
export async function POST(request:Request) {
  const session = await getCurrentSession();
  if (!session) return errorResponse(401,"SESSION_EXPIRED","Your session expired. Sign in again to continue.");
  if (!hasValidCsrfToken(request,session.csrfToken)) return errorResponse(403,"CSRF_REJECTED","Refresh the form and try again.");
  const key = request.headers.get("idempotency-key")?.trim() ?? "";
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(key)) return errorResponse(400,"IDEMPOTENCY_KEY_REQUIRED","Refresh the form to create a safe submission key.");
  const sql = getPostgres();
  const prior = await sql.unsafe('SELECT "responseStatus","responseJson" FROM "IdempotencyRecord" WHERE "userId"=$1 AND "idempotencyKey"=$2',[session.user.id,key]);
  if (prior[0]) return jsonResponse(objectJson(prior[0].responseJson),Number(prior[0].responseStatus));
  const lengthHeader = request.headers.get("content-length");
  const contentLength = lengthHeader ? Number(lengthHeader) : 0;
  if (Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_BODY_BYTES) return errorResponse(413,"FILE_TOO_LARGE","The upload is too large. Choose a PDF up to 5 MB.");
  if (!request.headers.get("content-type")?.toLowerCase().includes("multipart/form-data")) return errorResponse(415,"UNSUPPORTED_MEDIA_TYPE","Submit the application using the provided form.");
  let boundedBody:Uint8Array|null;
  try { boundedBody = await readRequestBodyWithLimit(request,MAX_MULTIPART_BODY_BYTES); }
  catch { return errorResponse(400,"INVALID_MULTIPART","We could not read this form. Please try again."); }
  if (boundedBody === null) return errorResponse(413,"FILE_TOO_LARGE","The upload is too large. Choose a PDF up to 5 MB.");
  const parsedHeaders = new Headers(request.headers);
  parsedHeaders.delete("content-length");
  let formData:FormData;
  try { formData = await new Request(request.url,{method:"POST",headers:parsedHeaders,body:Buffer.from(boundedBody)}).formData(); }
  catch { return errorResponse(400,"INVALID_MULTIPART","We could not read this form. Please try again."); }
  const roleId = String(formData.get("roleId") ?? "").trim();
  const role = await getPublicJobById(roleId);
  if (!role) return errorResponse(404,"ROLE_NOT_FOUND","This role is not open for applications.");
  const fields = normalizeApplicationFields({fullName:formData.get("fullName"),email:formData.get("email"),linkedinUrl:formData.get("linkedinUrl"),experienceLevel:formData.get("experienceLevel"),coverLetter:formData.get("coverLetter")});
  const fieldErrors = validateApplicationFields(fields);
  const resumeValues = formData.getAll("resume");
  if (resumeValues.length !== 1 || typeof resumeValues[0] === "string") fieldErrors.resume = "Choose one PDF resume to continue.";
  if (Object.keys(fieldErrors).length) return errorResponse(422,"VALIDATION_ERROR","Check the highlighted fields and try again.",{fieldErrors});
  const resume = resumeValues[0] as File;
  const bytes = Buffer.from(await resume.arrayBuffer());
  if (bytes.byteLength > MAX_RESUME_BYTES) return errorResponse(413,"FILE_TOO_LARGE","The upload is too large. Choose a PDF up to 5 MB.");
  const pdfCheck = validatePdfResume({filename:resume.name,size:bytes.byteLength,header:bytes.subarray(0,8)});
  if (!pdfCheck.ok && pdfCheck.code === "EMPTY_FILE") return errorResponse(422,"VALIDATION_ERROR","Choose a non-empty PDF resume.",{fieldErrors:{resume:"Choose a non-empty PDF resume."}});
  if (!pdfCheck.ok) return errorResponse(415,"INVALID_PDF","That file is not a valid PDF. Choose a real PDF resume.");
  const originalName = sanitizeOriginalFilename(resume.name);
  const applicationId = randomUUID();
  const resumeId = randomUUID();
  const storedName = randomUUID() + ".pdf";
  const storedPath = path.join(privateUploadDirectory(),storedName);
  let fileWasWritten = false;
  try {
    mkdirSync(privateUploadDirectory(),{recursive:true,mode:0o700});
    const outcome = await sql.begin(async tx => {
      await tx.unsafe("SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))",[session.user.id,key]);
      const replay = await tx.unsafe('SELECT "responseStatus","responseJson" FROM "IdempotencyRecord" WHERE "userId"=$1 AND "idempotencyKey"=$2',[session.user.id,key]);
      if (replay[0]) return {status:Number(replay[0].responseStatus),body:objectJson(replay[0].responseJson),created:false};
      const eligible = await tx.unsafe('SELECT "id" FROM "Job" WHERE "id"=$1 AND "status"=$2 AND ("closingAt" IS NULL OR "closingAt">CURRENT_TIMESTAMP) FOR SHARE',[roleId,"PUBLISHED"]);
      if (!eligible[0]) return {status:404,body:{code:"ROLE_NOT_FOUND",message:"This role is not open for applications."},created:false};
      const existing = await tx.unsafe('SELECT "id" FROM "Application" WHERE "candidateId"=$1 AND "jobId"=$2 LIMIT 1',[session.user.id,roleId]);
      if (existing[0]) {
        const body = {code:"ALREADY_APPLIED",message:"You already applied for this role.",applicationId:String(existing[0].id),existingApplicationUrl:"/dashboard"};
        await tx.unsafe('INSERT INTO "IdempotencyRecord" ("userId","idempotencyKey","responseStatus","responseJson") VALUES ($1,$2,409,$3::jsonb) ON CONFLICT DO NOTHING',[session.user.id,key,tx.json(body)]);
        return {status:409,body,created:false};
      }
      const now = new Date();
      await tx.unsafe('INSERT INTO "Application" ("id","candidateId","jobId","fullName","email","linkedinUrl","experienceLevel","coverLetter","status","submittedAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)',
        [applicationId,session.user.id,roleId,fields.fullName,fields.email,fields.linkedinUrl,fields.experienceLevel,fields.coverLetter,"APPLIED",now]);
      writeFileSync(storedPath,bytes,{flag:"wx",mode:0o600});
      fileWasWritten = true;
      await tx.unsafe('INSERT INTO "ResumeAsset" ("id","applicationId","storageKey","originalFileName","mimeType","sizeBytes","checksum") VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [resumeId,applicationId,storedName,originalName,"application/pdf",bytes.byteLength,createHash("sha256").update(bytes).digest("hex")]);
      await tx.unsafe('INSERT INTO "ApplicationEvent" ("id","applicationId","actorId","fromStatus","toStatus","eventSource") VALUES ($1,$2,$3,NULL,$4,$5)',
        [randomUUID(),applicationId,session.user.id,"APPLIED","USER_ACTION"]);
      const body = {id:applicationId,roleId,roleTitle:role.title,status:"submitted",submittedAt:now.getTime()};
      await tx.unsafe('INSERT INTO "IdempotencyRecord" ("userId","idempotencyKey","responseStatus","responseJson") VALUES ($1,$2,201,$3::jsonb)',
        [session.user.id,key,tx.json(body)]);
      return {status:201,body,created:true};
    });
    if (outcome.status === 201 && "created" in outcome && outcome.created) {
      await analyzeAndPersistMatch(applicationId, roleId, bytes).catch(() => undefined);
    }
    return jsonResponse(outcome.body,outcome.status);
  } catch (error) {
    if (fileWasWritten) { try { unlinkSync(storedPath); } catch { /* Preserve the database failure. */ } }
    if (isUniqueViolation(error)) {
      const existing = await sql.unsafe('SELECT "id" FROM "Application" WHERE "candidateId"=$1 AND "jobId"=$2 LIMIT 1',[session.user.id,roleId]);
      if (existing[0]) {
        const body = {code:"ALREADY_APPLIED",message:"You already applied for this role.",applicationId:String(existing[0].id),existingApplicationUrl:"/dashboard"};
        try { await saveIdempotency(session.user.id,key,409,body); } catch { /* Another retry may already have stored it. */ }
        return jsonResponse(body,409);
      }
    }
    console.error("Application submission failed.",error);
    return errorResponse(500,"SUBMISSION_FAILED","We could not save your application. Retrying is safe.");
  }
}

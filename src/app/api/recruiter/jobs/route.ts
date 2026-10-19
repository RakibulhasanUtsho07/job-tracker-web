import { randomUUID } from "node:crypto";
import { getPostgres } from "@/lib/postgres";
import { errorResponse, hasValidCsrfToken, jsonResponse } from "@/lib/http";
import { requireRecruiter, isObjectBody, cleanText, readSkillList } from "@/lib/recruiter-auth";

export const dynamic = "force-dynamic";
function mode(value: unknown): string | null {
  if (value === undefined || value === "Hybrid" || value === "HYBRID") return "HYBRID";
  if (value === "Remote" || value === "REMOTE") return "REMOTE";
  if (value === "On-site" || value === "ON_SITE") return "ON_SITE";
  return null;
}
function employment(value: unknown): string | null {
  const map: Record<string,string> = {
    "Full-time":"FULL_TIME","FULL_TIME":"FULL_TIME","Part-time":"PART_TIME","PART_TIME":"PART_TIME",
    "Contract":"CONTRACT","CONTRACT":"CONTRACT","Internship":"INTERNSHIP","INTERNSHIP":"INTERNSHIP",
    "Temporary":"TEMPORARY","TEMPORARY":"TEMPORARY"
  };
  return value === undefined ? "FULL_TIME" : typeof value === "string" ? (map[value] ?? null) : null;
}
function closingDate(value: unknown): Date | null | "invalid" {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 80) return "invalid";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : "invalid";
}
export async function GET() {
  const auth = await requireRecruiter();
  if (!auth.session) return auth.response;
  const user = auth.session.user;
  const rows = await getPostgres()`
    SELECT j."id",j."title",j."department",j."description",j."location",j."workMode",j."employmentType",
      j."level",j."salary",j."status",j."closingAt",j."createdAt",j."updatedAt",
      COALESCE((SELECT jsonb_agg(jsonb_build_object('name',s."displayName",'kind',s."kind") ORDER BY s."kind",s."displayName")
        FROM "JobSkill" s WHERE s."jobId"=j."id"),'[]'::jsonb) AS "skills",
      (SELECT COUNT(*)::int FROM "Application" a WHERE a."jobId"=j."id") AS "applicationCount"
    FROM "Job" j
    WHERE (${user.role === "ADMIN"} OR j."recruiterId"=${user.id)
    ORDER BY j."updatedAt" DESC,j."id" ASC LIMIT 200
  `;
  return jsonResponse({ jobs: rows });
}
export async function POST(request: Request) {
  const auth = await requireRecruiter();
  if (!auth.session) return auth.response;
  if (!hasValidCsrfToken(request,auth.session.csrfToken)) return errorResponse(403,"CSRF_REJECTED","Refresh the page and try again.");
  let body: unknown;
  try { body=await request.json(); } catch { return errorResponse(400,"INVALID_JSON","Send valid JSON job details."); }
  if (!isObjectBody(body)) return errorResponse(400,"INVALID_INPUT","Provide the job details.");
  const title=cleanText(body.title,160);
  const department=body.department===undefined||body.department===""?null:cleanText(body.department,120);
  const description=typeof body.description==="string"?body.description.trim():"";
  const location=body.location===undefined||body.location===""?null:cleanText(body.location,160);
  const workMode=mode(body.workMode);
  const employmentType=employment(body.employmentType);
  const level=body.level===undefined||body.level===""?null:cleanText(body.level,120);
  const salary=body.salary===undefined||body.salary===""?null:cleanText(body.salary,120);
  const required=readSkillList(body.requiredSkills);
  const preferred=readSkillList(body.preferredSkills);
  const closingAt=closingDate(body.closingAt);
  if (!title||description.length<20||description.length>20000||(body.department&&!department)||(body.location&&!location)||
      !workMode||!employmentType||(body.level&&!level)||(body.salary&&!salary)||!required||!preferred||closingAt==="invalid") {
    return errorResponse(422,"VALIDATION_ERROR","Check the job title, description, work details, date and skill lists.");
  }
  if (closingAt instanceof Date && closingAt.getTime()<=Date.now()) return errorResponse(422,"INVALID_CLOSING_DATE","The closing date must be in the future.");
  const id=randomUUID();
  try {
    await getPostgres().begin(async tx=>{
      await tx`INSERT INTO "Job" ("id","recruiterId","title","department","description","location","workMode","employmentType","level","salary","status","closingAt")
        VALUES (${id,${auth.session!.user.id,${title,${department,${description,${location,${workMode,${employmentType,${level,${salary,'DRAFT',${closingAt)`;
      for(const [kind,skills] of [["REQUIRED",required],["PREFERRED",preferred]] as const) {
        for(const skill of skills) await tx`INSERT INTO "JobSkill" ("id","jobId","nameNormalized","displayName","kind")
          VALUES (${randomUUID(),${id,${skill.toLowerCase(),${skill,${kind)
          ON CONFLICT ("jobId","nameNormalized","kind") DO NOTHING`;
      }
    });
  } catch(error) {
    console.error("Recruiter job creation failed.",error);
    return errorResponse(500,"JOB_CREATE_FAILED","The job could not be saved. Check the database and try again.");
  }
  return jsonResponse({job:{id,title,department,description,location,workMode,employmentType,status:"DRAFT",requiredSkills:required,preferredSkills:preferred}},201);
}

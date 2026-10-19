import { getPostgres } from "@/lib/postgres";
import { jsonResponse } from "@/lib/http";
import { requireRecruiter } from "@/lib/recruiter-auth";

function statusLabel(status: unknown): string {
  const map: Record<string,string> = { APPLIED:"submitted", SCREENING:"in_review", SHORTLISTED:"shortlisted", INTERVIEW:"interview", OFFERED:"offered", HIRED:"hired", REJECTED:"rejected", WITHDRAWN:"withdrawn" };
  return map[String(status)] ?? "submitted";
}
export async function GET() {
  const auth = await requireRecruiter();
  if (!auth.session) return auth.response;
  const user = auth.session.user;
  const rows = await getPostgres().unsafe(
    'SELECT a."id",a."jobId",j."title" AS "jobTitle",a."fullName",a."email",a."linkedinUrl",a."experienceLevel",a."coverLetter",a."status",a."submittedAt",r."originalFileName" AS "resumeName",m."overallScore",m."analysisStatus",m."matchedSkills",m."missingRequiredSkills" FROM "Application" a INNER JOIN "Job" j ON j."id"=a."jobId" LEFT JOIN "ResumeAsset" r ON r."applicationId"=a."id" LEFT JOIN LATERAL (SELECT "overallScore","analysisStatus","matchedSkills","missingRequiredSkills" FROM "MatchAnalysis" WHERE "applicationId"=a."id" ORDER BY "createdAt" DESC,"id" DESC LIMIT 1) m ON TRUE WHERE ($1::boolean OR j."recruiterId"=$2) ORDER BY a."submittedAt" DESC LIMIT 300',
    [user.role === "ADMIN", user.id]);
  return jsonResponse({ applications: rows.map(row => ({
    id:String(row.id), jobId:String(row.jobId), jobTitle:String(row.jobTitle),
    fullName:String(row.fullName), email:String(row.email), linkedinUrl:String(row.linkedinUrl || ""),
    experienceLevel:String(row.experienceLevel), coverLetter:String(row.coverLetter || ""),
    resumeAvailable:Boolean(row.resumeName), resumeName:row.resumeName ? String(row.resumeName) : null,
    status:statusLabel(row.status), statusCode:String(row.status), submittedAt:(row.submittedAt instanceof Date ? row.submittedAt : new Date(String(row.submittedAt))).getTime(),
    matchScore:row.overallScore===null||row.overallScore===undefined?null:Number(row.overallScore),
    matchStatus:row.analysisStatus===null||row.analysisStatus===undefined?null:String(row.analysisStatus),
    matchedSkills:Array.isArray(row.matchedSkills)?row.matchedSkills:[],
    missingRequiredSkills:Array.isArray(row.missingRequiredSkills)?row.missingRequiredSkills:[],
  })) });
}

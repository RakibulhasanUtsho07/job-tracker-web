import { getPostgres } from "@/lib/postgres";
import { randomUUID } from "node:crypto";
import { errorResponse, hasValidCsrfToken, jsonResponse } from "@/lib/http";
import { requireRecruiter, isObjectBody } from "@/lib/recruiter-auth";

const allowed: Record<string, string[]> = {
  APPLIED:["SCREENING","SHORTLISTED","REJECTED","WITHDRAWN"],
  SCREENING:["SHORTLISTED","INTERVIEW","REJECTED","WITHDRAWN"],
  SHORTLISTED:["SCREENING","INTERVIEW","REJECTED","WITHDRAWN"],
  INTERVIEW:["SCREENING","SHORTLISTED","OFFERED","REJECTED","WITHDRAWN"],
  OFFERED:["HIRED","REJECTED","WITHDRAWN"],
  HIRED:[], REJECTED:[], WITHDRAWN:[]
};
const accepted = new Set(["SCREENING","SHORTLISTED","INTERVIEW","OFFERED","HIRED","REJECTED","WITHDRAWN"]);
export async function POST(request:Request,context:{params:Promise<{id:string}>}) {
  const auth=await requireRecruiter();
  if(!auth.session)return auth.response;
  if(!hasValidCsrfToken(request,auth.session.csrfToken))return errorResponse(403,"CSRF_REJECTED","Refresh the page and try again.");
  let body:unknown;
  try{body=await request.json();}catch{return errorResponse(400,"INVALID_JSON","Send a valid status update.");}
  if(!isObjectBody(body)||typeof body.status!=="string"||!accepted.has(body.status))return errorResponse(422,"INVALID_STATUS","Choose a supported application status.");
  const note=body.note===undefined||body.note===null?"":typeof body.note==="string"?body.note.trim():"invalid";
  if(note==="invalid"||note.length>1000)return errorResponse(422,"INVALID_NOTE","The private review note must be under 1,000 characters.");
  const {id}=await context.params;
  const user=auth.session.user;
  try {
    const result=await getPostgres().begin(async tx=>{
      const rows=await tx.unsafe('SELECT a."id",a."status",j."recruiterId" FROM "Application" a INNER JOIN "Job" j ON j."id"=a."jobId" WHERE a."id"=$1 AND ($2::boolean OR j."recruiterId"=$3) FOR UPDATE OF a,j',[id,user.role==="ADMIN",user.id]);
      if(!rows[0])return {error:404,code:"APPLICATION_NOT_FOUND",message:"This application was not found in your recruiter workspace."};
      const previous=String(rows[0].status), next=body.status as string;
      if(!(allowed[previous]??[]).includes(next))return {error:409,code:"INVALID_STATUS_TRANSITION",message:"That status change is not allowed from the current state."};
      await tx.unsafe('UPDATE "Application" SET "status"=$1,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$2',[next,id]);
      await tx.unsafe('INSERT INTO "ApplicationEvent" ("id","applicationId","actorId","fromStatus","toStatus","eventSource","note") VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [randomUUID(),id,user.id,previous,next,"USER_ACTION",note||null]);
      return {applicationId:id,fromStatus:previous,status:next,updatedAt:Date.now()};
    });
    if (typeof result.error === "number") return errorResponse(result.error,String(result.code),String(result.message));
    return jsonResponse({application:result});
  } catch(error){console.error("Application status update failed.",error);return errorResponse(500,"STATUS_UPDATE_FAILED","The application status could not be updated.");}
}

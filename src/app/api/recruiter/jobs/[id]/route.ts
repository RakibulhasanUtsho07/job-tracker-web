import { randomUUID } from "node:crypto";
import { getPostgres } from "@/lib/postgres";
import { errorResponse, hasValidCsrfToken, jsonResponse } from "@/lib/http";
import { requireRecruiter, isObjectBody, cleanText, readSkillList } from "@/lib/recruiter-auth";

export const dynamic = "force-dynamic";
function readMode(value:unknown,fallback:string):string|null {
  if(value===undefined)return fallback;
  if(value==="Remote"||value==="REMOTE")return "REMOTE";
  if(value==="On-site"||value==="ON_SITE")return "ON_SITE";
  if(value==="Hybrid"||value==="HYBRID")return "HYBRID";
  return null;
}
function readEmployment(value:unknown,fallback:string):string|null {
  if(value===undefined)return fallback;
  const map:Record<string,string>={"Full-time":"FULL_TIME","FULL_TIME":"FULL_TIME","Part-time":"PART_TIME","PART_TIME":"PART_TIME","Contract":"CONTRACT","CONTRACT":"CONTRACT","Internship":"INTERNSHIP","INTERNSHIP":"INTERNSHIP","Temporary":"TEMPORARY","TEMPORARY":"TEMPORARY"};
  return typeof value==="string"?(map[value]??null):null;
}
function readDate(value:unknown,fallback:Date|null):Date|null|"invalid" {
  if(value===undefined)return fallback;
  if(value===null||value==="")return null;
  if(typeof value!=="string"||value.length>80)return "invalid";
  const date=new Date(value);return Number.isFinite(date.getTime())?date:"invalid";
}
export async function PATCH(request:Request,context:{params:Promise<{id:string}>}) {
  const auth=await requireRecruiter();if(!auth.session)return auth.response;
  if(!hasValidCsrfToken(request,auth.session.csrfToken))return errorResponse(403,"CSRF_REJECTED","Refresh the page and try again.");
  let body:unknown;try{body=await request.json();}catch{return errorResponse(400,"INVALID_JSON","Send valid JSON job changes.");}
  if(!isObjectBody(body))return errorResponse(400,"INVALID_INPUT","Provide a job action or fields.");
  const {id}=await context.params,user=auth.session.user;
  try{
    const result=await getPostgres().begin(async tx=>{
      const found=await tx.unsafe('SELECT * FROM "Job" WHERE "id"=$1 AND ($2::boolean OR "recruiterId"=$3) FOR UPDATE',[id,user.role==="ADMIN",user.id]);
      const job=found[0];
      if(!job)return {error:404,code:"JOB_NOT_FOUND",message:"This job was not found in your recruiter workspace."};
      const action=body.action,currentStatus=String(job.status);
      if(action!==undefined&&action!=="publish"&&action!=="close")return {error:422,code:"INVALID_ACTION",message:"Use publish or close as a lifecycle action."};
      if(action==="close"){
        if(currentStatus!=="PUBLISHED")return {error:409,code:"INVALID_TRANSITION",message:"Only a published job can be closed."};
        await tx.unsafe('UPDATE "Job" SET "status"=$1,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$2',["CLOSED",id]);
        return {jobId:id,status:"CLOSED"};
      }
      const title=body.title===undefined?String(job.title):cleanText(body.title,160);
      const department=body.department===undefined?job.department:(body.department===null||body.department===""?null:cleanText(body.department,120));
      const description=body.description===undefined?String(job.description):(typeof body.description==="string"?body.description.trim():"");
      const location=body.location===undefined?job.location:(body.location===null||body.location===""?null:cleanText(body.location,160));
      const workMode=readMode(body.workMode,String(job.workMode)),employmentType=readEmployment(body.employmentType,String(job.employmentType));
      const level=body.level===undefined?job.level:(body.level===null||body.level===""?null:cleanText(body.level,120));
      const salary=body.salary===undefined?job.salary:(body.salary===null||body.salary===""?null:cleanText(body.salary,120));
      const closingAt=readDate(body.closingAt,job.closingAt?new Date(job.closingAt):null);
      const required=body.requiredSkills===undefined?null:readSkillList(body.requiredSkills);
      const preferred=body.preferredSkills===undefined?null:readSkillList(body.preferredSkills);
      if(!title||!description||description.length<20||description.length>20000||!workMode||!employmentType||
        (body.department!==undefined&&department===null&&body.department!==null&&body.department!=="")||
        (body.location!==undefined&&location===null&&body.location!==null&&body.location!=="")||
        (body.level!==undefined&&level===null&&body.level!==null&&body.level!=="")||
        (body.salary!==undefined&&salary===null&&body.salary!==null&&body.salary!=="")||
        closingAt==="invalid"||(body.requiredSkills!==undefined&&!required)||(body.preferredSkills!==undefined&&!preferred))
        return {error:422,code:"VALIDATION_ERROR",message:"Check changed fields, closing date and skill lists."};
      if(currentStatus==="CLOSED")return {error:409,code:"JOB_CLOSED",message:"Closed jobs cannot be edited or republished."};
      if(action==="publish"&&closingAt instanceof Date&&closingAt.getTime()<=Date.now())return {error:422,code:"INVALID_CLOSING_DATE",message:"The closing date must be in the future."};
      if(action==="publish"&&currentStatus!=="DRAFT"&&currentStatus!=="PUBLISHED")return {error:409,code:"INVALID_TRANSITION",message:"This job cannot be published from its current state."};
      if(action===undefined&&closingAt instanceof Date&&closingAt.getTime()<=Date.now())return {error:422,code:"INVALID_CLOSING_DATE",message:"Use a future closing date or clear it."};
      const nextStatus=action==="publish"?"PUBLISHED":currentStatus;
      await tx.unsafe('UPDATE "Job" SET "title"=$1,"department"=$2,"description"=$3,"location"=$4,"workMode"=$5,"employmentType"=$6,"level"=$7,"salary"=$8,"closingAt"=$9,"status"=$10,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$11',
        [title,department,description,location,workMode,employmentType,level,salary,closingAt,nextStatus,id]);
      if(required!==null||preferred!==null){
        const current=await tx.unsafe('SELECT "displayName","kind" FROM "JobSkill" WHERE "jobId"=$1',[id]);
        const requiredNow=required??current.filter(skill=>skill.kind==="REQUIRED").map(skill=>String(skill.displayName));
        const preferredNow=preferred??current.filter(skill=>skill.kind==="PREFERRED").map(skill=>String(skill.displayName));
        await tx.unsafe('DELETE FROM "JobSkill" WHERE "jobId"=$1',[id]);
        for(const [kind,list] of [["REQUIRED",requiredNow],["PREFERRED",preferredNow]] as const){
          for(const label of list)await tx.unsafe('INSERT INTO "JobSkill" ("id","jobId","nameNormalized","displayName","kind") VALUES ($1,$2,$3,$4,$5) ON CONFLICT ("jobId","nameNormalized","kind") DO NOTHING',[randomUUID(),id,label.toLowerCase(),label,kind]);
        }
      }
      return {jobId:id,title,status:nextStatus};
    });
    if("error" in result)return errorResponse(result.error,String(result.code),String(result.message));
    return jsonResponse({job:result});
  }catch(error){console.error("Recruiter job update failed.",error);return errorResponse(500,"JOB_UPDATE_FAILED","The job could not be updated.");}
}
export async function DELETE(request:Request,context:{params:Promise<{id:string}>}) {
  const auth=await requireRecruiter();if(!auth.session)return auth.response;
  if(!hasValidCsrfToken(request,auth.session.csrfToken))return errorResponse(403,"CSRF_REJECTED","Refresh the page and try again.");
  const {id}=await context.params,user=auth.session.user;
  try{
    const result=await getPostgres().begin(async tx=>{
      const found=await tx.unsafe('SELECT "id","status" FROM "Job" WHERE "id"=$1 AND ($2::boolean OR "recruiterId"=$3) FOR UPDATE',[id,user.role==="ADMIN",user.id]);
      if(!found[0])return {error:404,code:"JOB_NOT_FOUND",message:"This job was not found in your workspace."};
      if(found[0].status!=="DRAFT")return {error:409,code:"ONLY_EMPTY_DRAFTS_CAN_BE_DELETED",message:"Only draft jobs without applications can be deleted."};
      const apps=await tx.unsafe('SELECT 1 FROM "Application" WHERE "jobId"=$1 LIMIT 1',[id]);
      if(apps[0])return {error:409,code:"JOB_HAS_APPLICATIONS",message:"Jobs with applications must be closed, not deleted."};
      await tx.unsafe('DELETE FROM "JobSkill" WHERE "jobId"=$1',[id]);
      await tx.unsafe('DELETE FROM "Job" WHERE "id"=$1',[id]);
      return {deleted:true,id};
    });
    if("error" in result)return errorResponse(result.error,String(result.code),String(result.message));
    return jsonResponse(result);
  }catch(error){console.error("Recruiter job deletion failed.",error);return errorResponse(500,"JOB_DELETE_FAILED","The draft could not be deleted.");}
}

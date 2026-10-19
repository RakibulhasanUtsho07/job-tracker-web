import "server-only";
import { getPostgres } from "@/lib/postgres";
import type { JobRole } from "@/lib/roles";

type DbJob = { id:string; title:string; department:string|null; location:string|null; workMode:string|null;
  employmentType:string|null; level:string|null; salary:string|null; description:string; highlights:unknown; createdAt:string|Date };

function mapJob(row:DbJob):JobRole {
  const department=row.department||"General";
  const lower=department.toLowerCase();
  const teamColor:JobRole["teamColor"]=lower.includes("design")?"lavender":lower.includes("data")?"mint":lower.includes("customer")?"peach":"mint";
  const postedAt=(row.createdAt instanceof Date ? row.createdAt : new Date(String(row.createdAt))).getTime();
  const days=Number.isFinite(postedAt)?Math.max(0,Math.floor((Date.now()-postedAt)/86400000)):0;
  const postedLabel=days<1?"Posted today":days===1?"Posted yesterday":days<7?"Posted "+days+" days ago":"Recently posted";
  const employmentLabels: Record<string, JobRole["employmentType"]> = {
    FULL_TIME: "Full-time", PART_TIME: "Part-time", CONTRACT: "Contract",
    INTERNSHIP: "Internship", TEMPORARY: "Temporary",
  };
  return {id:String(row.id),title:String(row.title),department,location:String(row.location||"Location flexible"),
    workMode:row.workMode==="REMOTE"?"Remote":row.workMode==="ON_SITE"?"On-site":"Hybrid",
    employmentType:row.employmentType ? employmentLabels[row.employmentType] ?? "Full-time" : "Full-time",
    level:String(row.level||"Experience varies"),salary:String(row.salary||"Compensation discussed"),
    description:String(row.description),highlights:Array.isArray(row.highlights)?row.highlights.map(String).slice(0,12):[],
    teamColor,postedLabel};
}
const publicJobsSql='SELECT "id","title","department","location","workMode","employmentType","level","salary","description","highlights","createdAt" FROM "Job" WHERE "status"=$1 AND ("closingAt" IS NULL OR "closingAt">CURRENT_TIMESTAMP) ORDER BY "createdAt" DESC,"id" ASC';
export async function getPublicJobs():Promise<JobRole[]> {
  const rows=await getPostgres().unsafe(publicJobsSql,["PUBLISHED"]);
  return rows.map(row=>mapJob(row as unknown as DbJob));
}
export async function getPublicJobById(jobId:string):Promise<JobRole|null> {
  const rows=await getPostgres().unsafe(
    'SELECT "id","title","department","location","workMode","employmentType","level","salary","description","highlights","createdAt" FROM "Job" WHERE "id"=$1 AND "status"=$2 AND ("closingAt" IS NULL OR "closingAt">CURRENT_TIMESTAMP) LIMIT 1',
    [jobId,"PUBLISHED"]);
  return rows[0]?mapJob(rows[0] as unknown as DbJob):null;
}

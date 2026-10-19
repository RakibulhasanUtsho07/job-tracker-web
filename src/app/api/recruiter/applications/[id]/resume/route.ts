import { readFile } from "node:fs/promises";
import path from "node:path";
import { getPostgres } from "@/lib/postgres";
import { errorResponse } from "@/lib/http";
import { requireRecruiter } from "@/lib/recruiter-auth";
import { sanitizeOriginalFilename } from "@/lib/application-validation";

export const dynamic = "force-dynamic";
export async function GET(_request:Request,context:{params:Promise<{id:string}>}) {
  const auth=await requireRecruiter();
  if(!auth.session)return auth.response;
  const {id}=await context.params,user=auth.session.user;
  const rows=await getPostgres().unsafe(
    'SELECT r."storageKey",r."originalFileName" FROM "ResumeAsset" r INNER JOIN "Application" a ON a."id"=r."applicationId" INNER JOIN "Job" j ON j."id"=a."jobId" WHERE a."id"=$1 AND ($2::boolean OR j."recruiterId"=$3) LIMIT 1',
    [id,user.role==="ADMIN",user.id]);
  if(!rows[0])return errorResponse(404,"APPLICATION_NOT_FOUND","This application was not found in your recruiter workspace.");
  const storageKey=String(rows[0].storageKey);
  if(!/^[0-9a-f-]{36}\.pdf$/i.test(storageKey))return errorResponse(404,"RESUME_NOT_FOUND","This resume is not available.");
  const directory=process.env.CAREERS_UPLOAD_DIR||path.join(process.cwd(),"data","private-uploads");
  let bytes:Buffer;
  try{bytes=await readFile(path.join(/*turbopackIgnore: true*/directory,storageKey));}
  catch{return errorResponse(404,"RESUME_NOT_FOUND","This resume is not available.");}
  const filename=sanitizeOriginalFilename(String(rows[0].originalFileName));
  const fallback=filename.replace(/[^\x20-\x7E]/g,"_").replace(/["\\]/g,"_");
  const encoded=encodeURIComponent(filename).replace(/['()]/g,c=>"%"+c.charCodeAt(0).toString(16).toUpperCase());
  return new Response(new Uint8Array(bytes),{status:200,headers:{
    "Content-Type":"application/pdf","Content-Disposition":"attachment; filename=\""+fallback+"\"; filename*=UTF-8''"+encoded,
    "Content-Length":String(bytes.byteLength),"X-Content-Type-Options":"nosniff",
    "Content-Security-Policy":"default-src 'none'; sandbox; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    "Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"
  }});
}

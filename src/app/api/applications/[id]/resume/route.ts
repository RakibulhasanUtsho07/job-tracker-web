import { readFile } from "node:fs/promises";
import path from "node:path";
import { getCurrentSession } from "@/lib/auth";
import { getPostgres } from "@/lib/postgres";
import { errorResponse } from "@/lib/http";
import { sanitizeOriginalFilename } from "@/lib/application-validation";

export async function GET(_request:Request,context:{params:Promise<{id:string}>}) {
  const session=await getCurrentSession();
  if(!session)return errorResponse(401,"SESSION_EXPIRED","Please sign in to download this resume.");
  const {id}=await context.params;
  const rows=await getPostgres().unsafe(
    'SELECT r."storageKey",r."originalFileName" FROM "ResumeAsset" r INNER JOIN "Application" a ON a."id"=r."applicationId" WHERE a."id"=$1 AND a."candidateId"=$2 LIMIT 1',
    [id,session.user.id]);
  if(!rows[0])return errorResponse(404,"APPLICATION_NOT_FOUND","We could not find that application.");
  const directory=process.env.CAREERS_UPLOAD_DIR||path.join(process.cwd(),"data","private-uploads");
  const storedName=String(rows[0].storageKey);
  if(!/^[0-9a-f-]{36}\.pdf$/i.test(storedName))return errorResponse(404,"RESUME_NOT_FOUND","This resume is not available.");
  let bytes:Buffer;
  try{bytes=await readFile(path.join(/*turbopackIgnore: true*/directory,storedName));}
  catch{return errorResponse(404,"RESUME_NOT_FOUND","This resume is not available.");}
  const displayName=sanitizeOriginalFilename(String(rows[0].originalFileName));
  const fallbackName=displayName.replace(/[^\x20-\x7E]/g,"_").replace(/["\\]/g,"_");
  const encodedName=encodeURIComponent(displayName).replace(/['()]/g,character=>"%"+character.charCodeAt(0).toString(16).toUpperCase());
  return new Response(new Uint8Array(bytes),{status:200,headers:{
    "Content-Type":"application/pdf",
    "Content-Disposition":"attachment; filename=\""+fallbackName+"\"; filename*=UTF-8''"+encodedName,
    "Content-Length":String(bytes.byteLength),
    "X-Content-Type-Options":"nosniff",
    "Content-Security-Policy":"default-src 'none'; sandbox; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    "Cache-Control":"private, no-store",
    "Referrer-Policy":"no-referrer"
  }});
}

import { getCurrentSession } from "@/lib/auth";
import { getPostgres } from "@/lib/postgres";
import { errorResponse, jsonResponse } from "@/lib/http";

export async function GET(_request:Request,context:{params:Promise<{id:string}>}) {
  const session=await getCurrentSession();
  if(!session)return errorResponse(401,"SESSION_EXPIRED","Sign in to view your application history.");
  const {id}=await context.params;
  const owned=await getPostgres().unsafe('SELECT "id" FROM "Application" WHERE "id"=$1 AND "candidateId"=$2 LIMIT 1',[id,session.user.id]);
  if(!owned[0])return errorResponse(404,"APPLICATION_NOT_FOUND","We could not find that application.");
  const rows=await getPostgres().unsafe('SELECT "fromStatus","toStatus","eventSource","createdAt" FROM "ApplicationEvent" WHERE "applicationId"=$1 ORDER BY "createdAt" ASC,"id" ASC',[id]);
  return jsonResponse({history:rows.map(row=>({
    fromStatus:row.fromStatus===null?null:String(row.fromStatus),
    toStatus:String(row.toStatus),
    source:row.eventSource==="MIGRATION_BASELINE"?"Imported history":"Status update",
    occurredAt:(row.createdAt instanceof Date ? row.createdAt : new Date(String(row.createdAt))).toISOString()
  }))});
}

import { jsonResponse } from "@/lib/http";
import { getPublicJobs } from "@/lib/jobs";


export async function GET() {
  return jsonResponse({ roles: await getPublicJobs() });
}

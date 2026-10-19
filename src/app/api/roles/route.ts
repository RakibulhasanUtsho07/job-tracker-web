import { jsonResponse } from "@/lib/http";
import { getPublicJobs } from "@/lib/jobs";

export const dynamic = "force-dynamic";

export async function GET() {
  return jsonResponse({ roles: await getPublicJobs() });
}

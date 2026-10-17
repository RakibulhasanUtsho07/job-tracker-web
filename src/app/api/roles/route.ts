import { JOB_ROLES } from "@/lib/roles";
import { jsonResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  return jsonResponse({ roles: JOB_ROLES });
}

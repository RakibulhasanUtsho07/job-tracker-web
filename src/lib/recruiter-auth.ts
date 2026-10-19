import "server-only";
import { getCurrentSession } from "@/lib/auth";
import { errorResponse } from "@/lib/http";

export async function requireRecruiter() {
  const session = await getCurrentSession();
  if (!session) return { session: null, response: errorResponse(401,"SESSION_EXPIRED","Sign in to use recruiter tools.") };
  if (session.user.role !== "RECRUITER" && session.user.role !== "ADMIN") {
    return { session: null, response: errorResponse(403,"RECRUITER_REQUIRED","A recruiter account is required for this action.") };
  }
  return { session, response: null };
}
export function isObjectBody(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
export function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/\s+/g, " ");
  return text.length > 0 && text.length <= max ? text : null;
}
export function readSkillList(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 40) return null;
  const skills: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const label = cleanText(item, 120);
    if (!label) return null;
    const key = label.toLowerCase();
    if (!seen.has(key)) { seen.add(key); skills.push(label); }
  }
  return skills;
}

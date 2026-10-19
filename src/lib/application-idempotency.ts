import { createHash } from "node:crypto";
import type { ApplicationFields } from "@/lib/application-validation";

export type ApplicationFingerprintInput = {
  roleId: string;
  fields: ApplicationFields;
  originalFileName: string;
  resumeSha256: string;
};

/** Hash only normalized, persisted application inputs; multipart boundaries are nondeterministic. */
export function fingerprintApplicationSubmission(input: ApplicationFingerprintInput): string {
  const canonical = JSON.stringify({
    roleId: input.roleId,
    fullName: input.fields.fullName,
    email: input.fields.email,
    linkedinUrl: input.fields.linkedinUrl,
    experienceLevel: input.fields.experienceLevel,
    coverLetter: input.fields.coverLetter,
    originalFileName: input.originalFileName,
    resumeSha256: input.resumeSha256,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

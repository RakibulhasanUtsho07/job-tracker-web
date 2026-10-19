import "server-only";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { randomUUID } from "node:crypto";
import { getPostgres } from "@/lib/postgres";
import { calculateSkillMatch, type SkillDefinition } from "@/lib/skill-match-core";

const MAX_PAGES = 40;
const MAX_EXTRACTED_CHARACTERS = 120_000;

export async function extractResumeText(pdfBytes: Uint8Array): Promise<string> {
  const data = new Uint8Array(pdfBytes.byteLength);
  data.set(pdfBytes);
  const loadingTask = getDocument({ data, useSystemFonts: true, stopAtErrors: false });
  try {
    const document = await loadingTask.promise;
    if (document.numPages < 1 || document.numPages > MAX_PAGES) {
      throw new Error("The resume page count is outside the supported limit.");
    }
    const pages: string[] = [];
    let length = 0;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items.map(item => "str" in item ? item.str : "").join(" ");
      const remaining = MAX_EXTRACTED_CHARACTERS - length;
      pages.push(pageText.slice(0, remaining));
      length += Math.min(pageText.length, remaining);
      await page.cleanup();
      if (length >= MAX_EXTRACTED_CHARACTERS) break;
    }
    return pages.join(" ").normalize("NFKC").replace(/\s+/g, " ").trim();
  } finally {
    await loadingTask.destroy();
  }
}

/** Stores a reproducible analysis without ever making a hiring decision. Failures
 * are recorded as UNAVAILABLE so a valid application remains valid. */
export async function analyzeAndPersistMatch(applicationId: string, jobId: string, pdfBytes: Uint8Array): Promise<void> {
  const sql = getPostgres();
  try {
    const rows = await sql.unsafe(
      'SELECT "displayName","nameNormalized","kind" FROM "JobSkill" WHERE "jobId"=$1 ORDER BY "kind","nameNormalized"',
      [jobId]);
    const skills: SkillDefinition[] = rows.map(row => ({
      displayName: String(row.displayName),
      nameNormalized: String(row.nameNormalized),
      kind: row.kind === "REQUIRED" ? "REQUIRED" : "PREFERRED",
    }));
    let result;
    try {
      const extracted = await extractResumeText(pdfBytes);
      result = calculateSkillMatch(extracted, skills);
    } catch {
      result = {
        algorithmVersion: "keyword-v1" as const,
        analysisStatus: "UNAVAILABLE" as const,
        overallScore: null,
        skillCoverageScore: null,
        matchedSkills: [] as string[],
        missingRequiredSkills: [] as string[],
        analysisMessage: "Resume text extraction was unavailable; the application was retained.",
      };
    }
    await sql.unsafe(
      'INSERT INTO "MatchAnalysis" ("id","applicationId","algorithmVersion","overallScore","skillCoverageScore","textSimilarityScore","matchedSkills","missingRequiredSkills","analysisStatus","analysisMessage") VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10)',
      [randomUUID(),applicationId,result.algorithmVersion,result.overallScore,result.skillCoverageScore,null,
       JSON.stringify(result.matchedSkills),JSON.stringify(result.missingRequiredSkills),result.analysisStatus,result.analysisMessage]);
  } catch (error) {
    // Analysis must not roll back a valid application or leak resume content.
    console.error("SkillMatch analysis could not be stored.",error);
  }
}

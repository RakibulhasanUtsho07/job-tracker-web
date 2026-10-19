const SKILL_ALIASES: Record<string, string[]> = {
  "javascript": ["javascript", "js", "ecmascript"],
  "typescript": ["typescript", "ts"],
  "node.js": ["node.js", "nodejs", "node js"],
  "react": ["react", "react.js", "reactjs"],
  "postgresql": ["postgresql", "postgres"],
  "continuous integration": ["continuous integration", "ci"],
  "test automation": ["test automation", "automation testing", "automated testing"],
  "ux research": ["ux research", "user experience research"],
  "api design": ["api design", "api development", "rest api", "restful api"],
  "problem solving": ["problem solving", "problem-solving", "troubleshooting"]
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^\x24{}()|[\]\\]/g, "\\\x24&");
}
function matchPhrase(text: string, phrase: string): boolean {
  const escaped = escapeRegExp(phrase.trim().toLowerCase()).replace(/\s+/g, "\\s+");
  if (!escaped) return false;
  return new RegExp("(?<![\\p{L}\\p{N}])" + escaped + "(?![\\p{L}\\p{N}])", "iu").test(text);
}

export type SkillDefinition = { displayName: string; nameNormalized: string; kind: "REQUIRED" | "PREFERRED" };
export type SkillMatchResult = {
  algorithmVersion: "keyword-v1";
  analysisStatus: "COMPLETED" | "UNAVAILABLE";
  overallScore: number | null;
  skillCoverageScore: number | null;
  matchedSkills: string[];
  missingRequiredSkills: string[];
  analysisMessage: string | null;
};

export function calculateSkillMatch(resumeText: string, skills: SkillDefinition[]): SkillMatchResult {
  const text = resumeText.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  if (!text) return {
    algorithmVersion: "keyword-v1", analysisStatus: "UNAVAILABLE",
    overallScore: null, skillCoverageScore: null, matchedSkills: [],
    missingRequiredSkills: [], analysisMessage: "No searchable text was extracted from the resume.",
  };
  const validSkills = skills.filter(skill => skill.displayName.trim() && (skill.kind === "REQUIRED" || skill.kind === "PREFERRED"));
  if (validSkills.length === 0) return {
    algorithmVersion: "keyword-v1", analysisStatus: "UNAVAILABLE",
    overallScore: null, skillCoverageScore: null, matchedSkills: [],
    missingRequiredSkills: [], analysisMessage: "This job has no matching skills configured yet.",
  };

  const matched: SkillDefinition[] = [];
  const missingRequired: string[] = [];
  let requiredCount = 0, requiredMatched = 0, preferredCount = 0, preferredMatched = 0;
  for (const skill of validSkills) {
    const normalized = skill.nameNormalized.trim().toLowerCase();
    const phrases = Array.from(new Set([skill.displayName.toLowerCase(), normalized, ...(SKILL_ALIASES[normalized] ?? [])]));
    const found = phrases.some(phrase => matchPhrase(text, phrase));
    if (skill.kind === "REQUIRED") {
      requiredCount++;
      if (found) requiredMatched++; else missingRequired.push(skill.displayName);
    } else {
      preferredCount++;
      if (found) preferredMatched++;
    }
    if (found) matched.push(skill);
  }
  const requiredCoverage = requiredCount ? requiredMatched / requiredCount : null;
  const preferredCoverage = preferredCount ? preferredMatched / preferredCount : null;
  const score = requiredCoverage !== null && preferredCoverage !== null
    ? requiredCoverage * 80 + preferredCoverage * 20
    : requiredCoverage !== null ? requiredCoverage * 100
    : (preferredCoverage ?? 0) * 100;
  const rounded = Math.round(score * 100) / 100;
  return {
    algorithmVersion: "keyword-v1", analysisStatus: "COMPLETED",
    overallScore: rounded, skillCoverageScore: rounded,
    matchedSkills: matched.map(skill => skill.displayName),
    missingRequiredSkills: missingRequired,
    analysisMessage: "Heuristic keyword overlap only; not a hiring probability or an automated hiring decision.",
  };
}

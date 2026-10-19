import test from "node:test";
import assert from "node:assert/strict";
import { calculateSkillMatch } from "../src/lib/skill-match-core.ts";

const skills = [
  { displayName: "TypeScript", nameNormalized: "typescript", kind: "REQUIRED" as const },
  { displayName: "React", nameNormalized: "react", kind: "REQUIRED" as const },
  { displayName: "Accessibility", nameNormalized: "accessibility", kind: "PREFERRED" as const },
];

test("reports a reproducible full skill match with case-insensitive aliases", () => {
  const result = calculateSkillMatch("Built UI with TS and react; shipped accessibility reviews.", skills);
  assert.equal(result.analysisStatus, "COMPLETED");
  assert.equal(result.overallScore, 100);
  assert.deepEqual(result.matchedSkills, ["TypeScript", "React", "Accessibility"]);
  assert.deepEqual(result.missingRequiredSkills, []);
});

test("partial match exposes the missing required skill rather than hiding the reason", () => {
  const result = calculateSkillMatch("Experienced TypeScript developer.", skills);
  assert.equal(result.overallScore, 40);
  assert.deepEqual(result.missingRequiredSkills, ["React"]);
});

test("unrelated text scores zero and lists required skills as missing", () => {
  const result = calculateSkillMatch("Enjoys gardening, music and reading.", skills);
  assert.equal(result.overallScore, 0);
  assert.deepEqual(result.missingRequiredSkills, ["TypeScript", "React"]);
});

test("empty extracted text is unavailable rather than a zero-score rejection", () => {
  const result = calculateSkillMatch("   ", skills);
  assert.equal(result.analysisStatus, "UNAVAILABLE");
  assert.equal(result.overallScore, null);
});

test("a job with no skill vocabulary reports unavailable matching", () => {
  const result = calculateSkillMatch("TypeScript React", []);
  assert.equal(result.analysisStatus, "UNAVAILABLE");
  assert.equal(result.overallScore, null);
});

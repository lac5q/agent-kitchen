import { describe, expect, it } from "vitest";
import { summarizeSkillBudget, type SkillCatalogEntry } from "@/lib/skill-budget";

function entry(
  name: string,
  description: string,
  sourceId = "runtime"
): SkillCatalogEntry {
  return {
    name,
    description,
    path: `/tmp/${sourceId}/${name}/SKILL.md`,
    sourceId,
    sourceType: sourceId.includes("plugin") ? "plugin" : "runtime",
  };
}

describe("summarizeSkillBudget", () => {
  it("dedupes skill names before calculating model-visible metadata", () => {
    const report = summarizeSkillBudget(
      [
        entry("browser", "Open and inspect browser targets.", "codex-runtime"),
        entry("browser", "Duplicate plugin browser skill.", "plugin-cache"),
        entry("github", "Manage GitHub issues and pull requests.", "plugin-cache"),
      ],
      500
    );

    expect(report.totalSkills).toBe(3);
    expect(report.uniqueSkills).toBe(2);
    expect(report.duplicateSkills).toEqual(["browser"]);
    expect(report.metadataChars).toBeLessThan(120);
  });

  it("flags over-budget catalogs with actionable recommendations", () => {
    const entries = Array.from({ length: 90 }, (_, index) =>
      entry(
        `skill-${index}`,
        "This description is intentionally verbose so it simulates a client catalog that should be projected into a smaller runtime set."
      )
    );

    const report = summarizeSkillBudget(entries, 200);

    expect(report.status).toBe("over");
    expect(report.recommendations).toContain(
      "Reduce model-visible skill metadata before startup; current metadata exceeds the configured budget."
    );
    expect(report.recommendations).toContain(
      "Use role-specific runtime projections instead of exposing the full shared skill catalog."
    );
  });
});

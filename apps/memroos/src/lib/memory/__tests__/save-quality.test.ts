import { describe, expect, it } from "vitest";

import { scoreMemoryWrite } from "@/lib/memory/save-quality";

describe("save-quality rubric", () => {
  it("coaches a vague write without rejecting it", () => {
    const report = scoreMemoryWrite({
      memoryType: "episodic",
      content: "Remember the deployment.",
      metadata: { source: "test" },
      firstSeenAt: "2026-08-04T00:00:00Z",
    });

    expect(report.verdict).toBe("accepted_with_coaching");
    expect(report.flags).toContain("no_outcome_stated");
    expect(report.guidance.join(" ")).toContain("what happened as a result");
  });

  it("flags duplicate rediscovery and procedure-shaped memory", () => {
    const report = scoreMemoryWrite({
      memoryType: "episodic",
      content: "Procedure: 1. run the deploy check. 2. always record the result.",
      metadata: { source: "runbook", derivedFrom: "fixture" },
      duplicateOf: "agent_memory_writes:42",
      firstSeenAt: "2026-08-04T00:00:00Z",
    });

    expect(report.flags).toEqual(expect.arrayContaining([
      "duplicate_of:agent_memory_writes:42",
      "procedure_belongs_in_skill",
    ]));
    expect(report.guidance.join(" ")).toContain("flagged as rediscovery");
    expect(report.guidance.join(" ")).toContain("Propose a skill");
  });

  it("hard-rejects only a policy violation", () => {
    const report = scoreMemoryWrite({
      memoryType: "episodic",
      content: "A useful outcome was recorded for project SAVEQ.",
      metadata: { source: "test", derivedFrom: "fixture" },
      policyAllowed: false,
    });

    expect(report.verdict).toBe("rejected");
    expect(report.flags).toContain("policy_violation");
  });
});


// @vitest-environment node
import { describe, expect, it } from "vitest";

import { canApplyTightenSuggestion, proposeShadowSuggestion } from "../llm-adjudicator";

describe("llm shadow adjudicator", () => {
  it("abstains when fixed labels already decided sensitivity", () => {
    const suggestion = proposeShadowSuggestion({
      content: "Anything about contracts",
      sourceType: "email",
      deterministicReasonCodes: ["fixed_label:legal"],
    });
    expect(suggestion.abstain).toBe(true);
    expect(suggestion.tighten).toBe(false);
    expect(suggestion.reasonCodes).toContain("abstain_fixed_label_authoritative");
    expect(canApplyTightenSuggestion(suggestion)).toBe(false);
  });

  it("abstains without evidence spans", () => {
    const suggestion = proposeShadowSuggestion({
      content: "Hello team, sync tomorrow.",
      sourceType: "email",
    });
    expect(suggestion.abstain).toBe(true);
    expect(suggestion.reasonCodes).toContain("abstain_no_evidence_span");
  });

  it("proposes tighten-only legal/finance candidates with evidence", () => {
    const suggestion = proposeShadowSuggestion({
      content: "Please review the NDA with counsel before signing.",
      sourceType: "email",
    });
    expect(suggestion.abstain).toBe(false);
    expect(suggestion.tighten).toBe(true);
    expect(suggestion.domain).toBe("legal");
    expect(suggestion.sensitivity).toBe("privileged");
    expect(suggestion.evidenceSpans.length).toBeGreaterThan(0);
    expect(canApplyTightenSuggestion(suggestion)).toBe(true);
  });
});

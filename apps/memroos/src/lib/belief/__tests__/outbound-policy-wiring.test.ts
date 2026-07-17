// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  DEFAULT_OUTBOUND_POLICY,
  type OutboundPolicy,
} from "../outbound-policy";
import { applyOutboundPolicyToMemoryItems } from "../outbound-policy-wiring";

function permissivePolicy(overrides: Partial<OutboundPolicy> = {}): OutboundPolicy {
  return {
    ...DEFAULT_OUTBOUND_POLICY,
    goldOnly: false,
    bronzeAsCitationOnly: true,
    ...overrides,
  };
}

describe("applyOutboundPolicyToMemoryItems", () => {
  it("passes through items missing beliefStage without receipts", () => {
    const result = applyOutboundPolicyToMemoryItems(
      [{ id: "raw", content: "legacy memory without stage" }],
      DEFAULT_OUTBOUND_POLICY
    );

    expect(result.emitted).toHaveLength(1);
    expect(result.emitted[0]).toMatchObject({
      id: "raw",
      content: "legacy memory without stage",
    });
    expect(result.dropped).toEqual([]);
    expect(result.receipts).toEqual([]);
  });

  it("passes through staged items that lack string content", () => {
    const result = applyOutboundPolicyToMemoryItems(
      [{ beliefStage: "gold_operational_truth", payload: { nested: true } }],
      DEFAULT_OUTBOUND_POLICY
    );

    expect(result.emitted).toHaveLength(1);
    expect(result.emitted[0].beliefStage).toBe("gold_operational_truth");
    expect(result.dropped).toEqual([]);
    expect(result.receipts).toEqual([]);
  });

  it("extracts stage from nested stage / belief_stage aliases", () => {
    const result = applyOutboundPolicyToMemoryItems(
      [
        { stage: "gold_operational_truth", content: "from stage alias" },
        { belief_stage: "silver_candidate_claim", text: "from belief_stage alias" },
      ],
      permissivePolicy()
    );

    expect(result.emitted).toHaveLength(2);
    expect(result.emitted[0].beliefStage).toBe("gold_operational_truth");
    expect(result.emitted[0].caveat).toBeNull();
    expect(result.emitted[1].beliefStage).toBe("silver_candidate_claim");
    expect(result.emitted[1].caveat).toBeTruthy();
    expect(result.receipts).toHaveLength(2);
  });

  it("emits gold claims with caveat null", () => {
    const result = applyOutboundPolicyToMemoryItems(
      [{ beliefStage: "gold_operational_truth", content: "gold claim" }],
      DEFAULT_OUTBOUND_POLICY
    );

    expect(result.emitted).toEqual([
      expect.objectContaining({
        beliefStage: "gold_operational_truth",
        content: "gold claim",
        caveat: null,
      }),
    ]);
    expect(result.dropped).toEqual([]);
    expect(result.receipts[0].action).toBe("emitted");
  });

  it("drops silver claims under goldOnly policy", () => {
    const item = { beliefStage: "silver_candidate_claim" as const, content: "silver" };
    const result = applyOutboundPolicyToMemoryItems([item], DEFAULT_OUTBOUND_POLICY);

    expect(result.emitted).toEqual([]);
    expect(result.dropped).toEqual([item]);
    expect(result.receipts).toHaveLength(1);
    expect(result.receipts[0].action).toBe("dropped");
  });

  it("tags bronze citation-only items when citationMode is enabled", () => {
    const result = applyOutboundPolicyToMemoryItems(
      [{ beliefStage: "bronze_raw_source", content: "raw source note" }],
      permissivePolicy(),
      { citationMode: true }
    );

    expect(result.emitted).toHaveLength(1);
    expect(result.emitted[0]).toMatchObject({
      beliefStage: "bronze_raw_source",
      caveat: "[citation only]",
      citationOnly: true,
    });
    expect(result.receipts).toHaveLength(1);
  });

  it("reads string content from nested content/text objects", () => {
    const result = applyOutboundPolicyToMemoryItems(
      [
        {
          beliefStage: "gold_operational_truth",
          content: { content: "nested content field" },
        },
        {
          beliefStage: "gold_operational_truth",
          text: { text: "nested text field" },
        },
      ],
      DEFAULT_OUTBOUND_POLICY
    );

    expect(result.emitted).toHaveLength(2);
    expect(result.emitted[0].caveat).toBeNull();
    expect(result.emitted[1].caveat).toBeNull();
  });
});

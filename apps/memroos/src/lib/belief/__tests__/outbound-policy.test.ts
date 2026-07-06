// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  BELIEF_OUTBOUND_ENV_KEYS,
  DEFAULT_OUTBOUND_POLICY,
  DEFAULT_SILVER_CAVEAT,
  filterOutboundClaims,
  loadOutboundPolicy,
  type Claim,
  type OutboundPolicy,
} from "../outbound-policy";

const GOLD_CLAIM: Claim = {
  stage: "gold_operational_truth",
  content: "Memroos incident command policy is DR_RUNBOOK v3",
};

const SILVER_CLAIM: Claim = {
  stage: "silver_candidate_claim",
  content: "SketchPop retention hooks fire on cart-abandon only",
};

const BRONZE_CLAIM: Claim = {
  stage: "bronze_raw_source",
  content: "Stripe webhook payload: invoice.id=in_abc123 amount=4200",
};

function goldOnlyPolicy(overrides: Partial<OutboundPolicy> = {}): OutboundPolicy {
  return { ...DEFAULT_OUTBOUND_POLICY, ...overrides };
}

function permissivePolicy(overrides: Partial<OutboundPolicy> = {}): OutboundPolicy {
  return {
    ...DEFAULT_OUTBOUND_POLICY,
    goldOnly: false,
    bronzeAsCitationOnly: true,
    ...overrides,
  };
}

describe("BELIEF-04 outbound policy", () => {
  describe("loadOutboundPolicy env handling", () => {
    it("defaults to goldOnly=true with the standard caveat", () => {
      const policy = loadOutboundPolicy({});
      expect(policy.goldOnly).toBe(true);
      expect(policy.silverCaveat).toBe(DEFAULT_SILVER_CAVEAT);
      expect(policy.bronzeAsCitationOnly).toBe(true);
    });

    it("honors truthy/falsy env overrides", () => {
      const policy = loadOutboundPolicy({
        [BELIEF_OUTBOUND_ENV_KEYS.goldOnly]: "false",
        [BELIEF_OUTBOUND_ENV_KEYS.silverCaveat]: "  [needs review] ",
        [BELIEF_OUTBOUND_ENV_KEYS.bronzeAsCitationOnly]: "0",
      });
      expect(policy.goldOnly).toBe(false);
      expect(policy.silverCaveat).toBe("[needs review]");
      expect(policy.bronzeAsCitationOnly).toBe(false);
    });
  });

  it("gold_passes_through: gold is emitted with caveat:null", () => {
    const result = filterOutboundClaims([GOLD_CLAIM], goldOnlyPolicy());
    expect(result.emitted).toHaveLength(1);
    expect(result.emitted[0]).toEqual({
      stage: "gold_operational_truth",
      claim: GOLD_CLAIM.content,
      caveat: null,
    });
    expect(result.dropped).toEqual([]);
    expect(result.receipts).toHaveLength(1);
    expect(result.receipts[0].action).toBe("emitted");
    expect(result.receipts[0].stage).toBe("gold_operational_truth");
  });

  it("silver_dropped_when_goldOnly: silver rejected, never in emitted list", () => {
    const result = filterOutboundClaims([SILVER_CLAIM], goldOnlyPolicy());
    expect(result.emitted).toEqual([]);
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0].content).toBe(SILVER_CLAIM.content);
    expect(result.receipts[0]).toMatchObject({
      stage: "silver_candidate_claim",
      action: "dropped",
    });
  });

  it("silver_caveated_when_not_goldOnly: silver emitted with caveat", () => {
    const result = filterOutboundClaims([SILVER_CLAIM], permissivePolicy());
    expect(result.dropped).toEqual([]);
    expect(result.emitted).toHaveLength(1);
    const emitted = result.emitted[0];
    expect(emitted.stage).toBe("silver_candidate_claim");
    if (emitted.stage === "silver_candidate_claim") {
      expect(emitted.caveat).toBe(DEFAULT_SILVER_CAVEAT);
      expect(emitted.claim).toBe(SILVER_CLAIM.content);
    }
    expect(result.receipts[0]).toMatchObject({
      stage: "silver_candidate_claim",
      action: "caveated",
    });
  });

  it("uses the configured silver caveat verbatim", () => {
    const custom = "[CUSTOM-CAVEAT]";
    const result = filterOutboundClaims(
      [SILVER_CLAIM],
      permissivePolicy({ silverCaveat: custom })
    );
    expect(result.emitted).toHaveLength(1);
    if (result.emitted[0].stage === "silver_candidate_claim") {
      expect(result.emitted[0].caveat).toBe(custom);
    }
  });

  it("bronze_dropped_by_default: bronze dropped unless citation mode is on", () => {
    const result = filterOutboundClaims([BRONZE_CLAIM], goldOnlyPolicy());
    expect(result.emitted).toEqual([]);
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0].content).toBe(BRONZE_CLAIM.content);
    expect(result.receipts[0]).toMatchObject({
      stage: "bronze_raw_source",
      action: "dropped",
    });
  });

  it("bronze_emitted_as_citation_only: bronze passes through with citationOnly flag", () => {
    const result = filterOutboundClaims(
      [BRONZE_CLAIM],
      goldOnlyPolicy(),
      { citationMode: true }
    );
    expect(result.dropped).toEqual([]);
    expect(result.emitted).toHaveLength(1);
    expect(result.emitted[0]).toEqual({
      stage: "bronze_raw_source",
      claim: BRONZE_CLAIM.content,
      citationOnly: true,
    });
    expect(result.receipts[0]).toMatchObject({
      stage: "bronze_raw_source",
      action: "emitted",
    });
  });

  it("bronze emits without citation mode when policy.bronzeAsCitationOnly=false", () => {
    const result = filterOutboundClaims(
      [BRONZE_CLAIM],
      { ...DEFAULT_OUTBOUND_POLICY, bronzeAsCitationOnly: false }
    );
    expect(result.emitted).toHaveLength(1);
    expect(result.emitted[0].stage).toBe("bronze_raw_source");
  });

  it("receipts_expose_hash_not_content: every receipt has claimHash; no raw content in serialized receipts", () => {
    const sentinel = "RAW-CONTENT-MUST-NOT-LEAK-2026-07-06";
    const claims: Claim[] = [
      { stage: "gold_operational_truth", content: `${sentinel}-gold` },
      { stage: "silver_candidate_claim", content: `${sentinel}-silver` },
      { stage: "bronze_raw_source", content: `${sentinel}-bronze` },
    ];
    const dropped = filterOutboundClaims(claims, goldOnlyPolicy());
    const emitted = filterOutboundClaims(claims, permissivePolicy(), {
      citationMode: true,
    });
    const combined = [...dropped.receipts, ...emitted.receipts];

    expect(combined.every((receipt) => typeof receipt.claimHash === "string")).toBe(true);
    expect(combined.every((receipt) => receipt.claimHash.startsWith("sha256:"))).toBe(true);

    const serialized = JSON.stringify(combined);
    expect(serialized.includes(sentinel)).toBe(false);
    // also ensure no individual content substring leaks
    for (const claim of claims) {
      expect(serialized.includes(claim.content)).toBe(false);
    }
  });

  it("deterministic: identical inputs produce identical outputs", () => {
    const claims: Claim[] = [GOLD_CLAIM, SILVER_CLAIM, BRONZE_CLAIM];
    const a = filterOutboundClaims(claims, permissivePolicy(), { citationMode: true });
    const b = filterOutboundClaims(claims, permissivePolicy(), { citationMode: true });
    expect(a.receipts.map((r) => r.claimHash)).toEqual(b.receipts.map((r) => r.claimHash));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("returns empty arrays for empty input", () => {
    const result = filterOutboundClaims([], DEFAULT_OUTBOUND_POLICY);
    expect(result.emitted).toEqual([]);
    expect(result.dropped).toEqual([]);
    expect(result.receipts).toEqual([]);
  });
});

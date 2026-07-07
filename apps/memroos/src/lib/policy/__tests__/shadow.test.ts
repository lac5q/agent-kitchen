// @vitest-environment node
/**
 * Phase 129 (POLGOV-04) — Shadow mode tests.
 *
 * Pure unit tests covering `shadowEvaluate` and `activatePolicyVersion`.
 * No DB required.
 */

import { describe, expect, it } from "vitest";

import proposedManifestRaw from "../policies/manifest.proposed.json";

import {
  activatePolicyVersion,
  shadowEvaluate,
  type ProposedManifest,
  type ShadowDecisionRecord,
} from "../shadow";

// The proposed manifest is JSON-loaded, so `effect: "deny"` arrives as a
// plain string. The runtime value is the discriminant literal; we cast at
// the test boundary so the typed function signature is preserved.
const proposedManifest = proposedManifestRaw as unknown as ProposedManifest;

describe("shadowEvaluate", () => {
  it("records newlyDenied when a dimension rule would tighten the outcome", () => {
    const recent: ShadowDecisionRecord[] = [
      {
        currentOutcome: "allow",
        request: {
          domain: "memory-use",
          action: "export.gtm-client",
          dimensions: {
            subject: { team: ["GTM"] },
            object: { domain: ["client"], sensitivity: ["privileged"] },
            purpose: "export",
          },
        },
      },
    ];

    const result = shadowEvaluate(proposedManifest, recent);

    expect(result.total).toBe(1);
    expect(result.newlyDenied).toHaveLength(1);
    expect(result.newlyDenied[0].proposedOutcome).toBe("deny");
    expect(result.newlyDenied[0].currentOutcome).toBe("allow");
    expect(result.newlyAllowed).toHaveLength(0);
    expect(result.unchanged).toBe(0);
  });

  it("records unchanged for decisions unaffected by proposed rules", () => {
    const recent: ShadowDecisionRecord[] = [
      {
        currentOutcome: "deny",
        request: {
          domain: "memory-use",
          action: "recall.sealed",
        },
      },
      {
        currentOutcome: "review-required",
        request: {
          domain: "memory-use",
          action: "recall.hr",
        },
      },
    ];

    const result = shadowEvaluate(proposedManifest, recent);

    expect(result.total).toBe(2);
    expect(result.unchanged).toBe(2);
    expect(result.newlyDenied).toHaveLength(0);
    expect(result.newlyAllowed).toHaveLength(0);
  });

  it("does not record newlyAllowed when proposed rules only tighten (additive invariant)", () => {
    // The proposed manifest adds one deny rule. For a request whose
    // current outcome is already "deny", the proposed outcome is also
    // "deny" -> unchanged, NOT newlyAllowed. Additive-only invariant:
    // dimension rules can never loosen a deny to allow.
    const recent: ShadowDecisionRecord[] = [
      {
        currentOutcome: "deny",
        request: {
          domain: "memory-use",
          action: "recall.sealed",
          dimensions: {
            subject: { team: ["GTM"] },
            object: { domain: ["client"], sensitivity: ["privileged"] },
            purpose: "export",
          },
        },
      },
    ];

    const result = shadowEvaluate(proposedManifest, recent);

    expect(result.newlyAllowed).toHaveLength(0);
    expect(result.newlyDenied).toHaveLength(0);
    expect(result.unchanged).toBe(1);
  });

  it("handles mixed recent decisions across buckets correctly", () => {
    const recent: ShadowDecisionRecord[] = [
      // newly denied
      {
        currentOutcome: "allow",
        request: {
          domain: "memory-use",
          action: "export.gtm-client",
          dimensions: {
            subject: { team: ["GTM"] },
            object: { domain: ["client"], sensitivity: ["privileged"] },
            purpose: "export",
          },
        },
      },
      // unchanged: no dimensions supplied
      {
        currentOutcome: "deny",
        request: { domain: "memory-use", action: "recall.sealed" },
      },
      // unchanged: dimensions do not match the proposed rule
      {
        currentOutcome: "allow",
        request: {
          domain: "memory-use",
          action: "export.ops-client",
          dimensions: {
            subject: { team: ["OPS"] },
            object: { domain: ["client"], sensitivity: ["privileged"] },
            purpose: "export",
          },
        },
      },
    ];

    const result = shadowEvaluate(proposedManifest, recent);

    expect(result.total).toBe(3);
    expect(result.newlyDenied).toHaveLength(1);
    expect(result.unchanged).toBe(2);
    expect(result.newlyAllowed).toHaveLength(0);
  });

  it("returns zeroed result for empty recent decisions", () => {
    const result = shadowEvaluate(proposedManifest, []);
    expect(result.total).toBe(0);
    expect(result.unchanged).toBe(0);
    expect(result.newlyDenied).toHaveLength(0);
    expect(result.newlyAllowed).toHaveLength(0);
  });
});

describe("activatePolicyVersion", () => {
  it("activates a valid proposed manifest", () => {
    const result = activatePolicyVersion(
      { version: "2026.07.130", rules: [{ id: "test", domain: "memory-use" }] },
      "2026.07.129"
    );
    expect(result.activated).toBe(true);
    expect(result.newVersion).toBe("2026.07.130");
    expect(result.reason).toBe("operator-approved");
  });

  it("refuses to activate when version is unchanged", () => {
    const result = activatePolicyVersion(
      { version: "2026.07.129", rules: [{ id: "test", domain: "memory-use" }] },
      "2026.07.129"
    );
    expect(result.activated).toBe(false);
    expect(result.newVersion).toBe("2026.07.129");
    expect(result.reason).toBe("version_unchanged");
  });

  it("refuses to activate when rules array is empty", () => {
    const result = activatePolicyVersion(
      { version: "2026.07.130", rules: [] },
      "2026.07.129"
    );
    expect(result.activated).toBe(false);
    expect(result.reason).toBe("empty_rules");
  });

  it("refuses to activate when version is missing", () => {
    const result = activatePolicyVersion(
      // @ts-expect-error -- intentional bad shape
      { rules: [{ id: "test", domain: "memory-use" }] },
      "2026.07.129"
    );
    expect(result.activated).toBe(false);
    expect(result.reason).toBe("invalid_proposed_version");
  });
});
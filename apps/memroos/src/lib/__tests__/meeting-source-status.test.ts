import { describe, expect, it } from "vitest";

import {
  SOURCE_STATUS,
  SOURCE_STATUS_VALUES,
  coerceSourceStatus,
  isSourceStatus,
  isTerminalSourceStatus,
  type SourceStatus,
} from "../meeting-source-status";

describe("meeting-source-status enum", () => {
  it("has the canonical 6 cases in pipeline order", () => {
    expect([...SOURCE_STATUS_VALUES]).toEqual([
      SOURCE_STATUS.providerAbsent,
      SOURCE_STATUS.providerAuthBlocked,
      SOURCE_STATUS.capturedUnrouted,
      SOURCE_STATUS.routedUnindexed,
      SOURCE_STATUS.indexedUnrecalled,
      SOURCE_STATUS.recalled,
    ]);
  });

  it("isTerminalSourceStatus marks only recalled as terminal", () => {
    expect(isTerminalSourceStatus(SOURCE_STATUS.recalled)).toBe(true);
    for (const status of SOURCE_STATUS_VALUES) {
      if (status === SOURCE_STATUS.recalled) continue;
      expect(isTerminalSourceStatus(status)).toBe(false);
    }
  });

  it("coerceSourceStatus normalizes case + unknown to provider_absent", () => {
    expect(coerceSourceStatus("RECALLED")).toBe<SOURCE_STATUS>("recalled");
    expect(coerceSourceStatus("captured_unrouted")).toBe<SOURCE_STATUS>("captured_unrouted");
    expect(coerceSourceStatus("totally bogus")).toBe<SOURCE_STATUS>("provider_absent");
    expect(coerceSourceStatus(null)).toBe<SOURCE_STATUS>("provider_absent");
    expect(coerceSourceStatus(undefined)).toBe<SOURCE_STATUS>("provider_absent");
  });

  it("isSourceStatus type-guards", () => {
    expect(isSourceStatus("recalled")).toBe(true);
    expect(isSourceStatus("provider_absent")).toBe(true);
    expect(isSourceStatus("nope")).toBe(false);
    expect(isSourceStatus(42)).toBe(false);
    expect(isSourceStatus(null)).toBe(false);
  });

  it("exposes exactly the same literals as the Python SourceStatus enum", () => {
    // Locked down to keep both languages in lockstep.
    const expected = new Set<SourceStatus>([
      "provider_absent",
      "provider_auth_blocked",
      "captured_unrouted",
      "routed_unindexed",
      "indexed_unrecalled",
      "recalled",
    ]);
    const got = new Set<SourceStatus>(SOURCE_STATUS_VALUES as SourceStatus[]);
    expect(got).toEqual(expected);
  });
});

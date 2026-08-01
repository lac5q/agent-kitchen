// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  PackContractError,
  isSha256Hash,
  normalizePackProvenance,
  scrubLegacyPackProvenance,
} from "../pack-contract";

const VALID = {
  sourceId: "src_pack_01",
  classification: "internal" as const,
  importedAt: "2026-07-12T00:00:00.000Z",
  references: ["ref_pack_01"],
};

describe("pack contract provenance", () => {
  it("normalizes valid provenance summaries", () => {
    const summary = normalizePackProvenance(VALID);
    expect(summary).toEqual({
      ...VALID,
      references: ["ref_pack_01"],
    });
    expect(summary.references).not.toBe(VALID.references);
  });

  it("rejects unsupported fields and invalid identifiers", () => {
    expect(() => normalizePackProvenance(null)).toThrow(PackContractError);
    expect(() => normalizePackProvenance({ ...VALID, extra: "field" })).toThrow(/unsupported fields/);
    expect(() => normalizePackProvenance({ ...VALID, sourceId: "bad id" })).toThrow(/sourceId/);
    expect(() => normalizePackProvenance({ ...VALID, classification: "secret" })).toThrow(/classification/);
    expect(() => normalizePackProvenance({ ...VALID, importedAt: "yesterday" })).toThrow(/importedAt/);
    expect(() => normalizePackProvenance({ ...VALID, references: ["not-a-ref"] })).toThrow(/references/);
  });

  it("scrubs legacy provenance that fails the new schema", () => {
    expect(scrubLegacyPackProvenance(VALID)).toEqual({
      ...VALID,
      references: ["ref_pack_01"],
    });
    expect(scrubLegacyPackProvenance({ note: "legacy blob" })).toEqual({});
  });

  it("validates sha256 content hashes", () => {
    const hash = `sha256:${"a".repeat(64)}`;
    expect(isSha256Hash(hash)).toBe(true);
    expect(isSha256Hash("sha256:deadbeef")).toBe(false);
    expect(isSha256Hash(42)).toBe(false);
  });
});

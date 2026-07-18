// @vitest-environment node
import { describe, expect, it } from "vitest";

import { performTemporalRetrieval } from "../temporal-retrieval";

const candidates = [
  { id: "a", timestamp_iso: "2026-01-01T00:00:00.000Z", text: "older" },
  { id: "b", timestamp_iso: "2026-01-02T00:00:00.000Z", text: "middle" },
  { id: "c", timestamp_iso: "2026-01-03T00:00:00.000Z", text: "newer" },
] as const;

describe("temporal retrieval", () => {
  it("selects the latest candidate before the reference time", () => {
    const result = performTemporalRetrieval({
      candidates: [...candidates],
      metadata: { reference_time_iso: "2026-01-04T00:00:00.000Z", temporal_direction: "latest" },
    });

    expect(result.selected).toEqual(["c"]);
    expect(result.status).toBe("caveat");
    expect(result.caveats.some((c) => c.code === "candidate_stale")).toBe(true);
    expect(result.receipt.stageVersion).toBe("temporal-retrieval-v1");
  });

  it("selects the closest before and after candidates", () => {
    const before = performTemporalRetrieval({
      candidates: [...candidates],
      metadata: { reference_time_iso: "2026-01-02T12:00:00.000Z", temporal_direction: "before" },
    });
    const after = performTemporalRetrieval({
      candidates: [...candidates],
      metadata: { reference_time_iso: "2026-01-02T12:00:00.000Z", temporal_direction: "after" },
    });

    expect(before.selected).toEqual(["b"]);
    expect(after.selected).toEqual(["c"]);
  });

  it("selects a midpoint candidate for between windows", () => {
    const result = performTemporalRetrieval({
      candidates: [...candidates],
      metadata: {
        reference_time_iso: "2026-01-01T00:00:00.000Z",
        fact_valid_until_iso: "2026-01-03T00:00:00.000Z",
        temporal_direction: "between",
      },
    });

    expect(result.selected).toEqual(["a"]);
    expect(result.validUntilIso).toBe("2026-01-03T00:00:00.000Z");
    expect(result.caveats.some((c) => c.code === "missing_validity_window")).toBe(false);
  });

  it("abstains and caveats when timestamps conflict or are missing", () => {
    const conflict = performTemporalRetrieval({
      candidates: [
        { id: "dup-1", timestamp_iso: "2026-01-02T00:00:00.000Z", text: "one" },
        { id: "dup-2", timestamp_iso: "2026-01-02T00:00:00.000Z", text: "two" },
      ],
      metadata: { reference_time_iso: "2026-01-03T00:00:00.000Z", temporal_direction: "latest" },
    });
    expect(conflict.status).toBe("caveat");
    expect(conflict.caveats.some((c) => c.code === "conflicting_facts")).toBe(true);

    const missing = performTemporalRetrieval({
      candidates: [{ id: "no-ts", text: "missing timestamp" }],
      metadata: { temporal_direction: "latest" },
      options: { nowIso: "2026-01-03T00:00:00.000Z" },
    });
    expect(missing.status).toBe("abstain");
    expect(missing.caveats.some((c) => c.code === "no_timestamps")).toBe(true);

    const truncated = performTemporalRetrieval({
      candidates: Array.from({ length: 40 }, (_, index) => ({
        id: `item-${index}`,
        timestamp_iso: `2026-01-${String((index % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
        text: `entry ${index}`,
      })),
      metadata: { reference_time_iso: "2026-02-01T00:00:00.000Z", temporal_direction: "latest" },
      options: { maxCandidates: 5 },
    });
    expect(truncated.receipt.truncated).toBe(true);
    expect(truncated.caveats.some((c) => c.code === "direction_underspecified")).toBe(true);
  });

  it("falls back to now when reference timestamps are invalid", () => {
    const result = performTemporalRetrieval({
      candidates: [
        { id: "valid", timestamp_iso: "2026-01-02T00:00:00.000Z", text: "valid timestamp" },
        { id: "invalid", timestamp_iso: "not-a-date", text: "invalid timestamp" },
      ],
      metadata: { reference_time_iso: "not-a-date", temporal_direction: "latest" },
      scopeReferenceIso: "also-invalid",
      options: { nowIso: "2026-01-03T00:00:00.000Z" },
    });

    expect(result.referenceTimeIso).toBe("2026-01-03T00:00:00.000Z");
    expect(result.selected).toEqual(["valid"]);
    expect(result.candidates.map((candidate) => candidate.id)).toEqual(["valid"]);
  });

  it("returns no selection for empty directional windows", () => {
    const before = performTemporalRetrieval({
      candidates: [{ id: "later", timestamp_iso: "2026-01-05T00:00:00.000Z", text: "later" }],
      metadata: { reference_time_iso: "2026-01-01T00:00:00.000Z", temporal_direction: "before" },
    });
    const after = performTemporalRetrieval({
      candidates: [{ id: "earlier", timestamp_iso: "2026-01-01T00:00:00.000Z", text: "earlier" }],
      metadata: { reference_time_iso: "2026-01-05T00:00:00.000Z", temporal_direction: "after" },
    });
    const between = performTemporalRetrieval({
      candidates: [{ id: "outside", timestamp_iso: "2026-01-05T00:00:00.000Z", text: "outside" }],
      metadata: {
        reference_time_iso: "2026-01-01T00:00:00.000Z",
        fact_valid_until_iso: "2026-01-02T00:00:00.000Z",
        temporal_direction: "between",
      },
    });

    expect(before.selected).toEqual([]);
    expect(after.selected).toEqual([]);
    expect(between.selected).toEqual([]);
  });
});

// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";

import type { RetrievedItem } from "../../schema";
import {
  decideMerge,
  dedupeRetrievalResults,
} from "../dedupe";
import {
  decideEntityMerge,
  extractEntities,
} from "../entity-extraction";
import {
  getBenchAuditSink,
  recordBenchContamination,
  recordBenchPublication,
  recordBenchReceipt,
  recordBenchReplay,
  recordBenchRun,
  resetBenchAuditSink,
  setBenchAuditSink,
} from "../audit-chain";
import { performTierFanout } from "../tier-fanout";

function item(overrides: Partial<RetrievedItem> = {}): RetrievedItem {
  return {
    id: "mem-1",
    score: 1,
    text: "same fact",
    tier: "lexical",
    source: "corpus",
    authorizationResult: "allowed",
    whyEntered: "fixture",
    rankPosition: 1,
    ...overrides,
  };
}

afterEach(() => {
  resetBenchAuditSink();
});

describe("entity-extraction targeted branches", () => {
  it("returns a typed empty receipt for non-string input", () => {
    const result = extractEntities(null as unknown as string, { version: "test-version", seed: 9 });

    expect(result).toMatchObject({
      ok: false,
      reason: "extraction_text_missing",
      entities: [],
      receipt: {
        extractorVersion: "test-version",
        seed: 9,
        canonicalizationHash: "sha256:",
      },
    });
  });

  it("accounts for invalid surfaces and alias expansion limits", () => {
    const invalid = extractEntities("Longlonglong Surface", {
      limits: { minEntitySurfaceLength: 2, maxEntitySurfaceLength: 8 },
    });
    expect(invalid.receipt.rejectedReasons.invalidSurface).toBeGreaterThan(0);

    const overExpansion = extractEntities("Qdrant QDRANT", {
      limits: { maxExpansionPerEntity: 1, maxAliasChainLength: 8 },
    });
    expect(overExpansion.entities).toHaveLength(0);
    expect(overExpansion.receipt.rejectedReasons.overExpansionLimit).toBe(1);

    const cycle = extractEntities("Qdrant QDRANT", {
      limits: { maxExpansionPerEntity: 8, maxAliasChainLength: 1 },
    });
    expect(cycle.entities).toHaveLength(0);
    expect(cycle.receipt.rejectedReasons.cycle).toBe(1);
  });

  it("keeps only valid entity candidates while rejecting scope-less merges", () => {
    const extracted = extractEntities("Alice met QDRANT on 2026-04-01", { seed: 3 });
    const withInvalid = decideEntityMerge({
      scope: "tenant-a",
      candidates: [
        ...extracted.entities,
        { ...extracted.entities[0], id: "", canonical: "" },
      ],
      nowIso: "2026-07-18T00:00:00.000Z",
    });

    expect(withInvalid.ok).toBe(true);
    expect(withInvalid.keptEntities.every((entity) => entity.id && entity.canonical)).toBe(true);
    expect(
      decideEntityMerge({ scope: "", candidates: extracted.entities, nowIso: "2026-07-18T00:00:00.000Z" }),
    ).toMatchObject({ ok: false, reason: "scope_required", droppedEntities: extracted.entities });
  });
});

describe("tier-fanout targeted branches", () => {
  it("records denied, stale, zero-trust, timeout, failed, and success receipts", async () => {
    const ticks = [0, 10, 20, 20, 20, 20];
    const result = await performTierFanout({
      query: "memory durability",
      scope: "tenant-a",
      sources: [
        { tier: "live", state: "registered" },
        { tier: "lexical", state: "registered" },
        { tier: "mem0", state: "registered", trust: 0 },
        { tier: "qdrant", state: "registered", expiresAtIso: "1970-01-01T00:00:00.001Z" },
        { tier: "vector-local", state: "registered" },
      ],
      budget: { maxSources: 4, maxItemsPerSource: 1, deadlineMs: 5 },
      allowedTiers: ["lexical", "live", "mem0", "qdrant"],
      now: () => ticks.shift() ?? 20,
      caller: async ({ tier, maxItems }) => {
        if (tier === "lexical") {
          return {
            items: [
              item({ id: "b", score: 1, text: "lower", tier, rankPosition: 2 }),
              item({ id: "a", score: 5, text: "higher", tier, rankPosition: 1 }),
            ].slice(0, maxItems),
            trustAtCall: 1,
          };
        }
        if (tier === "live") throw new Error("provider down");
        return { items: [], trustAtCall: 0 };
      },
    });

    expect(result.perSource.find((entry) => entry.tier === "vector-local")).toMatchObject({
      status: "denied",
      reasonCode: "tier_not_allowed",
    });
    expect(result.perSource.find((entry) => entry.tier === "qdrant")).toMatchObject({
      status: "stale",
      reasonCode: "source_expired",
    });
    expect(result.perSource.find((entry) => entry.tier === "lexical")).toMatchObject({
      status: "timeout",
      reasonCode: "deadline_exceeded",
    });
    expect(result.perSource.find((entry) => entry.tier === "live")).toMatchObject({
      status: "failed",
      reasonCode: "provider down",
    });
    expect(result.perSource.find((entry) => entry.tier === "mem0")).toMatchObject({
      status: "denied",
      reasonCode: "zero_trust",
      trustAtCall: 0,
    });
  });
});

describe("dedupe targeted branches", () => {
  it("preserves distinct derivatives across scope and timestamp boundaries", () => {
    expect(
      decideMerge({
        existing: item({ id: "mem-1", tier: "vector-local", scopeHash: "scope-a", timestamp_iso: "2026-01-01T00:00:00Z" }),
        candidate: item({ id: "mem-1-vector", tier: "vector-local", scopeHash: "scope-b", timestamp_iso: "2026-01-01T00:00:00Z" }),
      }),
    ).toMatchObject({ merge: false, nonMergeReason: "distinct_scope" });

    expect(
      decideMerge({
        existing: item({ id: "mem-1", tier: "vector-local", scopeHash: "scope-a", timestamp_iso: "2026-01-01T00:00:00Z" }),
        candidate: item({ id: "mem-1-vector", tier: "vector-local", scopeHash: "scope-a", timestamp_iso: "2026-01-02T00:00:00Z" }),
      }),
    ).toMatchObject({ merge: false, nonMergeReason: "distinct_timestamp" });
  });

  it("keeps the higher scoring exact duplicate while preserving the original rank slot", () => {
    const result = dedupeRetrievalResults({
      items: [
        item({ id: "same", score: 0.2, rankPosition: 9 }),
        item({ id: "same", score: 0.9, rankPosition: 10 }),
        item({ id: "other", score: 0.1, text: "other fact", rankPosition: 11 }),
      ],
    });

    expect(result.items).toHaveLength(2);
    expect(result.items.find((entry) => entry.id === "same")).toMatchObject({ score: 0.9, rankPosition: 2 });
    expect(result.receipt).toMatchObject({ consideredCount: 3, keptCount: 2, mergedCount: 1 });
    expect(result.receipt.canonicalHash).toMatch(/^sha256:/);
  });
});

describe("audit-chain targeted branches", () => {
  it("skips all audit event types when the write guard is armed", () => {
    const contexts = [
      recordBenchRun({ runId: "run-1", skipWrite: true }),
      recordBenchReceipt({ runId: "run-1", reconciliationHash: "sha256:receipt", skipWrite: true }),
      recordBenchPublication({
        runId: "run-1",
        decisionHash: "sha256:decision",
        status: "blocked_for_publication",
        caveats: ["incomplete"],
        skipWrite: true,
      }),
      recordBenchReplay({ runId: "run-1", fingerprint: "sha256:fingerprint", skipWrite: true }),
      recordBenchContamination({ runId: "run-1", reason: "foreign_record", rejectedCount: 2, skipWrite: true }),
    ];

    expect(contexts.every((outcome) => outcome.ok && outcome.status === "skipped_no_write")).toBe(true);
  });

  it("uses the test sink and converts sink exceptions to typed failures", () => {
    setBenchAuditSink((args) => ({
      ok: true,
      status: "persisted_via_test_sink",
      auditId: `${args.eventType}:${args.entityId}`,
    }));
    expect(getBenchAuditSink()).toBeTruthy();
    expect(recordBenchRun({ runId: "sink-run", reason: "started" })).toMatchObject({
      ok: true,
      status: "persisted_via_test_sink",
      auditId: "retrieval_bench.run:retrieval_bench:run:sink-run",
    });

    setBenchAuditSink(() => {
      throw new Error("sink offline");
    });
    expect(recordBenchRun({ runId: "sink-run" })).toMatchObject({
      ok: false,
      status: "persistence_failed",
      reason: "sink_threw:sink offline",
    });
  });
});

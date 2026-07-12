/**
 * Schema contract tests for the retrieval-bench module.
 */
import { describe, expect, it } from "vitest";
import {
  BENCHMARK_LANES,
  DATASET_PROVENANCE,
  DATASET_TO_LANE,
  PROVIDER_FLAGS,
  SUPPORTED_ADAPTERS,
  SUPPORTED_DATASETS,
  SUPPORTED_TASK_TYPES,
} from "../schema";

describe("retrieval-bench schema", () => {
  it("exposes the four supported datasets", () => {
    expect([...SUPPORTED_DATASETS].sort()).toEqual(
      ["locomo", "longmemeval", "longmemeval_v2", "memroos_public_synthetic"],
    );
  });

  it("exposes seven supported task types", () => {
    expect(SUPPORTED_TASK_TYPES.length).toBe(7);
    expect(SUPPORTED_TASK_TYPES).toContain("single_hop");
    expect(SUPPORTED_TASK_TYPES).toContain("multi_hop");
    expect(SUPPORTED_TASK_TYPES).toContain("temporal_reasoning");
    expect(SUPPORTED_TASK_TYPES).toContain("event_summary");
    expect(SUPPORTED_TASK_TYPES).toContain("entity_state");
    expect(SUPPORTED_TASK_TYPES).toContain("open_domain_qa");
    expect(SUPPORTED_TASK_TYPES).toContain("abstention");
  });

  it("exposes six supported adapters", () => {
    expect(SUPPORTED_ADAPTERS.length).toBe(6);
    expect(SUPPORTED_ADAPTERS).toContain("lexical");
    expect(SUPPORTED_ADAPTERS).toContain("no-memory");
    expect(SUPPORTED_ADAPTERS).toContain("vector-local");
    expect(SUPPORTED_ADAPTERS).toContain("mem0");
    expect(SUPPORTED_ADAPTERS).toContain("qdrant");
    expect(SUPPORTED_ADAPTERS).toContain("live");
  });

  it("defines three distinct benchmark lanes", () => {
    expect([...BENCHMARK_LANES].sort()).toEqual(
      ["architecture_evidence", "external_retrieval", "operational_workflow"],
    );
  });

  it("exposes per-dataset provenance blocks with license metadata", () => {
    for (const dataset of SUPPORTED_DATASETS) {
      const p = DATASET_PROVENANCE[dataset];
      expect(p.dataset).toBe(dataset);
      expect(p.sourceLicense.length).toBeGreaterThan(0);
      expect(p.sourceCitation.length).toBeGreaterThan(0);
      expect(["available", "unavailable", "synthetic"]).toContain(p.sourceAvailability);
    }
  });

  it("maps every dataset to exactly one lane", () => {
    const reverseMap: Record<string, string[]> = {};
    for (const [d, l] of Object.entries(DATASET_TO_LANE)) {
      reverseMap[l] = reverseMap[l] ?? [];
      reverseMap[l].push(d);
    }
    // Multiple datasets in one lane is fine; one dataset in multiple lanes is not.
    for (const d of SUPPORTED_DATASETS) {
      const lanes = Object.entries(DATASET_TO_LANE)
        .filter(([ds, _l]) => ds === d)
        .map(([_ds, l]) => l);
      expect(lanes.length).toBe(1);
    }
    expect(Object.keys(reverseMap)).toContain("external_retrieval");
  });

  it("defines independent provider flags", () => {
    expect([...PROVIDER_FLAGS].sort()).toEqual(
      ["embedding", "external_mcp", "judge", "rerank", "vector_backend"],
    );
  });
});

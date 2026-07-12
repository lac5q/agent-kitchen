/**
 * Fixture validation tests (VAL-RETR-002).
 */
import { describe, expect, it } from "vitest";
import {
  hashCorpus,
  hashFixtures,
  hashTaskIdentity,
  isDatasetId,
  isTaskType,
  partitionValidTasks,
  validateFixtures,
  validateTask,
} from "../validation";
import type { NormalizedTask } from "../schema";

function makeTask(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "task-1",
    dataset: "memroos_public_synthetic",
    task_type: "single_hop",
    corpus: [
      { id: "mem-1", text: "The team decided to use Qdrant for vector search." },
    ],
    question: "Which vector store did the team decide to use?",
    expected_answer: "Qdrant",
    evidence_spans: ["mem-1"],
    license: "MIT",
    citation: "MemroOS internal synthetic benchmark",
    provenance: {
      dataset: "memroos_public_synthetic",
      sourceCitation: "MemroOS internal synthetic benchmark",
      sourceLicense: "MIT",
      sourceAvailability: "synthetic",
    },
    ...overrides,
  };
}

describe("retrieval-bench fixture validation (VAL-RETR-002)", () => {
  it("accepts a well-formed synthetic task", () => {
    const r = validateTask(makeTask(), { seenIds: new Set() });
    expect(r.ok).toBe(true);
  });

  it("rejects missing id", () => {
    const r = validateTask(makeTask({ id: undefined }), { seenIds: new Set() });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues.some((i) => i.field === "id")).toBe(true);
    }
  });

  it("rejects empty corpus", () => {
    const r = validateTask(makeTask({ corpus: [] }), { seenIds: new Set() });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues.some((i) => i.field === "corpus")).toBe(true);
    }
  });

  it("rejects duplicate corpus IDs", () => {
    const r = validateTask(
      makeTask({
        corpus: [
          { id: "mem-1", text: "First." },
          { id: "mem-1", text: "Duplicate ID." },
        ],
      }),
      { seenIds: new Set() },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues.some((i) => i.reason === "duplicate_corpus_id")).toBe(true);
    }
  });

  it("rejects dangling evidence spans", () => {
    const r = validateTask(
      makeTask({
        corpus: [{ id: "mem-1", text: "Only one entry." }],
        evidence_spans: ["mem-1", "mem-missing"],
      }),
      { seenIds: new Set() },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues.some((i) => i.reason === "dangling_evidence_span")).toBe(true);
    }
  });

  it("rejects invalid task_type enum", () => {
    const r = validateTask(
      makeTask({ task_type: "unicorn_reasoning" }),
      { seenIds: new Set() },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues.some((i) => i.field === "task_type")).toBe(true);
    }
  });

  it("rejects malformed ISO timestamps", () => {
    const r = validateTask(
      makeTask({
        corpus: [
          { id: "mem-1", text: "x", timestamp_iso: "not-a-date" },
        ],
      }),
      { seenIds: new Set() },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues.some((i) => i.reason === "timestamp_invalid_iso8601")).toBe(true);
    }
  });

  it("rejects invalid temporal_direction enum", () => {
    const r = validateTask(
      makeTask({
        temporal_metadata: { temporal_direction: "sideways" },
      }),
      { seenIds: new Set() },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues.some((i) => i.reason === "temporal_direction_invalid_enum")).toBe(true);
    }
  });

  it("rejects license mismatch with canonical provenance", () => {
    const r = validateTask(
      makeTask({ license: "Proprietary", provenance: { dataset: "memroos_public_synthetic", sourceCitation: "MemroOS internal synthetic benchmark", sourceLicense: "Proprietary", sourceAvailability: "synthetic" } }),
      { seenIds: new Set() },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues.some((i) => i.reason === "provenance_sourceLicense_mismatch")).toBe(true);
    }
  });

  it("rejects duplicate task IDs across the fixture set", () => {
    const tasks = [makeTask({ id: "task-1" }), makeTask({ id: "task-1" })];
    const r = validateFixtures(tasks);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues.some((i) => i.reason === "duplicate_task_id")).toBe(true);
    }
  });

  it("partitionValidTasks returns validated tasks", () => {
    const r = partitionValidTasks([
      makeTask({ id: "task-1" }),
      makeTask({ id: "task-2", license: "Proprietary", provenance: { dataset: "memroos_public_synthetic", sourceCitation: "MemroOS internal synthetic benchmark", sourceLicense: "Proprietary", sourceAvailability: "synthetic" } }),
    ]);
    expect(r.invalid).toBeGreaterThan(0);
    expect(r.valid.length).toBe(0);
  });

  it("hashFixtures is stable across runs for equivalent inputs", () => {
    const a: NormalizedTask[] = [
      makeTask({ id: "task-1" }) as unknown as NormalizedTask,
    ];
    const b: NormalizedTask[] = [
      makeTask({ id: "task-1" }) as unknown as NormalizedTask,
    ];
    expect(hashFixtures(a)).toBe(hashFixtures(b));
  });

  it("hashFixtures changes when a corpus entry changes", () => {
    const a: NormalizedTask[] = [
      makeTask({ id: "task-1" }) as unknown as NormalizedTask,
    ];
    const b: NormalizedTask[] = [
      makeTask({ id: "task-1", corpus: [{ id: "mem-1", text: "Changed." }] }) as unknown as NormalizedTask,
    ];
    expect(hashFixtures(a)).not.toBe(hashFixtures(b));
  });

  it("hashCorpus and hashTaskIdentity are independent", () => {
    const t = makeTask() as unknown as NormalizedTask;
    const corpusHash = hashCorpus(t.corpus);
    const identityHash = hashTaskIdentity(t);
    expect(corpusHash).not.toBe(identityHash);
    expect(corpusHash.startsWith("sha256:")).toBe(true);
    expect(identityHash.startsWith("sha256:")).toBe(true);
  });

  it("isTaskType and isDatasetId narrow correctly", () => {
    expect(isTaskType("single_hop")).toBe(true);
    expect(isTaskType("unicorn")).toBe(false);
    expect(isDatasetId("locomo")).toBe(true);
    expect(isDatasetId("nope")).toBe(false);
  });
});

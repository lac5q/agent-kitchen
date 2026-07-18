// @vitest-environment node
import Database from "better-sqlite3";
import { describe, expect, it, vi } from "vitest";

import { initSchema } from "@/lib/db-schema";
import { finalizeQmdUpdate, serializeQmdUpdate } from "@/lib/memory/qmd";
import {
  assertCandidateAuthoritative,
  registerOntologyDerivative,
  registerOntologySource,
  resolveOntologyValidity,
  sourceForCanonicalDefinition,
} from "@/lib/ontology/validity";
import { OntologyGovernanceError } from "@/lib/ontology/candidates";
import { convertLoCoMoSamples, hashLoCoMoSource } from "@/lib/retrieval-bench/adapters/locomo";
import { resolveLaneForDataset } from "@/lib/retrieval-bench/lanes";
import { createEvalJob, getEvalJob, listEvalJobs } from "@/lib/seal/behavioral-jobs";
import { runQueuedJob } from "@/lib/seal/behavioral-runner";

const ontologyRegistry = vi.hoisted(() => ({
  discoverOntology: vi.fn(),
}));

vi.mock("@/lib/ontology/registry", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ontology/registry")>()),
  discoverOntology: ontologyRegistry.discoverOntology,
}));

function fakeDb(getImpl: (sql: string, args: unknown[]) => unknown) {
  return {
    prepare: (sql: string) => ({
      get: (...args: unknown[]) => getImpl(sql, args),
      run: vi.fn(),
      all: vi.fn(() => []),
    }),
  } as unknown as Database.Database;
}

describe("long-tail coverage batch L library branches", () => {
  it("handles QMD missing-table fallbacks and not-found updates", () => {
    const noTableDb = fakeDb(() => {
      throw new Error("no such table: memory_qmd_updates");
    });

    const serialized = serializeQmdUpdate(noTableDb, "docs/qmd.md", "source", new Date("2026-01-01T00:00:00.000Z"));
    expect(serialized).toMatchObject({ targetPath: "docs/qmd.md", status: "pending" });
    expect(finalizeQmdUpdate(noTableDb, "qmd-1", "success", new Date("2026-01-02T00:00:00.000Z"))).toMatchObject({
      id: "qmd-1",
      targetPath: "mock",
      status: "success",
      lastSuccessTimestamp: "2026-01-02T00:00:00.000Z",
    });

    const missingDb = fakeDb(() => undefined);
    expect(() => finalizeQmdUpdate(missingDb, "missing", "failed")).toThrow(/not found/);
  });

  it("rejects unavailable ontology validity context before derivatives become authoritative", () => {
    const emptyDb = fakeDb(() => undefined);

    expect(() =>
      registerOntologySource(emptyDb, {
        tenantId: "tenant",
        spaceId: "space",
        sourceId: "source",
        sourceHash: "hash",
        actor: " ",
      }),
    ).toThrow(OntologyGovernanceError);
    expect(() =>
      registerOntologyDerivative(emptyDb, {
        tenantId: "tenant",
        spaceId: "space",
        sourceId: "source",
        sourceHash: "hash",
        derivativeType: "candidate",
        derivativeId: "candidate-1",
      }),
    ).toThrow(/source lifecycle/);
    expect(sourceForCanonicalDefinition(emptyDb, {
      ontologyId: "ont",
      ontologyVersion: "v1",
      namespace: "mem",
      canonicalId: "mem.Entity",
    })).toBeNull();
  });

  it("distinguishes stale ontology and candidate revocation branches", () => {
    ontologyRegistry.discoverOntology.mockImplementationOnce(() => {
      throw new Error("registry unavailable");
    });
    const rowDb = fakeDb((sql) => {
      if (sql.includes("ontology_versioned_records")) {
        return {
          id: "vr-1",
          source_id: "source",
          source_hash: "hash",
          ontology_id: "ont",
          ontology_version: "v1",
          ontology_content_hash: "hash-old",
          qualified_type: "mem.Entity",
          mapping_path_json: "[]",
        };
      }
      return { ok: 1 };
    });
    expect(() =>
      resolveOntologyValidity(rowDb, { tenantId: "tenant", spaceId: "space", recordType: "deal", recordId: "d1" }),
    ).toThrow(/ontology context is unavailable/);

    ontologyRegistry.discoverOntology.mockReturnValueOnce({ globallyActive: false, contentHash: "hash-new" });
    expect(() =>
      resolveOntologyValidity(rowDb, { tenantId: "tenant", spaceId: "space", recordType: "deal", recordId: "d1" }),
    ).toThrow(/stale or unavailable/);

    const unapprovedCandidateDb = fakeDb((sql) => {
      if (sql.includes("ontology_candidates")) {
        return { source_id: "source", source_hash: "hash", status: "pending" };
      }
      return undefined;
    });
    expect(() =>
      assertCandidateAuthoritative(unapprovedCandidateDb, { tenantId: "tenant", spaceId: "space", candidateId: "cand-1" }),
    ).toThrow(/candidate is not authoritative/);

    const revokedCandidateDb = fakeDb((sql) => {
      if (sql.includes("ontology_candidates")) {
        return { source_id: "source", source_hash: "hash", status: "approved" };
      }
      return undefined;
    });
    expect(() =>
      assertCandidateAuthoritative(revokedCandidateDb, { tenantId: "tenant", spaceId: "space", candidateId: "cand-1" }),
    ).toThrow(/candidate source is revoked/);
  });

  it("rejects malformed LoCoMo samples and hashes canonical source fields", () => {
    expect(convertLoCoMoSamples({ rawSamples: null as never })).toEqual({ ok: false, reason: "raw_samples_not_array" });
    expect(convertLoCoMoSamples({ rawSamples: [] })).toEqual({ ok: false, reason: "raw_samples_empty" });
    expect(convertLoCoMoSamples({ rawSamples: [{ sample_id: "", conversations: [], qa: [] }] })).toEqual({
      ok: false,
      reason: "sample_malformed:",
    });

    const converted = convertLoCoMoSamples({
      rawSamples: [
        {
          sample_id: "sample",
          source_file_hash: "sha256:source",
          conversations: [
            {
              session_id: "s1",
              turns: [{ role: "user", text: "Where is the launch?", timestamp_iso: "2026-01-01T00:00:00.000Z" }],
            },
          ],
          qa: [{ qid: "q1", question: "Where?", answer: "Here", category: "temporal", evidence_session_ids: ["s1"] }],
        },
      ],
    });
    expect(converted.ok).toBe(true);
    if (converted.ok) {
      expect(converted.tasks[0]).toMatchObject({
        id: "locomo-sample-q1",
        task_type: "temporal_reasoning",
        evidence_spans: ["sample-s1-turn-0"],
        provenance: expect.objectContaining({ sourceHash: "sha256:source" }),
      });
    }
    expect(hashLoCoMoSource([
      { sample_id: "s", conversations: [{ session_id: "c", turns: [{ role: "user", text: "raw" }] }], qa: [{ qid: "q", question: "Q", answer: "A" }] },
    ])).toMatch(/^sha256:/);
  });

  it("reports unassigned benchmark lanes without cross-averaging", () => {
    expect(resolveLaneForDataset("unknown_dataset" as never)).toEqual({
      ok: false,
      reason: "dataset_not_assigned_to_lane:unknown_dataset",
    });
  });

  it("covers SEAL job filters and missing proposal runner exits", async () => {
    const db = new Database(":memory:");
    initSchema(db);
    db.pragma("foreign_keys = OFF");

    const queued = createEvalJob(db, { proposalId: "missing-proposal", proposalType: "noop_test", agentId: "agent-1" });
    createEvalJob(db, { proposalId: "another-missing-proposal", proposalType: "noop_test", agentId: "agent-1" });
    expect(listEvalJobs(db, { status: "queued", limit: 1 })).toHaveLength(1);

    await expect(runQueuedJob(db, "does-not-exist", {
      db,
      rescoreForProposal: vi.fn(),
    })).rejects.toThrow();

    await runQueuedJob(db, queued.id, {
      db,
      rescoreForProposal: vi.fn(),
    });
    expect(getEvalJob(db, queued.id)).toMatchObject({
      status: "failed",
      errorMessage: "Proposal not found: missing-proposal",
    });

    db.close();
  });
});

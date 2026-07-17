// @vitest-environment node
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_OUTBOUND_POLICY } from "@/lib/belief/outbound-policy";
import { initSchema } from "@/lib/db-schema";
import {
  getOutboundFilteredBundle,
  getTaskEvidenceBundle,
  listTaskEvidenceBundles,
  upsertTaskEvidenceBundle,
} from "@/lib/evidence/task-bundles";

let db: Database.Database;

beforeEach(() => {
  db = new Database(":memory:");
  initSchema(db);
});

afterEach(() => {
  db.close();
});

describe("task evidence bundles", () => {
  it("upserts a new bundle with defaults and reads it back", () => {
    const bundle = upsertTaskEvidenceBundle(db, {
      id: "bundle-1",
      taskId: "task-abc",
      plan: ["step one"],
      memories: [{ id: "mem-1", content: "legacy memory" }],
    });

    expect(bundle).toMatchObject({
      id: "bundle-1",
      taskId: "task-abc",
      tenantId: "default-tenant",
      status: "open",
      plan: ["step one"],
      memories: [{ id: "mem-1", content: "legacy memory" }],
      replayHandle: null,
      rollbackHandle: null,
    });
    expect(bundle.createdAt).toBeTruthy();
    expect(bundle.updatedAt).toBeTruthy();
  });

  it("updates an existing bundle on conflict", () => {
    upsertTaskEvidenceBundle(db, {
      id: "bundle-2",
      taskId: "task-update",
      status: "open",
      actions: ["first"],
    });

    const updated = upsertTaskEvidenceBundle(db, {
      id: "bundle-2",
      taskId: "task-update",
      status: "verified",
      actions: ["second"],
      replayHandle: "replay://1",
      rollbackHandle: "rollback://1",
      orchestrationRunId: "orch-1",
      orchestrationPlanHash: "plan-hash",
      orchestrationBundleHash: "bundle-hash",
    });

    expect(updated.status).toBe("verified");
    expect(updated.actions).toEqual(["second"]);
    expect(updated.replayHandle).toBe("replay://1");
    expect(updated.rollbackHandle).toBe("rollback://1");
    expect(updated.orchestrationRunId).toBe("orch-1");
    expect(updated.orchestrationPlanHash).toBe("plan-hash");
    expect(updated.orchestrationBundleHash).toBe("bundle-hash");
  });

  it("returns null for missing bundles and lists by task id with clamped limit", () => {
    expect(getTaskEvidenceBundle(db, "missing")).toBeNull();

    upsertTaskEvidenceBundle(db, { id: "b1", taskId: "task-list" });
    upsertTaskEvidenceBundle(db, { id: "b2", taskId: "task-list" });
    upsertTaskEvidenceBundle(db, { id: "b3", taskId: "other-task" });

    expect(listTaskEvidenceBundles(db, "task-list", 0)).toHaveLength(1);
    expect(listTaskEvidenceBundles(db, "task-list", 500)).toHaveLength(2);
    expect(listTaskEvidenceBundles(db, "task-list")).toHaveLength(2);
  });

  it("maps invalid stored json lists safely", () => {
    upsertTaskEvidenceBundle(db, {
      id: "bundle-parse",
      taskId: "task-parse",
      status: "verified",
    });

    db.prepare(
      `UPDATE task_evidence_bundles
       SET plan_json = ?, context_json = ?, assumptions_json = ?
       WHERE id = ?`
    ).run("not-json", '{"not":"array"}', "[]", "bundle-parse");

    const bundle = getTaskEvidenceBundle(db, "bundle-parse");
    expect(bundle?.plan).toEqual([]);
    expect(bundle?.context).toEqual([]);
    expect(bundle?.assumptions).toEqual([]);
    expect(bundle?.status).toBe("verified");
  });

  it("parses verified, failed, and superseded statuses from storage", () => {
    for (const status of ["verified", "failed", "superseded"] as const) {
      const id = `bundle-${status}`;
      upsertTaskEvidenceBundle(db, { id, taskId: "task-status", status });
      expect(getTaskEvidenceBundle(db, id)?.status).toBe(status);
    }
  });

  it("getOutboundFilteredBundle returns null when bundle is missing", () => {
    expect(getOutboundFilteredBundle(db, "missing")).toBeNull();
  });

  it("getOutboundFilteredBundle applies outbound policy to object memories and sources", () => {
    const bundle = upsertTaskEvidenceBundle(db, {
      id: "bundle-outbound",
      taskId: "task-outbound",
      memories: [
        { beliefStage: "gold_operational_truth", content: "gold memory" },
        { id: "legacy", content: "legacy memory without stage" },
      ],
      sources: [
        { beliefStage: "bronze_raw_source", content: "bronze source" },
        { beliefStage: "gold_operational_truth", content: "gold source" },
      ],
    });

    const result = getOutboundFilteredBundle(db, bundle.id, {
      policy: DEFAULT_OUTBOUND_POLICY,
      citationMode: true,
    });

    expect(result).not.toBeNull();
    expect(result!.bundle.id).toBe("bundle-outbound");
    expect(result!.telemetry.emittedMemories).toHaveLength(2);
    expect(result!.telemetry.emittedSources).toHaveLength(2);
    expect(result!.telemetry.receipts.length).toBeGreaterThan(0);
  });

  it("getOutboundFilteredBundle drops bronze sources without citation mode", () => {
    const bundle = upsertTaskEvidenceBundle(db, {
      id: "bundle-no-citation",
      taskId: "task-outbound-2",
      sources: [{ beliefStage: "bronze_raw_source", content: "bronze only" }],
    });

    const result = getOutboundFilteredBundle(db, bundle.id, {
      policy: DEFAULT_OUTBOUND_POLICY,
      citationMode: false,
    });

    expect(result!.telemetry.emittedSources).toHaveLength(0);
    expect(result!.telemetry.receipts.some((r) => r.action === "dropped")).toBe(true);
  });
});

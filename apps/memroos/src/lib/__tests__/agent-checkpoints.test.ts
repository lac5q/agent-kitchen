// @vitest-environment node
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createAgentCheckpoint,
  getCheckpointMetrics,
  resumeFromCheckpoint,
  verifyCheckpointAuditChain,
} from "@/lib/agent-checkpoints";
import { initSchema } from "@/lib/db-schema";
import { recordEfficiencyEvent } from "@/lib/efficiency-telemetry";

let db: Database.Database;

describe("agent lightweight checkpoint/resume", () => {
  beforeEach(() => {
    db = new Database(":memory:");
    initSchema(db);
  });

  afterEach(() => {
    db.close();
  });

  it("creates an agent checkpoint and resumes from it", () => {
    const runId = "test-run-1";
    const checkpoint = createAgentCheckpoint(db, {
      runId,
      ownerAgentId: "codex",
      objective: "Implement lightweight checkpoints",
      completedSteps: ["Create tables", "Create TS library"],
      remainingSteps: ["Create API routes", "Write unit tests"],
      decisions: { pragma: "journal_mode=WAL" },
      nextSafeAction: "Run tests",
      rollbackNotes: "Delete the library files if database insertion fails",
    });

    expect(checkpoint.id).toBeTruthy();
    expect(checkpoint.checkpointSize).toBeGreaterThan(0);
    expect(checkpoint.writeLatencyMs).toBeLessThan(100); // Should be very fast

    const resumed = resumeFromCheckpoint(db, "default-tenant", runId);
    expect(resumed).not.toBeNull();
    expect(resumed?.ownerAgentId).toBe("codex");
    expect(resumed?.objective).toBe("Implement lightweight checkpoints");
    expect(resumed?.completedSteps).toEqual(["Create tables", "Create TS library"]);
    expect(resumed?.decisions).toEqual({ pragma: "journal_mode=WAL" });
  });

  it("handles duplicate checkpoints to avoid redundant work and exports metrics", () => {
    const runId = "test-run-2";
    const input = {
      runId,
      ownerAgentId: "claude-code",
      objective: "Write checklist",
      nextSafeAction: "Create test file",
    };

    const first = createAgentCheckpoint(db, input);
    const second = createAgentCheckpoint(db, input);

    expect(first.id).not.toEqual(second.id);

    const metrics = getCheckpointMetrics(db, "default-tenant");
    expect(metrics.duplicateWorkAvoided).toBe(1);
    expect(metrics.avgWriteLatencyMs).toBeGreaterThan(0);
    expect(metrics.avgCheckpointSize).toBeGreaterThan(0);
  });

  it("writes a checkpoint audit entry with verified boundary provenance receipts", () => {
    const runId = "test-run-provenance";

    recordEfficiencyEvent(db, {
      eventType: "source_read",
      taskId: runId,
      agentId: "codex",
      payload: {
        sourceId: "README.md",
        sourceHash: "sha256:readme",
        toolId: "read_file",
      },
      createdAt: "2026-07-02T08:00:00.000Z",
    });
    recordEfficiencyEvent(db, {
      eventType: "memory_write",
      taskId: runId,
      agentId: "codex",
      payload: {
        source: "agent_memory",
        dedupHash: "sha256:memory",
        firstSeenAt: "2026-07-02T07:59:00.000Z",
        isRediscovery: false,
      },
      createdAt: "2026-07-02T08:01:00.000Z",
    });

    const checkpoint = createAgentCheckpoint(db, {
      runId,
      ownerAgentId: "codex",
      objective: "Capture verified provenance",
      nextSafeAction: "Resume from checkpoint",
      provenancePointers: ["agent-supplied-pointer"],
    });

    expect(checkpoint.provenanceAudit).toMatchObject({
      provenanceReceiptCount: 2,
      previousEntryHash: null,
    });
    expect(checkpoint.provenanceAudit?.checkpointHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(checkpoint.provenanceAudit?.entryHash).toMatch(/^sha256:[a-f0-9]{64}$/);

    const row = db
      .prepare("SELECT * FROM audit_entries WHERE event_type = 'agent.checkpointed' AND entity_id = ?")
      .get(`agent_checkpoint:${checkpoint.id}`) as { metadata_json: string } | undefined;
    expect(row).toBeDefined();

    const metadata = JSON.parse(row!.metadata_json) as {
      provenanceReceipts: Array<{ kind: string; sourceId: string; sourceHash: string }>;
      legacyPointerCount: number;
    };
    expect(metadata.legacyPointerCount).toBe(1);
    expect(metadata.provenanceReceipts).toHaveLength(2);
    expect(metadata.provenanceReceipts.map((receipt) => receipt.kind).sort()).toEqual([
      "memory_write",
      "source_read",
    ]);
    expect(JSON.stringify(metadata.provenanceReceipts)).not.toContain("agent-supplied-pointer");

    const resumed = resumeFromCheckpoint(db, "default-tenant", runId);
    expect(resumed?.provenanceAudit?.entryHash).toBe(checkpoint.provenanceAudit?.entryHash);

    expect(verifyCheckpointAuditChain(db, "default-tenant")).toMatchObject({
      valid: true,
      checked: 1,
    });
  });

  it("rolls back the checkpoint insert when the transactional audit write fails", () => {
    db.exec("DROP TABLE audit_entries");

    expect(() =>
      createAgentCheckpoint(db, {
        runId: "test-run-rollback",
        ownerAgentId: "codex",
        objective: "Prove checkpoint audit atomicity",
        nextSafeAction: "Retry after schema repair",
      })
    ).toThrow(/audit_entries/);

    expect(db.prepare("SELECT COUNT(*) AS count FROM agent_checkpoints").get()).toEqual({
      count: 0,
    });
  });

  it("detects a broken checkpoint audit chain row", () => {
    createAgentCheckpoint(db, {
      runId: "test-run-chain",
      ownerAgentId: "codex",
      objective: "Create a valid checkpoint audit row",
      nextSafeAction: "Insert forged audit row",
    });

    db.prepare(
      `INSERT INTO audit_entries
        (id, tenant_id, actor_id, actor_role, event_type, entity_type, entity_id, reason, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "forged-checkpoint-audit",
      "default-tenant",
      "codex",
      "system",
      "agent.checkpointed",
      "agent_checkpoint",
      "agent_checkpoint:forged",
      "forged checkpoint audit row",
      JSON.stringify({
        schemaVersion: 1,
        checkpointId: "forged",
        runId: "test-run-chain",
        checkpointHash: "sha256:forged",
        previousEntryHash: "sha256:not-the-prior-row",
        provenanceReceipts: [],
        legacyPointerCount: 0,
        entryHash: "sha256:not-a-real-entry-hash",
      }),
      "2026-07-02T08:02:00.000Z"
    );

    expect(verifyCheckpointAuditChain(db, "default-tenant")).toMatchObject({
      valid: false,
      checked: 2,
      firstBrokenEntryId: "forged-checkpoint-audit",
    });
  });
});

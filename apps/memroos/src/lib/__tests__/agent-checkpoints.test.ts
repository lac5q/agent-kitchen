// @vitest-environment node
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createAgentCheckpoint, resumeFromCheckpoint, getCheckpointMetrics } from "@/lib/agent-checkpoints";
import { initSchema } from "@/lib/db-schema";

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
});

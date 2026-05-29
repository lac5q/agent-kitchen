// @vitest-environment node
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { recordMemoryTrace, getMemoryTrace, getMemoryTraceTimeline } from "@/lib/memory-trace-observability";
import { initSchema } from "@/lib/db-schema";

let db: Database.Database;

describe("memory-trace observability", () => {
  beforeEach(() => {
    db = new Database(":memory:");
    initSchema(db);
  });

  afterEach(() => {
    db.close();
  });

  it("logs a memory-backed run trace and retrieves the causal path timeline", () => {
    const runId = "run-trace-1";
    const trace = recordMemoryTrace(db, {
      runId,
      taskId: "task-trace-1",
      causalPath: {
        contextAssembly: "Assembled project wiki & vector memories.",
        retrievalQuery: "How does A2A routing work?",
        retrievedCandidates: [
          { id: "cand-1", content: "A2A uses the agent-card registration", score: 0.95 },
          { id: "cand-2", content: "Outbound API credentials require env-keys", score: 0.8 },
        ],
        policyFilters: [
          { id: "cand-1", decision: "allow", reason: "Cleared for engineering role" },
          { id: "cand-2", decision: "redact", reason: "Contains simulated API credentials" },
        ],
        consolidationSteps: ["Insights merged into episodic layer."],
        checkpointRefs: ["checkpoint-10023"],
        promptInclusion: true,
        answerCitation: "A2A routing uses registration details.",
        verificationResult: "Verification successful: accurate A2A citation.",
      },
      failureClassification: "policy_redaction",
      rootCause: "Credential fields were redacted per security boundary rules.",
      replayHandle: "replay-handle-uuid",
      proposedRepair: "Provide developer role authorization or override policy.",
    });

    expect(trace.id).toBeTruthy();
    expect(trace.failureClassification).toBe("policy_redaction");

    const retrieved = getMemoryTrace(db, "default-tenant", runId);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.taskId).toBe("task-trace-1");
    expect(retrieved?.failureClassification).toBe("policy_redaction");
    expect(retrieved?.causalPath.retrievedCandidates).toHaveLength(2);

    const timeline = getMemoryTraceTimeline(retrieved!);
    expect(timeline).toContain("[Context Assembly] Assembled project wiki & vector memories.");
    expect(timeline).toContain('[Retrieval Query] "How does A2A routing work?"');
    expect(timeline).toContain("[Retrieved Candidates] Fetched 2 potential memories.");
    expect(timeline).toContain("[Policy Decision] Memory cand-1: ALLOW (Cleared for engineering role)");
    expect(timeline).toContain("[Policy Decision] Memory cand-2: REDACT (Contains simulated API credentials)");
    expect(timeline).toContain("[Consolidation] Insights merged into episodic layer.");
    expect(timeline).toContain("[Checkpoints] References rehydrated: checkpoint-10023");
    expect(timeline).toContain("[Prompt Inclusion] Context was successfully inlined in prompt.");
    expect(timeline).toContain('[Answer Citation] Inlined citation: "A2A routing uses registration details."');
    expect(timeline).toContain("[Verification] Verification successful: accurate A2A citation.");
  });
});

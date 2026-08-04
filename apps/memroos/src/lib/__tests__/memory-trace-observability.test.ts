// @vitest-environment node
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { recordMemoryTrace, getMemoryTrace, getMemoryTraceTimeline } from "@/lib/memory/trace-observability";
import { initSchema } from "@/lib/db-schema";
import { listEfficiencyEvents } from "@/lib/efficiency-telemetry";

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
      agentId: "codex",
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
        retrievalTokensUsed: 128,
        timingGate: "before_plan",
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
    expect(retrieved?.agentId).toBe("codex");
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

    const efficiencyEvents = listEfficiencyEvents(db, {
      eventType: "retrieval_trace",
      taskId: "task-trace-1",
    });
    expect(efficiencyEvents).toHaveLength(1);
    expect(efficiencyEvents[0]).toMatchObject({
      tenantId: "default-tenant",
      taskId: "task-trace-1",
      agentId: "codex",
      createdAt: trace.createdAt,
      eventType: "retrieval_trace",
      payload: {
        query: "How does A2A routing work?",
        sources: ["cand-1", "cand-2"],
        tokensUsed: 128,
        usedInFirstResponse: true,
        timingGate: "before_plan",
      },
    });
  });

  it("records a retrieval trace event as unused when no candidates enter the prompt", () => {
    recordMemoryTrace(db, {
      runId: "run-trace-empty",
      taskId: "task-trace-empty",
      causalPath: {
        contextAssembly: "No memory context assembled.",
        retrievalQuery: "unknown topic",
        retrievedCandidates: [],
        policyFilters: [],
        promptInclusion: false,
      },
    });

    const efficiencyEvents = listEfficiencyEvents(db, {
      eventType: "retrieval_trace",
      taskId: "task-trace-empty",
    });

    expect(efficiencyEvents).toHaveLength(1);
    expect(efficiencyEvents[0].payload).toMatchObject({
      query: "unknown topic",
      sources: [],
      tokensUsed: 0,
      usedInFirstResponse: false,
      timingGate: "before_plan",
    });
  });

  it("persists recollection skip receipts into trace and efficiency telemetry", () => {
    recordMemoryTrace(db, {
      runId: "run-recollect-skip",
      taskId: "task-recollect-skip",
      agentId: "codex",
      causalPath: {
        contextAssembly: "Recollection skipped before runtime context assembly.",
        retrievalQuery: "format this list",
        retrievedCandidates: [],
        policyFilters: [],
        retrievalTokensUsed: 0,
        timingGate: "before_plan",
        promptInclusion: false,
        recollection: {
          decision: "search_skipped",
          timing: "before_plan",
          reasons: ["low_memory_need", "no_stable_entities"],
          skipReason: "Task is local or mechanical with no stable recall dependency.",
          injected: [],
          ignored: [],
        },
      },
    });

    const trace = getMemoryTrace(db, "default-tenant", "run-recollect-skip");
    expect(trace?.causalPath.recollection).toMatchObject({
      decision: "search_skipped",
      skipReason: "Task is local or mechanical with no stable recall dependency.",
    });

    const timeline = getMemoryTraceTimeline(trace!);
    expect(timeline).toContain("[Recollection Decision] SEARCH_SKIPPED before_plan (low_memory_need, no_stable_entities)");
    expect(timeline).toContain("[Recollection Skip] Task is local or mechanical with no stable recall dependency.");

    const efficiencyEvents = listEfficiencyEvents(db, {
      eventType: "retrieval_trace",
      taskId: "task-recollect-skip",
    });
    expect(efficiencyEvents[0].payload).toMatchObject({
      recollectionDecision: "search_skipped",
      recollectionReasons: ["low_memory_need", "no_stable_entities"],
      recollectionSkipReason: "Task is local or mechanical with no stable recall dependency.",
      recollectionInjected: [],
      recollectionIgnored: [],
      beliefStageCounts: {
        bronze_raw_source: 0,
        silver_candidate_claim: 0,
        gold_operational_truth: 0,
      },
    });
  });

  it("emits recollection belief-stage counts without copying memory content into efficiency payloads", () => {
    recordMemoryTrace(db, {
      runId: "run-recollect-required",
      taskId: "task-recollect-required",
      agentId: "codex",
      causalPath: {
        contextAssembly: "Recollection context pack assembled.",
        retrievalQuery: "Cordant follow-up owner check",
        retrievedCandidates: [
          { id: "cand-gold", content: "Gold operational memory", score: 0.91 },
          { id: "cand-silver", content: "Silver candidate memory", score: 0.82 },
        ],
        policyFilters: [
          { id: "cand-gold", decision: "allow", reason: "gold operational truth" },
          { id: "cand-silver", decision: "allow", reason: "silver caveated claim" },
        ],
        retrievalTokensUsed: 96,
        timingGate: "before_plan",
        promptInclusion: true,
        recollection: {
          decision: "search_required",
          timing: "before_plan",
          reasons: ["task_has_project_ref", "task_has_stable_entities"],
          skipReason: null,
          injected: [
            {
              id: "cand-gold",
              tier: "episodic",
              beliefStage: "gold_operational_truth",
              reliance: "direct_truth",
              score: 0.91,
            },
            {
              id: "cand-silver",
              tier: "vector",
              beliefStage: "silver_candidate_claim",
              reliance: "caveated_claim",
              score: 0.82,
            },
          ],
          ignored: [
            {
              id: "cand-denied",
              reason: "policy_denied",
              score: 0.7,
            },
          ],
        },
      },
    });

    const efficiencyEvents = listEfficiencyEvents(db, {
      eventType: "retrieval_trace",
      taskId: "task-recollect-required",
    });
    const payload = efficiencyEvents[0].payload;

    expect(payload).toMatchObject({
      recollectionDecision: "search_required",
      recollectionReasons: ["task_has_project_ref", "task_has_stable_entities"],
      recollectionInjected: [
        {
          id: "cand-gold",
          tier: "episodic",
          beliefStage: "gold_operational_truth",
          reliance: "direct_truth",
          score: 0.91,
        },
        {
          id: "cand-silver",
          tier: "vector",
          beliefStage: "silver_candidate_claim",
          reliance: "caveated_claim",
          score: 0.82,
        },
      ],
      recollectionIgnored: [
        {
          id: "cand-denied",
          reason: "policy_denied",
          score: 0.7,
        },
      ],
      beliefStageCounts: {
        bronze_raw_source: 0,
        silver_candidate_claim: 1,
        gold_operational_truth: 1,
      },
    });
    expect(JSON.stringify(payload)).not.toContain("Gold operational memory");
    expect(JSON.stringify(payload)).not.toContain("Silver candidate memory");
  });

  it("emits exactly one retrieval_trace for each served and skipped probe", () => {
    recordMemoryTrace(db, {
      runId: "run-probe-served",
      taskId: "task-probe-served",
      agentId: "agent-prior-work",
      causalPath: {
        contextAssembly: "prior_work_probe",
        retrievalQuery: "onboarding rate limit",
        retrievedCandidates: [{ id: "vector:memory-1", content: "", score: 0.91 }],
        policyFilters: [{ id: "vector:memory-1", decision: "allow", reason: "threshold_and_policy_allowed" }],
        timingGate: "before_plan",
        promptInclusion: false,
        recollection: {
          decision: "search_required",
          timing: "before_plan",
          reasons: ["task_has_project_ref"],
          skipReason: null,
          injected: [{
            id: "vector:memory-1",
            tier: "vector",
            beliefStage: "gold_operational_truth",
            reliance: "direct_truth",
            score: 0.91,
          }],
          ignored: [],
          tiersSearched: ["episodic", "vector", "graph"],
          tierStatuses: { vector: { status: "ok", count: 1 } },
          truncated: false,
        },
      },
    });
    recordMemoryTrace(db, {
      runId: "run-probe-skipped",
      taskId: "task-probe-skipped",
      agentId: "agent-prior-work",
      causalPath: {
        contextAssembly: "prior_work_probe",
        retrievalQuery: "format this JSON",
        retrievedCandidates: [],
        policyFilters: [],
        timingGate: "before_tool",
        promptInclusion: false,
        recollection: {
          decision: "search_skipped",
          timing: "before_tool_use",
          reasons: ["low_memory_need", "no_stable_entities"],
          skipReason: "low_signal",
          injected: [],
          ignored: [],
          tiersSearched: [],
          tierStatuses: {},
          reasonCode: "low_signal",
        },
      },
    });

    expect(listEfficiencyEvents(db, { eventType: "retrieval_trace", taskId: "task-probe-served" })).toHaveLength(1);
    expect(listEfficiencyEvents(db, { eventType: "retrieval_trace", taskId: "task-probe-skipped" })).toHaveLength(1);
    expect(listEfficiencyEvents(db, { eventType: "retrieval_trace", taskId: "task-probe-served" })[0].payload).toMatchObject({
      recollectionDecision: "search_required",
      recollectionTiersSearched: ["episodic", "vector", "graph"],
      recollectionReceipt: { decision: "search_required" },
    });
    expect(listEfficiencyEvents(db, { eventType: "retrieval_trace", taskId: "task-probe-skipped" })[0].payload).toMatchObject({
      recollectionDecision: "search_skipped",
      recollectionReasonCode: "low_signal",
      recollectionReceipt: { decision: "search_skipped" },
    });
  });
});

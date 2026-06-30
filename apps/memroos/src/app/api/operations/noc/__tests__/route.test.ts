// @vitest-environment node
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_DIR = path.join(os.tmpdir(), `operations-noc-${crypto.randomUUID()}`);
const TEST_DB_PATH = path.join(TEST_DIR, "noc.db");

async function loadRoute() {
  process.env.SQLITE_DB_PATH = TEST_DB_PATH;
  vi.resetModules();
  const route = await import("../route");
  const dbModule = await import("@/lib/db");
  const telemetry = await import("@/lib/efficiency-telemetry");
  return { ...route, ...dbModule, ...telemetry };
}

describe("GET /api/operations/noc efficiency metrics", () => {
  beforeEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    const { closeDb } = await loadRoute();
    closeDb();
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
    delete process.env.SQLITE_DB_PATH;
    vi.resetModules();
  });

  it("aggregates live efficiency metrics from all instrumented event streams", async () => {
    const { GET, getDb, recordEfficiencyEvent } = await loadRoute();
    const db = getDb();
    const createdAt = new Date().toISOString();

    recordEfficiencyEvent(db, {
      eventType: "retrieval_trace",
      taskId: "task-live",
      agentId: "codex",
      createdAt,
      payload: {
        query: "roadmap",
        sources: ["a"],
        tokensUsed: 120,
        usedInFirstResponse: true,
        timingGate: "before_tool",
        recollectionDecision: "search_required",
        recollectionReasons: ["task_has_project_ref", "task_has_stable_entities"],
        recollectionTiming: "before_plan",
        recollectionInjected: [
          {
            id: "mem-gold",
            tier: "episodic",
            beliefStage: "gold_operational_truth",
            reliance: "direct_truth",
            score: 0.91,
          },
          {
            id: "mem-silver",
            tier: "vector",
            beliefStage: "silver_candidate_claim",
            reliance: "caveated_claim",
            score: 0.82,
          },
        ],
        recollectionIgnored: [
          {
            id: "mem-denied",
            reason: "policy_denied",
            score: 0.72,
          },
        ],
        beliefStageCounts: {
          bronze_raw_source: 0,
          silver_candidate_claim: 1,
          gold_operational_truth: 1,
        },
      },
    });
    recordEfficiencyEvent(db, {
      eventType: "retrieval_trace",
      taskId: "task-live",
      agentId: "codex",
      createdAt,
      payload: {
        query: "roadmap",
        sources: ["b"],
        tokensUsed: 60,
        usedInFirstResponse: false,
        timingGate: "before_final",
        recollectionDecision: "search_skipped",
        recollectionReasons: ["low_memory_need", "no_stable_entities"],
        recollectionSkipReason: "Task is local or mechanical with no stable recall dependency.",
        recollectionTiming: "before_plan",
        recollectionInjected: [],
        recollectionIgnored: [],
        beliefStageCounts: {
          bronze_raw_source: 0,
          silver_candidate_claim: 0,
          gold_operational_truth: 0,
        },
      },
    });
    recordEfficiencyEvent(db, {
      eventType: "source_read",
      taskId: "task-live",
      agentId: "codex",
      createdAt,
      payload: { sourceId: "a", sourceHash: "hash-a", toolId: "read" },
    });
    recordEfficiencyEvent(db, {
      eventType: "source_read",
      taskId: "task-live",
      agentId: "codex",
      createdAt,
      payload: { sourceId: "a-copy", sourceHash: "hash-a", toolId: "read" },
    });
    recordEfficiencyEvent(db, {
      eventType: "token_ledger",
      taskId: "task-live",
      agentId: "codex",
      createdAt,
      payload: { rawContextTokens: 30, cachedTokens: 10, totalTokens: 100, modelId: "gpt-test" },
    });
    recordEfficiencyEvent(db, {
      eventType: "operator_question",
      taskId: "task-live",
      agentId: "codex",
      createdAt,
      payload: { questionText: "Where is the roadmap?", memoryHits: ["roadmap"], priorAnswerMatch: true },
    });
    recordEfficiencyEvent(db, {
      eventType: "operator_question",
      taskId: "task-live",
      agentId: "codex",
      createdAt,
      payload: { questionText: "What changed?", memoryHits: [], priorAnswerMatch: false },
    });
    recordEfficiencyEvent(db, {
      eventType: "memory_write",
      taskId: "task-live",
      agentId: "codex",
      createdAt,
      payload: { source: "memory", firstSeenAt: createdAt, dedupHash: "a", isRediscovery: true },
    });
    recordEfficiencyEvent(db, {
      eventType: "memory_write",
      taskId: "task-live",
      agentId: "codex",
      createdAt,
      payload: { source: "memory", firstSeenAt: createdAt, dedupHash: "b", isRediscovery: false },
    });

    const response = await GET(new Request("http://localhost/api/operations/noc?window=24h&workspace=local"));
    const body = await response.json();

    expect(body.panels.efficiency.status).toBe("live");
    expect(body.panels.efficiency.warnings).toEqual([]);
    expect(body.metrics.efficiency.streams).toMatchObject({
      retrieval_trace: 2,
      source_read: 2,
      token_ledger: 1,
      operator_question: 2,
      memory_write: 2,
    });
    expect(body.metrics.efficiency.retrievalBeforeWorkRate).toBeCloseTo(0.5);
    expect(body.metrics.efficiency.repeatedSourceReads).toBe(1);
    expect(body.metrics.efficiency.rawContextTokenShare).toBeCloseTo(0.3);
    expect(body.metrics.efficiency.operatorReaskRate).toBeCloseTo(0.5);
    expect(body.metrics.efficiency.rediscoveredFactRate).toBeCloseTo(0.5);
    expect(body.metrics.efficiency.recollection).toMatchObject({
      totalDecisions: 2,
      searchRequired: 1,
      searchSkipped: 1,
      injectedMemories: 2,
      ignoredCandidates: 1,
      policyDeniedCandidates: 1,
      belowThresholdCandidates: 0,
      beliefStageCounts: {
        bronze_raw_source: 0,
        silver_candidate_claim: 1,
        gold_operational_truth: 1,
      },
      relianceCounts: {
        direct_truth: 1,
        caveated_claim: 1,
        source_evidence_only: 0,
      },
      skipReasons: {
        "Task is local or mechanical with no stable recall dependency.": 1,
      },
    });
    expect(body.metrics.efficiency.recollection.latestDecisions[0]).toMatchObject({
      taskId: "task-live",
      agentId: "codex",
      decision: "search_skipped",
      timing: "before_plan",
      skipReason: "Task is local or mechanical with no stable recall dependency.",
    });
  });

  it("reports degraded efficiency when one or more streams are absent", async () => {
    const { GET, getDb, recordEfficiencyEvent } = await loadRoute();
    recordEfficiencyEvent(getDb(), {
      eventType: "retrieval_trace",
      taskId: "task-partial",
      agentId: "remote-agent",
      createdAt: new Date().toISOString(),
      payload: {
        query: "only retrieval",
        sources: ["a"],
        tokensUsed: 20,
        usedInFirstResponse: true,
        timingGate: "before_tool",
      },
    });

    const response = await GET(new Request("http://localhost/api/operations/noc?window=24h&workspace=remote"));
    const body = await response.json();

    expect(body.panels.efficiency.status).toBe("degraded");
    expect(body.panels.efficiency.warnings).toEqual(
      expect.arrayContaining([
        "Missing source-read telemetry",
        "Missing raw-context token ledger",
        "Missing operator-question telemetry",
        "Missing memory-write telemetry",
      ])
    );
    expect(body.metrics.efficiency.streams.retrieval_trace).toBe(1);
  });

  it("reports empty efficiency when no events exist in the selected window", async () => {
    const { GET } = await loadRoute();

    const response = await GET(new Request("http://localhost/api/operations/noc?window=24h&workspace=all"));
    const body = await response.json();

    expect(body.panels.efficiency.status).toBe("empty");
    expect(body.panels.efficiency.warnings).toContain("No efficiency telemetry events in the selected window");
    expect(body.metrics.efficiency.totalEvents).toBe(0);
  });

  it("surfaces the memory iteration repair loop inside the NOC response", async () => {
    const { GET, getDb } = await loadRoute();
    const db = getDb();
    const timestamp = new Date().toISOString();

    db.prepare(
      `INSERT INTO messages(session_id, project, agent_id, role, content, timestamp, visibility, policy, request_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "platform:discord:guild:channel",
      "platform:discord",
      "discord:user",
      "user",
      "Discord memory should be iteratively repaired.",
      timestamp,
      "internal",
      "indexable",
      "discord-test-message"
    );

    const response = await GET(new Request("http://localhost/api/operations/noc?window=24h&workspace=all"));
    const body = await response.json();

    expect(body.panels.memoryIteration.status).toBe("degraded");
    expect(body.memoryIteration.status).toBe("needs_repair");
    expect(body.memoryIteration.observe.embeddingBacklog).toBeGreaterThanOrEqual(1);
    expect(body.memoryIteration.observe.discordMissingFts).toBe(0);
    expect(body.memoryIteration.repair).toMatchObject({
      batchPolicy: "bounded batches with verification after every cycle",
      ownership: "product-owned NOC and memory health surfaces, not external cron-only state",
    });
    expect(body.memoryIteration.repair.nextAction).toContain("in-product embedding backfill worker");
    expect(body.memoryIteration.verify.requiredChecks).toEqual(
      expect.arrayContaining([
        "Discord messages mirrored into messages and messages_fts",
        "message_embeddings backlog reaches zero for indexable rows",
      ])
    );
    expect(body.memoryIteration.storage.cloudOffloadCandidates).toEqual(expect.any(Array));
    expect(body.metrics.memoryIteration.observe.embeddingBacklog).toBe(body.memoryIteration.observe.embeddingBacklog);
  });
});

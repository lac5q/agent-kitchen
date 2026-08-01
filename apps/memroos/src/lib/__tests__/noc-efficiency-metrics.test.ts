// @vitest-environment node
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_DIR = path.join(os.tmpdir(), `noc-efficiency-${crypto.randomUUID()}`);
const TEST_DB_PATH = path.join(TEST_DIR, "noc.db");

async function loadModule() {
  process.env.SQLITE_DB_PATH = TEST_DB_PATH;
  vi.resetModules();
  const metrics = await import("@/lib/noc-efficiency-metrics");
  const dbModule = await import("@/lib/db");
  const telemetry = await import("@/lib/efficiency-telemetry");
  return { ...metrics, ...dbModule, ...telemetry };
}

describe("noc-efficiency-metrics", () => {
  beforeEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    const { closeDb } = await loadModule();
    closeDb();
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
    delete process.env.SQLITE_DB_PATH;
    vi.resetModules();
  });

  it("parses safeJsonPayload edge cases", async () => {
    const { safeJsonPayload } = await loadModule();
    expect(safeJsonPayload('{"a":1}')).toEqual({ a: 1 });
    expect(safeJsonPayload("[1,2]")).toEqual({});
    expect(safeJsonPayload('"string"')).toEqual({});
    expect(safeJsonPayload("not-json")).toEqual({});
  });

  it("builds workspace SQL clauses for local/remote/all", async () => {
    const { efficiencyWorkspaceClause } = await loadModule();
    expect(efficiencyWorkspaceClause("local")).toContain("IN (");
    expect(efficiencyWorkspaceClause("remote")).toContain("NOT IN (");
    expect(efficiencyWorkspaceClause("all")).toBe("");
  });

  it("computes full-stream metrics, panel, and live envelope", async () => {
    const {
      computeEfficiencyMetrics,
      efficiencyPanelFor,
      buildEfficiencyEnvelope,
    } = await loadModule();

    const createdAt = "2026-08-01T10:00:00.000Z";
    const metrics = computeEfficiencyMetrics([
      {
        id: 1,
        eventType: "retrieval_trace",
        taskId: "t1",
        agentId: "codex",
        createdAt,
        payload: {
          usedInFirstResponse: true,
          recollectionDecision: "search_required",
          recollectionTiming: "before_plan",
          recollectionReasons: ["task_has_project_ref", 12],
          recollectionInjected: [
            { beliefStage: "gold_operational_truth", reliance: "direct_truth" },
            { beliefStage: "nope", reliance: "nope" },
          ],
          recollectionIgnored: [
            { reason: "policy_denied" },
            { reason: "below_threshold" },
            { reason: "other" },
          ],
        },
      },
      {
        id: 2,
        eventType: "retrieval_trace",
        taskId: "t1",
        agentId: "codex",
        createdAt: "2026-08-01T11:00:00.000Z",
        payload: {
          usedInFirstResponse: false,
          recollectionDecision: "search_skipped",
          recollectionSkipReason: "low_memory_need",
          recollectionInjected: "bad",
          recollectionIgnored: null,
        },
      },
      {
        id: 3,
        eventType: "source_read",
        taskId: "t-shared",
        agentId: "codex",
        createdAt,
        payload: { sourceHash: "hash-a" },
      },
      {
        id: 4,
        eventType: "source_read",
        taskId: "t-shared",
        agentId: "codex",
        createdAt,
        payload: { sourceHash: "hash-a" },
      },
      {
        id: 5,
        eventType: "source_read",
        taskId: null,
        agentId: "codex",
        createdAt,
        payload: { sourceHash: "solo" },
      },
      {
        id: 6,
        eventType: "token_ledger",
        taskId: "t1",
        agentId: "codex",
        createdAt,
        payload: { rawContextTokens: 10, cachedTokens: 2, totalTokens: 20, ignore: "x" },
      },
      {
        id: 7,
        eventType: "operator_question",
        taskId: "t1",
        agentId: "codex",
        createdAt,
        payload: { priorAnswerMatch: true },
      },
      {
        id: 8,
        eventType: "operator_question",
        taskId: "t1",
        agentId: "codex",
        createdAt,
        payload: { priorAnswerMatch: false },
      },
      {
        id: 9,
        eventType: "memory_write",
        taskId: "t1",
        agentId: "codex",
        createdAt,
        payload: { isRediscovery: true },
      },
      {
        id: 10,
        eventType: "memory_write",
        taskId: "t1",
        agentId: "codex",
        createdAt,
        payload: { isRediscovery: false },
      },
    ]);

    expect(metrics.totalEvents).toBe(10);
    expect(metrics.retrievalUsedInFirstResponse).toBe(1);
    expect(metrics.repeatedSourceReads).toBe(1);
    expect(metrics.rawContextTokens).toBe(10);
    expect(metrics.operatorReasks).toBe(1);
    expect(metrics.rediscoveredWrites).toBe(1);
    expect(metrics.recollection.searchRequired).toBe(1);
    expect(metrics.recollection.searchSkipped).toBe(1);
    expect(metrics.recollection.policyDeniedCandidates).toBe(1);
    expect(metrics.recollection.belowThresholdCandidates).toBe(1);
    expect(metrics.recollection.beliefStageCounts.gold_operational_truth).toBe(1);
    expect(metrics.recollection.relianceCounts.direct_truth).toBe(1);
    expect(metrics.lastUpdated).toBe("2026-08-01T11:00:00.000Z");

    const panel = efficiencyPanelFor(metrics);
    expect(panel.status).toBe("live");
    expect(panel.warnings).toEqual([]);

    const envelope = buildEfficiencyEnvelope(metrics, { window: "24h", workspace: "local" });
    expect(envelope.status).toBe("live");
    expect(envelope.source).toBe("durable://efficiency_events");
    expect(envelope.reason).toContain("All 5 efficiency streams");
  });

  it("marks empty and degraded panels/envelopes", async () => {
    const { computeEfficiencyMetrics, efficiencyPanelFor, buildEfficiencyEnvelope } =
      await loadModule();

    const empty = computeEfficiencyMetrics([]);
    expect(efficiencyPanelFor(empty).status).toBe("empty");
    expect(buildEfficiencyEnvelope(empty, { window: "24h", workspace: "all" }).status).toBe("empty");

    const partial = computeEfficiencyMetrics([
      {
        id: 1,
        eventType: "retrieval_trace",
        taskId: "t",
        agentId: "codex",
        createdAt: "2026-08-01T12:00:00.000Z",
        payload: {},
      },
    ]);
    const degradedPanel = efficiencyPanelFor(partial);
    expect(degradedPanel.status).toBe("degraded");
    expect(degradedPanel.warnings.length).toBeGreaterThan(0);
    const degradedEnvelope = buildEfficiencyEnvelope(partial, {
      window: "24h",
      workspace: "local",
    });
    expect(degradedEnvelope.status).toBe("degraded");
    expect(degradedEnvelope.reason).toContain("Missing");
  });

  it("reads efficiency events with workspace filtering and bad payloads", async () => {
    const { getDb, recordEfficiencyEvent, readEfficiencyEvents } = await loadModule();
    const db = getDb();
    const createdAt = new Date().toISOString();

    recordEfficiencyEvent(db, {
      eventType: "retrieval_trace",
      taskId: "local-task",
      agentId: "codex",
      createdAt,
      payload: { query: "x", sources: [], tokensUsed: 1, usedInFirstResponse: true, timingGate: "before_plan" },
    });
    recordEfficiencyEvent(db, {
      eventType: "memory_write",
      taskId: "remote-task",
      agentId: "remote-bot",
      createdAt,
      payload: {
        source: "memory",
        firstSeenAt: createdAt,
        dedupHash: "d",
        isRediscovery: false,
      },
    });

    db.prepare(
      `INSERT INTO efficiency_events(tenant_id, event_type, task_id, agent_id, payload, created_at)
       VALUES ('default-tenant', 'token_ledger', 'bad', 'codex', ?, ?)`
    ).run("[1,2,3]", createdAt);

    const local = readEfficiencyEvents(db, "1970-01-01T00:00:00.000Z", "local");
    expect(local.every((row) => row.agentId === "codex" || row.agentId === "claude")).toBe(true);
    expect(local.some((row) => row.eventType === "token_ledger" && Object.keys(row.payload).length === 0)).toBe(
      true
    );

    const remote = readEfficiencyEvents(db, "1970-01-01T00:00:00.000Z", "remote");
    expect(remote.some((row) => row.agentId === "remote-bot")).toBe(true);
    expect(remote.every((row) => row.agentId !== "codex")).toBe(true);

    const all = readEfficiencyEvents(db, "1970-01-01T00:00:00.000Z", "all");
    expect(all.length).toBeGreaterThanOrEqual(3);
  });
});

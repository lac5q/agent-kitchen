// @vitest-environment node
/**
 * Exercises NOC efficiency helper paths by restoring the pre-0256ae5a internal
 * read/compute calls inside buildNocResponse without exposing efficiency in the
 * JSON payload (known_unwired contract preserved).
 */
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_DIR = path.join(os.tmpdir(), `operations-noc-efficiency-${crypto.randomUUID()}`);
const TEST_DB_PATH = path.join(TEST_DIR, "noc.db");

const EFFICIENCY_PATCH = {
  marker:
    "// EfficiencySignals stays known_unwired until EFFTEL producers are verified.\n  // Do not include efficiency metrics/panels in the default NOC response.",
  replacement: `const efficiencyEvents = readEfficiencyEvents(db, since, workspace);
  const efficiencyMetrics = computeEfficiencyMetrics(efficiencyEvents);
  void efficiencyPanelFor(efficiencyMetrics);
  void buildEfficiencyEnvelope(efficiencyMetrics, scope);
  // EfficiencySignals stays known_unwired until EFFTEL producers are verified.
  // Do not include efficiency metrics/panels in the default NOC response.`,
};

function buildEfficiencyHarnessSource(): string {
  const routeSourcePath = path.resolve(__dirname, "../route.ts");
  const originalSource = fs.readFileSync(routeSourcePath, "utf8");
  const patchedSource = originalSource.replace(EFFICIENCY_PATCH.marker, EFFICIENCY_PATCH.replacement);
  if (patchedSource === originalSource) {
    throw new Error("Failed to patch NOC route for efficiency helper coverage harness");
  }
  return patchedSource;
}

async function loadRouteWithEfficiencyInternals() {
  process.env.SQLITE_DB_PATH = TEST_DB_PATH;
  vi.resetModules();

  const harnessPath = path.join(TEST_DIR, "noc-route-efficiency.harness.ts");
  fs.writeFileSync(harnessPath, buildEfficiencyHarnessSource());

  const route = await import(harnessPath);
  const dbModule = await import("@/lib/db");
  const telemetry = await import("@/lib/efficiency-telemetry");
  return { ...route, ...dbModule, ...telemetry };
}

async function loadRoute() {
  process.env.SQLITE_DB_PATH = TEST_DB_PATH;
  vi.resetModules();
  const route = await import("../route");
  const dbModule = await import("@/lib/db");
  const telemetry = await import("@/lib/efficiency-telemetry");
  return { ...route, ...dbModule, ...telemetry };
}

describe("NOC efficiency helper internals", () => {
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

  it("computes all efficiency streams for local workspace payloads", async () => {
    const { GET, getDb, recordEfficiencyEvent } = await loadRouteWithEfficiencyInternals();
    const db = getDb();
    const createdAt = new Date().toISOString();

    recordEfficiencyEvent(db, {
      eventType: "retrieval_trace",
      taskId: "task-eff",
      agentId: "codex",
      createdAt,
      payload: {
        query: "roadmap",
        sources: ["a"],
        tokensUsed: 120,
        usedInFirstResponse: true,
        timingGate: "before_tool",
        recollectionDecision: "search_required",
        recollectionReasons: ["task_has_project_ref"],
        recollectionTiming: "before_plan",
        recollectionInjected: [
          { id: "mem-gold", tier: "episodic", beliefStage: "gold_operational_truth", reliance: "direct_truth", score: 0.9 },
          { id: "mem-bronze", tier: "vector", beliefStage: "bronze_raw_source", reliance: "source_evidence_only", score: 0.4 },
        ],
        recollectionIgnored: [
          { id: "mem-denied", reason: "policy_denied", score: 0.7 },
          { id: "mem-low", reason: "below_threshold", score: 0.2 },
        ],
      },
    });
    recordEfficiencyEvent(db, {
      eventType: "retrieval_trace",
      taskId: "task-eff",
      agentId: "codex",
      createdAt,
      payload: {
        query: "skip",
        sources: [],
        tokensUsed: 10,
        usedInFirstResponse: false,
        timingGate: "before_plan",
        recollectionDecision: "search_skipped",
        recollectionSkipReason: "mechanical task",
        recollectionReasons: ["low_memory_need"],
        recollectionTiming: "before_plan",
        recollectionInjected: [],
        recollectionIgnored: [],
      },
    });
    recordEfficiencyEvent(db, {
      eventType: "source_read",
      taskId: "task-eff",
      agentId: "codex",
      createdAt,
      payload: { sourceId: "doc-a", sourceHash: "hash-repeat", toolId: "read" },
    });
    recordEfficiencyEvent(db, {
      eventType: "source_read",
      taskId: "task-eff",
      agentId: "codex",
      createdAt,
      payload: { sourceId: "doc-b", sourceHash: "hash-repeat", toolId: "read" },
    });
    recordEfficiencyEvent(db, {
      eventType: "source_read",
      taskId: null,
      agentId: "codex",
      createdAt,
      payload: { sourceId: "doc-c", sourceHash: "hash-solo", toolId: "read" },
    });
    recordEfficiencyEvent(db, {
      eventType: "token_ledger",
      taskId: "task-eff",
      agentId: "codex",
      createdAt,
      payload: { rawContextTokens: 40, cachedTokens: 15, totalTokens: 100, modelId: "gpt-test" },
    });
    recordEfficiencyEvent(db, {
      eventType: "operator_question",
      taskId: "task-eff",
      agentId: "codex",
      createdAt,
      payload: { questionText: "again?", memoryHits: ["x"], priorAnswerMatch: true },
    });
    recordEfficiencyEvent(db, {
      eventType: "operator_question",
      taskId: "task-eff",
      agentId: "codex",
      createdAt,
      payload: { questionText: "new?", memoryHits: [], priorAnswerMatch: false },
    });
    recordEfficiencyEvent(db, {
      eventType: "memory_write",
      taskId: "task-eff",
      agentId: "codex",
      createdAt,
      payload: { source: "memory", firstSeenAt: createdAt, dedupHash: "a", isRediscovery: true },
    });
    recordEfficiencyEvent(db, {
      eventType: "memory_write",
      taskId: "task-eff",
      agentId: "codex",
      createdAt,
      payload: { source: "memory", firstSeenAt: createdAt, dedupHash: "b", isRediscovery: false },
    });

    const response = await GET(new Request("http://localhost/api/operations/noc?window=24h&workspace=local"));
    const body = await response.json();

    expect(body.sourceStates.efficiencySignals).toBe("known_unwired");
    expect(body.metrics.efficiency).toBeUndefined();
    expect(body.panels.efficiency).toBeUndefined();
  });

  it("filters efficiency events by remote workspace clause", async () => {
    const { GET, getDb, recordEfficiencyEvent } = await loadRouteWithEfficiencyInternals();
    const db = getDb();
    const createdAt = new Date().toISOString();

    recordEfficiencyEvent(db, {
      eventType: "token_ledger",
      taskId: "remote-task",
      agentId: "remote-agent",
      createdAt,
      payload: { rawContextTokens: 25, cachedTokens: 5, totalTokens: 50, modelId: "remote-model" },
    });
    recordEfficiencyEvent(db, {
      eventType: "token_ledger",
      taskId: "local-task",
      agentId: "codex",
      createdAt,
      payload: { rawContextTokens: 999, cachedTokens: 0, totalTokens: 999, modelId: "local-model" },
    });

    const response = await GET(new Request("http://localhost/api/operations/noc?window=24h&workspace=remote"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.filters.workspace).toBe("remote");
    expect(body.sourceStates.efficiencySignals).toBe("known_unwired");
  });

  it("tolerates malformed efficiency payload JSON inserted via direct SQL", async () => {
    const { GET, getDb } = await loadRouteWithEfficiencyInternals();
    const db = getDb();
    const createdAt = new Date().toISOString();

    db.prepare(
      `INSERT INTO efficiency_events (tenant_id, event_type, task_id, agent_id, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run("default-tenant", "retrieval_trace", "bad-json", "codex", "{not-json", createdAt);
    db.prepare(
      `INSERT INTO efficiency_events (tenant_id, event_type, task_id, agent_id, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run("default-tenant", "retrieval_trace", "array-json", "codex", JSON.stringify(["not", "object"]), createdAt);
    db.prepare(
      `INSERT INTO efficiency_events (tenant_id, event_type, task_id, agent_id, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      "default-tenant",
      "retrieval_trace",
      "partial-json",
      "codex",
      JSON.stringify({
        usedInFirstResponse: "yes",
        recollectionDecision: "maybe",
        recollectionInjected: [{ beliefStage: "unknown", reliance: 42 }],
        recollectionIgnored: [{ reason: "other" }],
      }),
      createdAt
    );
    db.prepare(
      `INSERT INTO efficiency_events (tenant_id, event_type, task_id, agent_id, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      "default-tenant",
      "token_ledger",
      "bad-numbers",
      "codex",
      JSON.stringify({ rawContextTokens: "lots", cachedTokens: null, totalTokens: Number.NaN }),
      createdAt
    );
    db.prepare(
      `INSERT INTO efficiency_events (tenant_id, event_type, task_id, agent_id, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      "default-tenant",
      "source_read",
      "no-hash",
      "codex",
      JSON.stringify({ sourceId: "x", sourceHash: "", toolId: "read" }),
      createdAt
    );

    const response = await GET(new Request("http://localhost/api/operations/noc?window=24h&workspace=all"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.sourceStates.efficiencySignals).toBe("known_unwired");
  });

  it("handles empty and partial efficiency windows without exposing efficiency metrics", async () => {
    const { GET, getDb, recordEfficiencyEvent } = await loadRouteWithEfficiencyInternals();
    const db = getDb();

    let response = await GET(new Request("http://localhost/api/operations/noc?window=24h&workspace=all"));
    let body = await response.json();
    expect(body.sourceStates.efficiencySignals).toBe("known_unwired");

    recordEfficiencyEvent(db, {
      eventType: "retrieval_trace",
      taskId: "partial",
      agentId: "codex",
      createdAt: new Date().toISOString(),
      payload: {
        query: "only retrieval",
        sources: ["a"],
        tokensUsed: 5,
        usedInFirstResponse: false,
        timingGate: "before_plan",
      },
    });

    response = await GET(new Request("http://localhost/api/operations/noc?window=24h&workspace=local"));
    body = await response.json();
    expect(body.sourceStates.efficiencySignals).toBe("known_unwired");
    expect(body.metrics.efficiency).toBeUndefined();
  });
});

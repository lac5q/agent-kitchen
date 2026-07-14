// @vitest-environment node
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { METRIC_STATUSES, type MetricEnvelope } from "@/lib/metric-status";

const TEST_DIR = path.join(os.tmpdir(), `operations-noc-contract-${crypto.randomUUID()}`);
const TEST_DB_PATH = path.join(TEST_DIR, "noc.db");

async function loadRoute() {
  process.env.SQLITE_DB_PATH = TEST_DB_PATH;
  vi.resetModules();
  const route = await import("../route");
  const dbModule = await import("@/lib/db");
  const telemetry = await import("@/lib/efficiency-telemetry");
  const metricStatus = await import("@/lib/metric-status");
  return { ...route, ...dbModule, ...telemetry, ...metricStatus };
}

function isMetricEnvelope(value: unknown): value is MetricEnvelope {
  return Boolean(value) && typeof value === "object" && "status" in value && "source" in value;
}


describe("GET /api/operations/noc truthful metric contract", () => {
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

  it("returns metric envelopes for every adapted metric", async () => {
    const { GET } = await loadRoute();
    const response = await GET(new Request("http://localhost/api/operations/noc?window=24h&workspace=all"));
    const body = await response.json();

    const metricKeys = ["memoryRows", "activeDispatches", "failedWork", "governanceEvents", "enabledSkills", "cronWarnings"];
    for (const key of metricKeys) {
      expect(isMetricEnvelope(body.metrics[key]), `metrics.${key} should be a metric envelope`).toBe(true);
      const envelope = body.metrics[key] as MetricEnvelope;
      expect(METRIC_STATUSES).toContain(envelope.status);
      expect(typeof envelope.source).toBe("string");
      expect(envelope.scope).toEqual({ window: "24h", workspace: "all" });
    }
  });

  it("surfaces degraded status with full source provenance when only some streams are present", async () => {
    const { GET, recordEfficiencyEvent, getDb } = await loadRoute();
    const db = getDb();
    recordEfficiencyEvent(db, {
      eventType: "retrieval_trace",
      taskId: "task-zero",
      agentId: "codex",
      createdAt: new Date().toISOString(),
      payload: {
        query: "q",
        sources: ["a"],
        tokensUsed: 5,
        usedInFirstResponse: false,
        timingGate: "before_plan",
      },
    });
    const response = await GET(new Request("http://localhost/api/operations/noc?window=24h&workspace=local"));
    const body = await response.json();
    const env = body.metrics.efficiency;
    expect(env.status).toBe("degraded");
    expect(env.value).toBeNull();
    expect(env.source).toBe("durable://efficiency_events");
    expect(env.scope).toEqual({ window: "24h", workspace: "local" });
    expect(env.reason).toBeTruthy();
  });

  it("returns error rather than zero when the underlying query throws", async () => {
    const { GET, getDb } = await loadRoute();
    const db = getDb();
    db.close();
    const response = await GET(new Request("http://localhost/api/operations/noc?window=24h&workspace=all"));
    const body = await response.json();
    // response is apiError 500 envelope
    expect(response.status).toBe(500);
    expect(body.ok).toBe(false);
  });

  it("emits a truthful empty envelope for an empty successful source", async () => {
    const { GET } = await loadRoute();
    const response = await GET(new Request("http://localhost/api/operations/noc?window=24h&workspace=all"));
    const body = await response.json();
    expect(body.metrics.efficiency.status).toBe("empty");
    expect(body.metrics.efficiency.value).toBeNull();
    expect(body.metrics.efficiency.reason).toBeTruthy();
  });

  it("preserves scope and source provenance through the response", async () => {
    const { GET } = await loadRoute();
    const response = await GET(new Request("http://localhost/api/operations/noc?window=7d&workspace=remote"));
    const body = await response.json();
    expect(body.metrics.efficiency.scope).toEqual({ window: "7d", workspace: "remote" });
    expect(body.metrics.efficiency.source).toBeTruthy();
    expect(body.filters).toMatchObject({ window: "7d", workspace: "remote" });
  });

  it("reports efficiency as degraded (not zero) when some streams are missing", async () => {
    const { GET, recordEfficiencyEvent, getDb } = await loadRoute();
    recordEfficiencyEvent(getDb(), {
      eventType: "retrieval_trace",
      taskId: "task-partial",
      agentId: "codex",
      createdAt: new Date().toISOString(),
      payload: {
        query: "partial",
        sources: ["a"],
        tokensUsed: 1,
        usedInFirstResponse: true,
        timingGate: "before_plan",
      },
    });
    const response = await GET(new Request("http://localhost/api/operations/noc?window=24h&workspace=local"));
    const body = await response.json();
    expect(body.metrics.efficiency.status).toBe("degraded");
    expect(body.metrics.efficiency.value).toBeNull();
    expect(body.metrics.efficiency.reason).toBeTruthy();
  });

  it("direct memory_write producer coverage flows from API into efficiency envelope", async () => {
    const { GET, recordEfficiencyEvent, getDb } = await loadRoute();
    const now = new Date().toISOString();
    recordEfficiencyEvent(getDb(), {
      eventType: "memory_write",
      taskId: "task-direct-write",
      agentId: "codex",
      createdAt: now,
      payload: {
        source: "agent_memory",
        firstSeenAt: now,
        dedupHash: "abc-123",
        isRediscovery: false,
      },
    });
    const response = await GET(new Request("http://localhost/api/operations/noc?window=24h&workspace=local"));
    const body = await response.json();
    const env = body.metrics.efficiency;
    expect(env.status).toBe("degraded");
    expect(env.value).toBeNull();
    expect(env.source).toBe("durable://efficiency_events");
    expect(env.reason).toContain("Missing");
    // 4/5 streams missing because we only emitted memory_write
    expect(env.reason).toMatch(/Missing 4\/5 efficiency streams/);
  });

  it("memoryRows envelope distinguishes a successful measured zero from error and empty", async () => {
    const { GET } = await loadRoute();
    // No messages inserted - this is the empty state
    const response = await GET(new Request("http://localhost/api/operations/noc?window=24h&workspace=all"));
    const body = await response.json();
    const env = body.metrics.memoryRows;
    expect(env.status).toBe("empty");
    expect(env.value).toBeNull();
    expect(env.source).toBe("sqlite://messages");
    expect(env.scope).toEqual({ window: "24h", workspace: "all" });
    expect(env.reason).toBeTruthy();
  });

  it("memoryRows envelope exposes error when the source query throws", async () => {
    const { GET, getDb } = await loadRoute();
    const db = getDb();
    // Drop the messages table so the COUNT(*) query throws
    db.exec("DROP TABLE messages");
    const response = await GET(new Request("http://localhost/api/operations/noc?window=24h&workspace=all"));
    const body = await response.json();
    const env = body.metrics.memoryRows;
    expect(env.status).toBe("error");
    expect(env.value).toBeNull();
    expect(env.source).toBe("sqlite://messages");
    expect(env.reason).toBeTruthy();
  });

  it("memoryRows envelope is live and value is preserved when source is healthy", async () => {
    const { GET, getDb } = await loadRoute();
    const db = getDb();
    const timestamp = new Date().toISOString();
    db.prepare(
      `INSERT INTO messages(session_id, project, agent_id, role, content, timestamp, visibility, policy, request_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "session-truthful",
      "project-truthful",
      "codex",
      "user",
      "test message",
      timestamp,
      "internal",
      "indexable",
      "request-truthful"
    );
    const response = await GET(new Request("http://localhost/api/operations/noc?window=24h&workspace=local"));
    const body = await response.json();
    const env = body.metrics.memoryRows;
    expect(env.status).toBe("live");
    expect(env.value).toBe(1);
    expect(env.source).toBe("sqlite://messages");
    expect(env.observedAt).toBeTruthy();
  });
});

// @vitest-environment node
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";


import { METRIC_STATUSES, type MetricEnvelope, type MetricScope } from "@/lib/metric-status";
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

    // memoryRows and governanceEvents honor the selected scope; the others
    // are cumulative / fixed-scope metrics that must advertise their real
    // scope instead of pretending to honor the filter.
    const scopeByMetric: Record<string, MetricScope> = {
      memoryRows: { window: "24h", workspace: "all" },
      activeDispatches: { window: "all", workspace: "all" },
      failedWork: { window: "all", workspace: "all" },
      governanceEvents: { window: "24h", workspace: "all" },
      enabledSkills: { window: "all", workspace: "all" },
      cronWarnings: { window: "all", workspace: "all" },
    };
    for (const key of Object.keys(scopeByMetric)) {
      expect(isMetricEnvelope(body.metrics[key]), `metrics.${key} should be a metric envelope`).toBe(true);
      const envelope = body.metrics[key] as MetricEnvelope;
      expect(METRIC_STATUSES).toContain(envelope.status);
      expect(typeof envelope.source).toBe("string");
      expect(envelope.scope).toEqual(scopeByMetric[key]);
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

  it("cumulative envelopes advertise window=all workspace=all regardless of request filters", async () => {
    // The fix exposes fixed/cumulative scope for envelopes whose SQL does
    // not honor the requested filters, so a remote/local/7d request can
    // never be misreported as a window-scoped or workspace-scoped value.
    const { GET } = await loadRoute();
    const response = await GET(
      new Request("http://localhost/api/operations/noc?window=7d&workspace=remote")
    );
    const body = await response.json();
    for (const key of ["activeDispatches", "failedWork", "enabledSkills", "cronWarnings"]) {
      const envelope = body.metrics[key] as MetricEnvelope;
      expect(envelope.scope).toEqual({ window: "all", workspace: "all" });
      // Reason must disclose that the requested filter does not apply.
      expect(String(envelope.reason ?? "")).toMatch(/cumulative|windowed|filter/i);
    }
  });

  it("dispatch/governance/observedAt come from their own source tables, not from messages", async () => {
    // Regression for the "reused observedAt" finding: the dispatch and
    // governance envelopes must NOT borrow their observedAt from the
    // messages table. We insert only an audit entry to force the
    // governance probe to return a real timestamp.
    const { GET, getDb } = await loadRoute();
    const db = getDb();

    const auditTimestamp = new Date().toISOString();
    db.prepare(
      `INSERT INTO audit_entries(id, actor_id, actor_role, event_type, entity_type, entity_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run("audit-noc-1", "test-actor", "operator", "noc.test", "test-target", "test-entity", auditTimestamp);    const response = await GET(
      new Request("http://localhost/api/operations/noc?window=24h&workspace=all")
    );
    const body = await response.json();
    // The dispatch observedAt must NOT match the messages table. With no
    // delegations or skills or cron rows, all three should report null.
    expect(body.metrics.activeDispatches.observedAt).toBeNull();
    expect(body.metrics.failedWork.observedAt).toBeNull();
    expect(body.metrics.enabledSkills.observedAt).toBeNull();
    expect(body.metrics.cronWarnings.observedAt).toBeNull();
    // Governance observedAt should reflect the audit_entries row we inserted.
    expect(body.metrics.governanceEvents.observedAt).toBe(auditTimestamp);
  });
});
describe("Round 2 blocking fixes", () => {
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

  it("governanceEvents advertises scope=all (does NOT claim workspace partition)", async () => {
    const { GET } = await loadRoute();
    const response = await GET(
      new Request("http://localhost/api/operations/noc?window=24h&workspace=local")
    );
    const body = await response.json();
    const envelope = body.metrics.governanceEvents as MetricEnvelope;
    // Finding (1): governanceEvents queries audit_entries only by window,
    // NOT by workspace. The envelope must disclose its true scope.
    expect(envelope.scope).toEqual({ window: "24h", workspace: "all" });
    expect(String(envelope.reason ?? "")).toMatch(/window|workspace|filter|cumulative/i);
  });

  it("governanceEvents observedAt reflects the audit_entries probe itself", async () => {
    const { GET, getDb } = await loadRoute();
    const db = getDb();
    const auditTimestamp = new Date().toISOString();
    db.prepare(
      `INSERT INTO audit_entries(id, actor_id, actor_role, event_type, entity_type, entity_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run("audit-r2-1", "test-actor", "operator", "noc.test", "test", "test", auditTimestamp);
    const response = await GET(
      new Request("http://localhost/api/operations/noc?window=24h&workspace=all")
    );
    const body = await response.json();
    const envelope = body.metrics.governanceEvents as MetricEnvelope;
    // Finding (1): observedAt must come from the audit-entries probe.
    expect(envelope.observedAt).toBe(auditTimestamp);
  });

  it("activeDispatches observedAt is derived from the status-filtered queried population", async () => {
    const { GET, getDb } = await loadRoute();
    const db = getDb();
    // Insert one ACTIVE delegation in the recent past and one FAILED old
    // delegation. activeDispatches counts status IN ('pending','active','paused');
    // observedAt should reflect THAT population, NOT the failed row's date.
    const recent = "2026-07-13T11:00:00.000Z";
    const oldFailed = "2020-01-01T00:00:00.000Z";
    db.prepare(
      `INSERT INTO hive_delegations(task_id, from_agent, to_agent, task_summary, priority, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("t-active", "codex", "claude", "active", 1, "active", recent, recent);
    db.prepare(
      `INSERT INTO hive_delegations(task_id, from_agent, to_agent, task_summary, priority, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("t-failed-old", "codex", "claude", "old failed", 1, "failed", oldFailed, oldFailed);

    const response = await GET(
      new Request("http://localhost/api/operations/noc?window=24h&workspace=all")
    );
    const body = await response.json();
    const active = body.metrics.activeDispatches as MetricEnvelope;
    const failed = body.metrics.failedWork as MetricEnvelope;
    // Finding (2): observedAt must reflect the metric-specific population.
    // Active envelope's observedAt must come from the active row only.
    expect(active.value).toBe(1);
    expect(active.observedAt).toBe(recent);
    // Failed envelope's observedAt must come from the failed row only.
    expect(failed.value).toBe(1);
    expect(failed.observedAt).toBe(oldFailed);
    // They MUST NOT share an observedAt.
    expect(active.observedAt).not.toBe(failed.observedAt);
  });

  it("activeDispatches observedAt is null when no rows match the status filter", async () => {
    const { GET, getDb } = await loadRoute();
    const db = getDb();
    const oldFailed = "2020-01-01T00:00:00.000Z";
    db.prepare(
      `INSERT INTO hive_delegations(task_id, from_agent, to_agent, task_summary, priority, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("t-failed-only", "codex", "claude", "old failed", 1, "failed", oldFailed, oldFailed);
    const response = await GET(
      new Request("http://localhost/api/operations/noc?window=24h&workspace=all")
    );
    const body = await response.json();
    const active = body.metrics.activeDispatches as MetricEnvelope;
    // Finding (2): with no active delegations, observedAt must NOT
    // borrow from the failed delegations' updated_at column.
    expect(active.status).toBe("empty");
    expect(active.value).toBeNull();
    expect(active.observedAt).toBeNull();
    expect(active.source).toBe("sqlite://hive_delegations");
  });
});

// @vitest-environment node
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_DIR = path.join(os.tmpdir(), `operations-noc-branches-${crypto.randomUUID()}`);
const TEST_DB_PATH = path.join(TEST_DIR, "noc.db");

async function loadRoute() {
  process.env.SQLITE_DB_PATH = TEST_DB_PATH;
  vi.resetModules();
  const route = await import("../route");
  const dbModule = await import("@/lib/db");
  return { ...route, ...dbModule };
}

describe("GET /api/operations/noc additional branch coverage", () => {
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
    vi.doUnmock("@/lib/context-sources");
  });

  it("includes hive delegations for remote workspace agent activity", async () => {
    const { GET, getDb } = await loadRoute();
    const db = getDb();
    const timestamp = new Date().toISOString();

    db.prepare(
      `INSERT INTO messages(session_id, project, agent_id, role, content, timestamp, visibility, policy, request_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("remote-session", "operator", "remote-agent", "assistant", "remote work", timestamp, "internal", "indexable", "remote-1");
    db.prepare(
      `INSERT INTO hive_delegations(task_id, from_agent, to_agent, task_summary, priority, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("remote-task", "remote-agent", "other-remote", "delegate", 1, "active", timestamp, timestamp);

    const response = await GET(new Request("http://localhost/api/operations/noc?window=24h&workspace=remote"));
    const body = await response.json();

    expect(body.agentActivity.sourceState).toBe("live");
    expect(body.agentActivity.agents[0].agentId).toBe("remote-agent");
    expect(body.agentActivity.delegations).toEqual([
      expect.objectContaining({
        taskId: "remote-task",
        fromAgent: "remote-agent",
        toAgent: "other-remote",
        status: "active",
        updatedAt: timestamp,
      }),
    ]);
  });

  it("keeps agent activity live when delegation lookup fails", async () => {
    const { GET, getDb } = await loadRoute();
    const db = getDb();
    const timestamp = new Date().toISOString();

    db.prepare(
      `INSERT INTO messages(session_id, project, agent_id, role, content, timestamp, visibility, policy, request_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("local-session", "operator", "codex", "assistant", "local work", timestamp, "internal", "indexable", "local-1");

    const originalPrepare = db.prepare.bind(db);
    (db as unknown as { prepare: typeof db.prepare }).prepare = ((sql: string) => {
      if (sql.includes("FROM hive_delegations d")) throw new Error("delegations unavailable");
      return originalPrepare(sql);
    }) as typeof db.prepare;

    const response = await GET(new Request("http://localhost/api/operations/noc?window=24h&workspace=local"));
    const body = await response.json();

    expect(body.agentActivity.sourceState).toBe("live");
    expect(body.agentActivity.delegations).toEqual([]);
    expect(body.agentActivity.agents).toHaveLength(1);
  });

  it("classifies HIL SLA breaches as critical attention items", async () => {
    const { GET, getDb } = await loadRoute();
    const db = getDb();
    const timestamp = new Date().toISOString();

    db.prepare(
      `INSERT INTO hil_escalations(id, tenant_id, entity_type, entity_id, escalation_type, sla_seconds, sla_deadline, status, opened_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("hil-breach", "default-tenant", "task", "task-1", "agent_escalate", 60, timestamp, "sla_breached", "operator", timestamp);

    const response = await GET(new Request("http://localhost/api/operations/noc?window=24h&workspace=all"));
    const body = await response.json();
    const breached = body.attention.find((item: { id: string }) => item.id === "hil:hil-breach");

    expect(breached).toMatchObject({
      severity: "critical",
      title: "HIL SLA breached: agent_escalate",
      target: "/escalations",
    });
  });

  it("marks attention unavailable when context source evaluation throws", async () => {
    vi.resetModules();
    vi.doMock("@/lib/context-sources", () => ({
      loadContextSourceContracts: () => ({ sources: [] }),
      evaluateContextSources: () => {
        throw new Error("context sources unavailable");
      },
    }));
    process.env.SQLITE_DB_PATH = TEST_DB_PATH;
    const route = await import("../route");

    const response = await route.GET(new Request("http://localhost/api/operations/noc?window=24h&workspace=all"));
    const body = await response.json();

    expect(body.sourceStates.attention).toBe("stale_or_error");
  });

  it("adds pulse panel warnings when latest observation probes fail", async () => {
    const { GET, getDb } = await loadRoute();
    const db = getDb();
    const timestamp = new Date().toISOString();

    db.prepare(
      `INSERT INTO messages(session_id, project, agent_id, role, content, timestamp, visibility, policy, request_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("probe-session", "operator", "codex", "assistant", "probe", timestamp, "internal", "indexable", "probe-1");

    const originalPrepare = db.prepare.bind(db);
    (db as unknown as { prepare: typeof db.prepare }).prepare = ((sql: string) => {
      if (sql.includes("MAX(timestamp) AS value FROM messages")) throw new Error("latest probe failed");
      return originalPrepare(sql);
    }) as typeof db.prepare;

    const response = await GET(new Request("http://localhost/api/operations/noc?window=24h&workspace=local"));
    const body = await response.json();

    expect(body.panels.pulse.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("Latest-observation probe failed")])
    );
  });

  it("counts remote hive actions separately from local workspace filters", async () => {
    const { GET, getDb } = await loadRoute();
    const db = getDb();
    const timestamp = new Date().toISOString();

    db.prepare(
      `INSERT INTO hive_actions(agent_id, action_type, summary, artifacts, session_id, timestamp)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run("remote-agent", "continue", "remote hive action", null, null, timestamp);

    const response = await GET(new Request("http://localhost/api/operations/noc?window=24h&workspace=remote"));
    const body = await response.json();

    expect(body.metrics.hiveActions).toMatchObject({
      status: "live",
      value: 1,
      scope: { window: "24h", workspace: "remote" },
      observedAt: timestamp,
    });
  });
});

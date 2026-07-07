// @vitest-environment node
import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";

import { initSchema } from "@/lib/db-schema";
import { createSpace } from "@/lib/space";
import { onboardUser } from "@/lib/identity/lifecycle";
import { getTeamNocView } from "@/lib/identity/noc-views";

function freshDb(): Database.Database {
  const db = new Database(":memory:");
  initSchema(db);
  return db;
}

function insertMessage(
  db: Database.Database,
  args: {
    sessionId: string;
    project: string;
    agentId: string;
    content: string;
    timestamp: string;
    spaceId?: string | null;
  }
): void {
  db.prepare(
    `INSERT INTO messages (session_id, project, agent_id, role, content, timestamp, space_id)
     VALUES (?, ?, ?, 'user', ?, ?, ?)`
  ).run(
    args.sessionId,
    args.project,
    args.agentId,
    args.content,
    args.timestamp,
    args.spaceId ?? null
  );
}

function recordSkillReport(
  db: Database.Database,
  agentId: string,
  skillId: string
): void {
  db.prepare(
    `INSERT INTO agent_skill_reports (agent_id, skill_id, action, metadata)
     VALUES (?, ?, 'use', '{}')`
  ).run(agentId, skillId);
}

function writePolicyDenial(
  db: Database.Database,
  args: { agentId: string; createdAt: string; seq: number }
): void {
  // audit_entries.id is the PRIMARY KEY -- include the sequence so we can
  // write multiple rows in the same test.
  db.prepare(
    `INSERT INTO audit_entries
       (id, tenant_id, actor_id, actor_role, event_type, entity_type, entity_id, reason, metadata_json, created_at)
     VALUES (?, 'default-tenant', ?, 'system', 'policy.decision', 'policy_decision', 'policy_decision:capability:dispatch', 'denied', ?, ?)`
  ).run(
    `audit-${args.agentId}-${args.seq}-${args.createdAt}`,
    args.agentId,
    JSON.stringify({ agent_id: args.agentId, outcome: "deny" }),
    args.createdAt
  );
}

function writeHeartbeat(
  db: Database.Database,
  agentId: string,
  ts: string
): void {
  db.prepare(
    `UPDATE registered_agents SET last_heartbeat_at = ? WHERE id = ?`
  ).run(ts, agentId);
}

describe("identity/noc-views.ts (Phase 131 / TEAMSCALE-05)", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = freshDb();
  });

  it("returns counts for memory, denials, skills, agents", () => {
    const space = createSpace(db, { tenantId: "default-tenant", name: "noc-team" });
    const { agentId } = onboardUser(db, {
      email: "noc@example.com",
      displayName: "Noc",
      role: "operator",
      spaceIds: [space.id],
      agentKit: { name: "noc-agent", skills: ["search", "recall"] },
    });

    const now = Date.now();
    const recentIso = new Date(now - 60 * 60 * 1000).toISOString();
    const oldIso = new Date(now - 48 * 60 * 60 * 1000).toISOString();

    // Memory: 2 in-window, 1 out-of-window.
    insertMessage(db, {
      sessionId: "s1",
      project: "noc-team",
      agentId,
      content: "in-window-1",
      timestamp: recentIso,
      spaceId: space.id,
    });
    insertMessage(db, {
      sessionId: "s2",
      project: "noc-team",
      agentId,
      content: "in-window-2",
      timestamp: recentIso,
      spaceId: space.id,
    });
    insertMessage(db, {
      sessionId: "s3",
      project: "noc-team",
      agentId,
      content: "out-of-window",
      timestamp: oldIso,
      spaceId: space.id,
    });

    // Skills: 3x search, 1x recall.
    recordSkillReport(db, agentId, "search");
    recordSkillReport(db, agentId, "search");
    recordSkillReport(db, agentId, "search");
    recordSkillReport(db, agentId, "recall");

    // Policy denials in window: 2.
    writePolicyDenial(db, { agentId, createdAt: recentIso, seq: 1 });
    writePolicyDenial(db, { agentId, createdAt: recentIso, seq: 2 });

    // Agent activity: heartbeat in window + hive_actions row.
    writeHeartbeat(db, agentId, recentIso);
    db.prepare(
      `INSERT INTO hive_actions (agent_id, action_type, summary, timestamp)
       VALUES (?, 'checkpoint', 'noc checkpoint', ?)`
    ).run(agentId, recentIso);

    const view = getTeamNocView(db, { spaceId: space.id, window: "24h" });

    expect(view.spaceId).toBe(space.id);
    expect(view.spaceName).toBe("noc-team");
    expect(view.window).toBe("24h");

    // Memory: 2 in current window, 0 in previous -> trend "up".
    expect(view.memoryGrowth.count).toBe(2);
    expect(view.memoryGrowth.trend).toBe("up");

    // Promotion queue depth: no rows -> 0.
    expect(view.promotionQueueDepth).toBe(0);

    // Policy denials: 2 in window.
    expect(view.policyDenials).toBe(2);

    // Skill usage: search 3, recall 1.
    expect(view.skillUsage).toEqual([
      { skillId: "search", count: 3 },
      { skillId: "recall", count: 1 },
    ]);

    // Agent activity: 1 active, 1 hive_action row.
    expect(view.agentActivity.activeAgents).toBe(1);
    expect(view.agentActivity.totalHeartbeats).toBe(1);
  });

  it("returns zero counts for an empty space", () => {
    const space = createSpace(db, { tenantId: "default-tenant", name: "empty" });
    const view = getTeamNocView(db, { spaceId: space.id });
    expect(view.memoryGrowth.count).toBe(0);
    expect(view.memoryGrowth.trend).toBe("flat");
    expect(view.promotionQueueDepth).toBe(0);
    expect(view.policyDenials).toBe(0);
    expect(view.skillUsage).toEqual([]);
    expect(view.agentActivity.activeAgents).toBe(0);
    expect(view.agentActivity.totalHeartbeats).toBe(0);
  });

  it("uses the legacy `project` fallback when space_id is null", () => {
    const space = createSpace(db, { tenantId: "default-tenant", name: "legacy" });
    const now = Date.now();
    const recentIso = new Date(now - 60 * 60 * 1000).toISOString();

    // Message without space_id but with project = space name (legacy).
    insertMessage(db, {
      sessionId: "s-legacy",
      project: "legacy",
      agentId: "agt_somebody",
      content: "legacy row",
      timestamp: recentIso,
      spaceId: null,
    });

    const view = getTeamNocView(db, { spaceId: space.id, window: "24h" });
    expect(view.memoryGrowth.count).toBe(1);
  });

  it("classifies trend as 'down' when current count is below previous", () => {
    const space = createSpace(db, { tenantId: "default-tenant", name: "trend" });
    const now = Date.now();
    // 0 in current window, 3 in previous window.
    for (let i = 0; i < 3; i++) {
      insertMessage(db, {
        sessionId: `s-${i}`,
        project: "trend",
        agentId: "agt_x",
        content: `old-${i}`,
        timestamp: new Date(now - 36 * 60 * 60 * 1000).toISOString(),
        spaceId: space.id,
      });
    }
    const view = getTeamNocView(db, { spaceId: space.id, window: "24h" });
    expect(view.memoryGrowth.count).toBe(0);
    expect(view.memoryGrowth.trend).toBe("down");
  });

  it("throws when spaceId is missing", () => {
    expect(() => getTeamNocView(db, { spaceId: "" })).toThrow(/spaceId/);
  });
});
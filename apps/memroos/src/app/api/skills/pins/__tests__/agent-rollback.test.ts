// @vitest-environment node
/**
 * Phase 149 (continued) / SKILLTRUST-04 / VAL-SKILL-031 — API route
 * tests for the agent-scoped rollback endpoint.
 *
 *   POST /api/skills/pins/:agent/rollback
 *
 * The validation contract uses the agent id in the URL path. The
 * route resolves the numeric pin id from (agent_id, skill_name) and
 * delegates to the existing one-step rollback helper.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

const TMP_ROOT = path.join(
  os.tmpdir(),
  `skill-pins-agent-rollback-${crypto.randomUUID()}`
);

beforeEach(() => {
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
  fs.mkdirSync(TMP_ROOT, { recursive: true });
  process.env["MEMROOS_ROOT"] = TMP_ROOT;
  process.env["SQLITE_DB_PATH"] = path.join(
    TMP_ROOT,
    `db-${crypto.randomUUID()}.db`
  );
  vi.resetModules();
});

afterEach(async () => {
  delete process.env["MEMROOS_ROOT"];
  delete process.env["SQLITE_DB_PATH"];
  delete process.env["MEMROOS_OPERATOR_API_KEY"];
  try {
    const dbModule = await import("@/lib/db");
    dbModule.closeDb();
  } catch {
    /* ignore */
  }
  vi.resetModules();
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
});

async function loadDb() {
  const { getDb } = await import("@/lib/db");
  const { initSchema } = await import("@/lib/db-schema");
  const db = getDb();
  initSchema(db);
  return db;
}

function insertSkillRow(
  db: import("better-sqlite3").Database,
  overrides: {
    name?: string;
    source_harness?: string;
    content_hash?: string;
    dispatch_status?: string;
    completeness_pct?: number;
  } = {}
): number {
  const result = db
    .prepare(
      `INSERT INTO skill_registry (
        name, description, owner, source_harness, risk_tier, dispatch_status,
        version, preconditions, allowed_tools, verification_checks, rollback_behavior,
        raw_body, completeness_pct, missing_fields_json, imported_by, imported_at,
        evidence_examples, content_hash, signature, signed_by, signed_at, trust_level,
        public_key_fingerprint
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?
      )`
    )
    .run(
      overrides.name ?? "agent-rb-skill",
      "Test",
      "ops",
      overrides.source_harness ?? "claude",
      "low",
      overrides.dispatch_status ?? "enabled",
      "1.0.0",
      "none",
      "read_file",
      "verify output",
      "revert",
      "## Preconditions\nnone",
      overrides.completeness_pct ?? 100,
      "[]",
      "operator",
      new Date().toISOString(),
      "check output",
      overrides.content_hash ?? "0".repeat(64),
      null,
      null,
      null,
      "unsigned",
      null
    );
  return Number(result.lastInsertRowid);
}

function insertAgent(
  db: import("better-sqlite3").Database,
  id: string,
  name: string
): void {
  db.prepare(
    `INSERT INTO registered_agents (
      id, name, role, platform, protocol, status, location
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, name, "operator", "local", "rest", "active", "local");
}

function makePost(url: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/skills/pins/:agent/rollback", () => {
  it("401 — no operator key", async () => {
    delete process.env["MEMROOS_OPERATOR_API_KEY"];
    await loadDb();
    const route = await import("../[agent]/rollback/route");
    const res = await route.POST(
      makePost(
        "https://example.com/api/skills/pins/a-rb/rollback",
        { skill_name: "x", operator: "alice" }
      ),
      { params: Promise.resolve({ agent: "a-rb" }) }
    );
    expect(res.status).toBe(401);
  });

  it("200 — rolls back by agent id and writes audit", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    const db = await loadDb();
    insertAgent(db, "a-rb", "Agent RB");
    insertSkillRow(db, {
      name: "agent-rb-skill",
      content_hash: "1".repeat(64),
      dispatch_status: "enabled",
      completeness_pct: 100,
    });

    const governance = await import("@/lib/skills/skill-sync-governance");
    governance.createOrUpdateAgentVersionPin(db, {
      agent_id: "a-rb",
      skill_name: "agent-rb-skill",
      skill_id: null,
      current_version: "1.0.0",
      current_content_hash: "1".repeat(64),
      actor: "alice",
    });
    governance.createOrUpdateAgentVersionPin(db, {
      agent_id: "a-rb",
      skill_name: "agent-rb-skill",
      skill_id: null,
      current_version: "2.0.0",
      current_content_hash: "2".repeat(64),
      actor: "alice",
    });

    const route = await import("../[agent]/rollback/route");
    const res = await route.POST(
      makePost(
        "https://example.com/api/skills/pins/a-rb/rollback",
        { skill_name: "agent-rb-skill", operator: "alice", reason: "regression" },
        { authorization: "Bearer right-key" }
      ),
      { params: Promise.resolve({ agent: "a-rb" }) }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.pin.current_version).toBe("1.0.0");
    expect(json.pin.current_content_hash).toBe("1".repeat(64));
    expect(json.pin.prior_version).toBeNull();
    expect(json.pin.rolled_back_by).toBe("alice");

    const auditCount = db
      .prepare(
        `SELECT COUNT(*) as c FROM audit_entries
           WHERE event_type = 'skill.pin.rolled_back'`
      )
      .get() as { c: number };
    expect(auditCount.c).toBe(1);
  });

  it("404 — no pin for the agent/skill", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    const db = await loadDb();
    insertAgent(db, "a-ghost", "Ghost");
    const route = await import("../[agent]/rollback/route");
    const res = await route.POST(
      makePost(
        "https://example.com/api/skills/pins/a-ghost/rollback",
        { skill_name: "missing", operator: "alice" },
        { authorization: "Bearer right-key" }
      ),
      { params: Promise.resolve({ agent: "a-ghost" }) }
    );
    expect(res.status).toBe(404);
    void db;
  });

  it("400 — missing operator in body", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    await loadDb();
    const route = await import("../[agent]/rollback/route");
    const res = await route.POST(
      makePost(
        "https://example.com/api/skills/pins/a/rollback",
        { skill_name: "x" },
        { authorization: "Bearer right-key" }
      ),
      { params: Promise.resolve({ agent: "a" }) }
    );
    expect(res.status).toBe(400);
  });
});

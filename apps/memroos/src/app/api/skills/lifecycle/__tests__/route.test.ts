// @vitest-environment node
/**
 * Route tests for GET/POST /api/skills/lifecycle
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

const TMP_ROOT = path.join(
  os.tmpdir(),
  `skill-lifecycle-route-${crypto.randomUUID()}`
);

beforeEach(() => {
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
  fs.mkdirSync(TMP_ROOT, { recursive: true });
  process.env["MEMROOS_ROOT"] = TMP_ROOT;
  process.env["SQLITE_DB_PATH"] = path.join(TMP_ROOT, `db-${crypto.randomUUID()}.db`);
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

async function loadRoute() {
  return import("../route");
}

function insertSkillRow(
  db: import("better-sqlite3").Database,
  overrides: {
    name?: string;
    source_harness?: string;
    dispatch_status?: string;
    lifecycle_state?: string;
  } = {}
): number {
  const result = db
    .prepare(
      `INSERT INTO skill_registry (
        name, description, owner, source_harness, risk_tier, dispatch_status,
        version, preconditions, allowed_tools, verification_checks, rollback_behavior,
        raw_body, completeness_pct, missing_fields_json, imported_by, imported_at,
        evidence_examples, content_hash, signature, signed_by, signed_at, trust_level,
        public_key_fingerprint, lifecycle_state
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?
      )`
    )
    .run(
      overrides.name ?? "lifecycle-route-skill",
      "Lifecycle route test",
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
      100,
      "[]",
      "operator",
      new Date().toISOString(),
      "check output",
      null,
      null,
      null,
      null,
      "unsigned",
      null,
      overrides.lifecycle_state ?? "draft"
    );
  return Number(result.lastInsertRowid);
}

function makePost(url: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function makeGet(url: string): Request {
  return new Request(url, { method: "GET" });
}

describe("GET /api/skills/lifecycle", () => {
  it("200 returns lifecycle_states when no filters are provided", async () => {
    await loadDb();
    const route = await loadRoute();
    const res = await route.GET(makeGet("https://example.com/api/skills/lifecycle"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.lifecycle_states).toEqual(["draft", "enabled", "deprecated", "retired"]);
    expect(json.note).toMatch(/skill_id/i);
  });

  it("200 returns audit trail for a skill_id", async () => {
    const db = await loadDb();
    const skillId = insertSkillRow(db, { lifecycle_state: "draft" });
    const { upsertQuarantineRecord } = await import("@/lib/skills/skill-quarantine");
    upsertQuarantineRecord(db, {
      skillId,
      stage: "enabled",
      approvalStatus: "approved",
    });
    const { transitionLifecycleState } = await import("@/lib/skills/skill-lifecycle");
    transitionLifecycleState(db, skillId, "enabled", "alice", "rollout");

    const route = await loadRoute();
    const res = await route.GET(
      makeGet(`https://example.com/api/skills/lifecycle?skill_id=${skillId}`)
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.skill_id).toBe(skillId);
    expect(json.lifecycle_state).toBe("enabled");
    expect(json.audit_trail.length).toBeGreaterThanOrEqual(1);
  });

  it("400 for invalid skill_id query param", async () => {
    await loadDb();
    const route = await loadRoute();
    const res = await route.GET(
      makeGet("https://example.com/api/skills/lifecycle?skill_id=abc")
    );
    expect(res.status).toBe(400);
  });

  it("200 lists deprecated skills when state=deprecated", async () => {
    const db = await loadDb();
    insertSkillRow(db, {
      name: "deprecated-one",
      lifecycle_state: "deprecated",
      dispatch_status: "disabled",
    });

    const route = await loadRoute();
    const res = await route.GET(
      makeGet("https://example.com/api/skills/lifecycle?state=deprecated")
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.state).toBe("deprecated");
    expect(json.items.some((it: { name: string }) => it.name === "deprecated-one")).toBe(true);
  });

  it("200 lists skills by arbitrary lifecycle state", async () => {
    const db = await loadDb();
    insertSkillRow(db, { name: "draft-one", lifecycle_state: "draft" });

    const route = await loadRoute();
    const res = await route.GET(
      makeGet("https://example.com/api/skills/lifecycle?state=draft")
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.state).toBe("draft");
    expect(json.items.some((it: { name: string }) => it.name === "draft-one")).toBe(true);
  });

  it("includes dependents when include_dependents=1", async () => {
    const db = await loadDb();
    const skillId = insertSkillRow(db, { lifecycle_state: "enabled" });
    const { addSkillDependency } = await import("@/lib/skills/skill-lifecycle");
    addSkillDependency(db, {
      skillId,
      dependentAgentId: "agent-alpha",
      skillVersion: "1.0.0",
      registeredBy: "operator",
    });

    const route = await loadRoute();
    const res = await route.GET(
      makeGet(
        `https://example.com/api/skills/lifecycle?skill_id=${skillId}&include_dependents=1`
      )
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.dependents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ dependent_agent_id: "agent-alpha" }),
      ])
    );
  });
});

describe("POST /api/skills/lifecycle", () => {
  it("401 without operator key on non-loopback host", async () => {
    delete process.env["MEMROOS_OPERATOR_API_KEY"];
    const db = await loadDb();
    const skillId = insertSkillRow(db);
    const route = await loadRoute();
    const res = await route.POST(
      makePost("https://example.com/api/skills/lifecycle", {
        skill_id: skillId,
        to_state: "enabled",
        actor: "alice",
      })
    );
    expect(res.status).toBe(401);
  });

  it("400 when to_state is invalid", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "secret-key";
    const db = await loadDb();
    const skillId = insertSkillRow(db);
    const route = await loadRoute();
    const res = await route.POST(
      makePost(
        "https://example.com/api/skills/lifecycle",
        { skill_id: skillId, to_state: "bogus", actor: "alice" },
        { authorization: "Bearer secret-key" }
      )
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/to_state must be one of/i);
  });

  it("400 when actor is missing", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "secret-key";
    const db = await loadDb();
    const skillId = insertSkillRow(db);
    const route = await loadRoute();
    const res = await route.POST(
      makePost(
        "https://example.com/api/skills/lifecycle",
        { skill_id: skillId, to_state: "enabled" },
        { authorization: "Bearer secret-key" }
      )
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/actor is required/i);
  });

  it("200 transitions draft to enabled with quarantine pass", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "secret-key";
    const db = await loadDb();
    const skillId = insertSkillRow(db, { lifecycle_state: "draft" });
    const { upsertQuarantineRecord } = await import("@/lib/skills/skill-quarantine");
    upsertQuarantineRecord(db, {
      skillId,
      stage: "enabled",
      approvalStatus: "approved",
    });

    const route = await loadRoute();
    const res = await route.POST(
      makePost(
        "https://example.com/api/skills/lifecycle",
        {
          skill_id: skillId,
          to_state: "enabled",
          actor: "alice",
          reason: "rolling out",
        },
        { authorization: "Bearer secret-key" }
      )
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.lifecycle_state).toBe("enabled");
    expect(json.previous_state).toBe("draft");
    expect(json.audit.actor).toBe("alice");
  });

  it("409 when transition is rejected by lifecycle rules", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "secret-key";
    const db = await loadDb();
    const skillId = insertSkillRow(db, { lifecycle_state: "enabled" });

    const route = await loadRoute();
    const res = await route.POST(
      makePost(
        "https://example.com/api/skills/lifecycle",
        {
          skill_id: skillId,
          to_state: "deprecated",
          actor: "alice",
        },
        { authorization: "Bearer secret-key" }
      )
    );
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.code).toBe("lifecycle_transition");
    expect(json.error).toMatch(/reason/i);
  });
});

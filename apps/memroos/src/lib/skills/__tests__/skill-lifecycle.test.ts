// @vitest-environment node
/**
 * Phase 150 / SKILLTRUST-05 — Skill Lifecycle Manager tests.
 *
 * Covers:
 *   VAL-LIFE-001 — lifecycle_state CHECK constraint accepts only
 *                  draft|enabled|deprecated|retired.
 *   VAL-LIFE-002 — draft->enabled transition blocked without
 *                  quarantine pass record.
 *   VAL-LIFE-003 — enabled->deprecated requires non-empty reason.
 *   VAL-LIFE-004 — deprecated->retired blocked when dependents exist.
 *   VAL-LIFE-005 — retired is terminal: no transitions out.
 *   VAL-LIFE-006 — Audit entry on every state change.
 *   VAL-LIFE-007 — Deprecation generates notifications for dependents.
 *   VAL-LIFE-008 — NOC endpoint includes deprecated skills with
 *                  dependent_count + warning_level.
 *   VAL-LIFE-009 — getDependents returns agent IDs and skill versions.
 *   VAL-LIFE-010 — Dispatch denies skills with lifecycle_state != enabled.
 *   VAL-CROSS-005 — Migration v14 backfills lifecycle_state from
 *                    dispatch_status.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

const TMP_ROOT = path.join(
  os.tmpdir(),
  `skill-lifecycle-${crypto.randomUUID()}`
);

async function loadDb() {
  process.env["MEMROOS_ROOT"] = TMP_ROOT;
  process.env["SQLITE_DB_PATH"] = path.join(TMP_ROOT, `db-${crypto.randomUUID()}.db`);
  vi.resetModules();
  const dbModule = await import("@/lib/db");
  const { getDb, closeDb } = dbModule;
  const { initSchema } = await import("@/lib/db-schema");
  const db = getDb();
  initSchema(db);
  return { db, getDb, closeDb };
}

let db: import("better-sqlite3").Database;
let closeDb: () => void;

beforeEach(async () => {
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
  fs.mkdirSync(TMP_ROOT, { recursive: true });
  const mods = await loadDb();
  db = mods.db;
  closeDb = mods.closeDb;
});

afterEach(() => {
  try {
    closeDb();
  } catch {
    /* ignore */
  }
  delete process.env["MEMROOS_ROOT"];
  delete process.env["SQLITE_DB_PATH"];
  delete process.env["MEMROOS_OPERATOR_API_KEY"];
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function insertSkillRow(
  overrides: {
    name?: string;
    source_harness?: string;
    dispatch_status?: string;
    completeness_pct?: number;
    content_hash?: string | null;
    version?: string | null;
    raw_body?: string | null;
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
      overrides.name ?? "lifecycle-skill",
      "Lifecycle test description",
      "ops",
      overrides.source_harness ?? "claude",
      "low",
      overrides.dispatch_status ?? "enabled",
      overrides.version ?? "1.0.0",
      "none",
      "read_file",
      "verify output",
      "revert",
      overrides.raw_body ?? "## Preconditions\nnone",
      overrides.completeness_pct ?? 100,
      "[]",
      "operator",
      new Date().toISOString(),
      "check output",
      overrides.content_hash ?? null,
      null,
      null,
      null,
      "unsigned",
      null,
      overrides.lifecycle_state ?? "draft"
    );
  return Number(result.lastInsertRowid);
}

async function importLifecycleModule() {
  return import("../skill-lifecycle");
}

async function importQuarantineModule() {
  return import("../skill-quarantine");
}

// ---------------------------------------------------------------------------
// VAL-LIFE-001 — lifecycle_state CHECK constraint
// ---------------------------------------------------------------------------
describe("VAL-LIFE-001 lifecycle_state CHECK constraint", () => {
  it("exports SKILL_LIFECYCLE_STATES with the 4 canonical values in order", async () => {
    const { SKILL_LIFECYCLE_STATES } = await importLifecycleModule();
    expect(SKILL_LIFECYCLE_STATES).toEqual([
      "draft",
      "enabled",
      "deprecated",
      "retired",
    ]);
  });

  it("skill_registry CHECK constraint accepts the 4 lifecycle states", async () => {
    const { initSchema } = await import("@/lib/db-schema");
    initSchema(db); // idempotent
    const sql = (
      db
        .prepare(
          `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'skill_registry'`
        )
        .get() as { sql: string }
    ).sql;
    expect(sql).toMatch(/CHECK\(lifecycle_state IN/);
    expect(sql).toContain("'draft'");
    expect(sql).toContain("'enabled'");
    expect(sql).toContain("'deprecated'");
    expect(sql).toContain("'retired'");
  });

  it("INSERT with valid lifecycle_state values succeeds", () => {
    // Unique (name, source_harness) per state to satisfy the UNIQUE constraint.
    const harnesses = ["claude", "codex", "hermes", "opencode"];
    ["draft", "enabled", "deprecated", "retired"].forEach((state, index) => {
      const id = insertSkillRow({
        name: `lifecycle-insert-${state}`,
        source_harness: harnesses[index],
        lifecycle_state: state,
      });
      const row = db
        .prepare(`SELECT lifecycle_state FROM skill_registry WHERE id = ?`)
        .get(id) as { lifecycle_state: string };
      expect(row.lifecycle_state).toBe(state);
    });
  });

  it("INSERT with an invalid lifecycle_state is rejected by CHECK", () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO skill_registry (
            name, source_harness, dispatch_status, imported_by, imported_at,
            raw_body, completeness_pct, missing_fields_json, trust_level,
            lifecycle_state
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          "bad-state-skill",
          "claude",
          "enabled",
          "operator",
          new Date().toISOString(),
          "",
          100,
          "[]",
          "unsigned",
          "frobnicated"
        )
    ).toThrow(/CHECK/);
  });
});

// ---------------------------------------------------------------------------
// VAL-LIFE-002 — draft -> enabled requires quarantine pass
// ---------------------------------------------------------------------------
describe("VAL-LIFE-002 draft->enabled requires quarantine pass", () => {
  it("rejects draft->enabled when no quarantine record exists", async () => {
    const { transitionLifecycleState, LifecycleTransitionError } =
      await importLifecycleModule();
    const id = insertSkillRow({ lifecycle_state: "draft" });
    expect(() =>
      transitionLifecycleState(db, id, "enabled", "operator", "rolling out")
    ).toThrow(LifecycleTransitionError);
  });

  it("rejects draft->enabled when quarantine is in imported stage", async () => {
    const { transitionLifecycleState } = await importLifecycleModule();
    const { upsertQuarantineRecord } = await importQuarantineModule();
    const id = insertSkillRow({ lifecycle_state: "draft" });
    upsertQuarantineRecord(db, {
      skillId: id,
      stage: "imported",
      approvalStatus: "pending",
    });
    expect(() =>
      transitionLifecycleState(db, id, "enabled", "operator", "rolling out")
    ).toThrow(/quarantine/);
  });

  it("accepts draft->enabled when quarantine is in pending_approval or enabled", async () => {
    const { transitionLifecycleState } = await importLifecycleModule();
    const { upsertQuarantineRecord } = await importQuarantineModule();
    const id = insertSkillRow({ lifecycle_state: "draft" });
    upsertQuarantineRecord(db, {
      skillId: id,
      stage: "pending_approval",
      approvalStatus: "pending",
    });
    const result = transitionLifecycleState(
      db,
      id,
      "enabled",
      "operator",
      "ready to roll out"
    );
    expect(result.lifecycle_state).toBe("enabled");
    expect(result.previous_state).toBe("draft");
  });

  it("rejects draft->enabled when quarantine is in rejected", async () => {
    const { transitionLifecycleState, LifecycleTransitionError } =
      await importLifecycleModule();
    const { upsertQuarantineRecord } = await importQuarantineModule();
    const id = insertSkillRow({ lifecycle_state: "draft" });
    upsertQuarantineRecord(db, {
      skillId: id,
      stage: "rejected",
      approvalStatus: "rejected",
      rejectionReason: "policy",
    });
    expect(() =>
      transitionLifecycleState(db, id, "enabled", "operator", "rolling out")
    ).toThrow(LifecycleTransitionError);
  });
});

// ---------------------------------------------------------------------------
// VAL-LIFE-003 — enabled -> deprecated requires reason
// ---------------------------------------------------------------------------
describe("VAL-LIFE-003 enabled->deprecated requires reason", () => {
  it("rejects enabled->deprecated when reason is empty", async () => {
    const { transitionLifecycleState, LifecycleTransitionError } =
      await importLifecycleModule();
    const id = insertSkillRow({ lifecycle_state: "enabled" });
    expect(() =>
      transitionLifecycleState(db, id, "deprecated", "operator", "")
    ).toThrow(LifecycleTransitionError);
  });

  it("rejects enabled->deprecated when reason is whitespace only", async () => {
    const { transitionLifecycleState, LifecycleTransitionError } =
      await importLifecycleModule();
    const id = insertSkillRow({ lifecycle_state: "enabled" });
    expect(() =>
      transitionLifecycleState(db, id, "deprecated", "operator", "    ")
    ).toThrow(LifecycleTransitionError);
  });

  it("accepts enabled->deprecated when reason is non-empty", async () => {
    const { transitionLifecycleState } = await importLifecycleModule();
    const id = insertSkillRow({ lifecycle_state: "enabled" });
    const result = transitionLifecycleState(
      db,
      id,
      "deprecated",
      "operator",
      "superseded by v2"
    );
    expect(result.lifecycle_state).toBe("deprecated");
    expect(result.previous_state).toBe("enabled");
    expect(result.audit.reason).toBe("superseded by v2");
    expect(result.audit.from_state).toBe("enabled");
    expect(result.audit.to_state).toBe("deprecated");
  });
});

// ---------------------------------------------------------------------------
// VAL-LIFE-004 — deprecated -> retired checks active dependents
// ---------------------------------------------------------------------------
describe("VAL-LIFE-004 deprecated->retired checks active dependents", () => {
  it("rejects deprecated->retired when dependents exist", async () => {
    const { transitionLifecycleState, addSkillDependency, LifecycleTransitionError } =
      await importLifecycleModule();
    const id = insertSkillRow({ lifecycle_state: "deprecated" });
    addSkillDependency(db, {
      skillId: id,
      dependentAgentId: "agent-1",
      skillVersion: "1.0.0",
      registeredBy: "operator",
    });
    expect(() =>
      transitionLifecycleState(db, id, "retired", "operator", "shutting down")
    ).toThrow(LifecycleTransitionError);
  });

  it("rejection message lists dependent agent IDs", async () => {
    const { transitionLifecycleState, addSkillDependency } =
      await importLifecycleModule();
    const id = insertSkillRow({ lifecycle_state: "deprecated" });
    addSkillDependency(db, {
      skillId: id,
      dependentAgentId: "agent-1",
      skillVersion: "1.0.0",
      registeredBy: "operator",
    });
    addSkillDependency(db, {
      skillId: id,
      dependentAgentId: "agent-2",
      skillVersion: "1.0.0",
      registeredBy: "operator",
    });
    let captured: unknown;
    try {
      transitionLifecycleState(db, id, "retired", "operator", "shutting down");
    } catch (err) {
      captured = err;
    }
    expect(String(captured)).toMatch(/agent-1/);
    expect(String(captured)).toMatch(/agent-2/);
  });

  it("accepts deprecated->retired when no dependents are registered", async () => {
    const { transitionLifecycleState } = await importLifecycleModule();
    const id = insertSkillRow({ lifecycle_state: "deprecated" });
    const result = transitionLifecycleState(
      db,
      id,
      "retired",
      "operator",
      "no consumers"
    );
    expect(result.lifecycle_state).toBe("retired");
    expect(result.previous_state).toBe("deprecated");
  });
});

// ---------------------------------------------------------------------------
// VAL-LIFE-005 — retired is terminal
// ---------------------------------------------------------------------------
describe("VAL-LIFE-005 retired is terminal", () => {
  it("rejects retired->draft", async () => {
    const { transitionLifecycleState, LifecycleTransitionError } =
      await importLifecycleModule();
    const id = insertSkillRow({ lifecycle_state: "retired" });
    expect(() =>
      transitionLifecycleState(db, id, "draft", "operator", "revert")
    ).toThrow(LifecycleTransitionError);
  });

  it("rejects retired->enabled", async () => {
    const { transitionLifecycleState, LifecycleTransitionError } =
      await importLifecycleModule();
    const id = insertSkillRow({ lifecycle_state: "retired" });
    expect(() =>
      transitionLifecycleState(db, id, "enabled", "operator", "revert")
    ).toThrow(LifecycleTransitionError);
  });

  it("rejects retired->deprecated", async () => {
    const { transitionLifecycleState, LifecycleTransitionError } =
      await importLifecycleModule();
    const id = insertSkillRow({ lifecycle_state: "retired" });
    expect(() =>
      transitionLifecycleState(db, id, "deprecated", "operator", "marker")
    ).toThrow(LifecycleTransitionError);
  });
});

// ---------------------------------------------------------------------------
// VAL-LIFE-006 — audit entry on every state change
// ---------------------------------------------------------------------------
describe("VAL-LIFE-006 audit entry on every state change", () => {
  it("transitionLifecycleState writes skill_lifecycle_audit row with required fields", async () => {
    const { transitionLifecycleState, getLifecycleAuditTrail } =
      await importLifecycleModule();
    const id = insertSkillRow({ lifecycle_state: "draft" });
    const { upsertQuarantineRecord } = await importQuarantineModule();
    upsertQuarantineRecord(db, {
      skillId: id,
      stage: "enabled",
      approvalStatus: "approved",
    });
    transitionLifecycleState(db, id, "enabled", "alice", "ready");
    const audit = getLifecycleAuditTrail(db, { skillId: id });
    expect(audit).toHaveLength(1);
    const row = audit[0];
    expect(row.skill_id).toBe(id);
    expect(row.from_state).toBe("draft");
    expect(row.to_state).toBe("enabled");
    expect(row.actor).toBe("alice");
    expect(row.reason).toBe("ready");
    expect(typeof row.transitioned_at).toBe("string");
    expect(row.transitioned_at.length).toBeGreaterThan(0);
  });

  it("every subsequent transition appends a new audit row (immutable history)", async () => {
    const { transitionLifecycleState, getLifecycleAuditTrail } =
      await importLifecycleModule();
    const id = insertSkillRow({ lifecycle_state: "draft" });
    const { upsertQuarantineRecord } = await importQuarantineModule();
    upsertQuarantineRecord(db, {
      skillId: id,
      stage: "enabled",
      approvalStatus: "approved",
    });
    transitionLifecycleState(db, id, "enabled", "alice", "enable");
    transitionLifecycleState(db, id, "deprecated", "alice", "deprecate");

    const audit = getLifecycleAuditTrail(db, { skillId: id });
    expect(audit).toHaveLength(2);
    // getLifecycleAuditTrail returns most-recent-first by default.
    expect(audit[0].to_state).toBe("deprecated");
    expect(audit[1].to_state).toBe("enabled");
    expect(audit[0].from_state).toBe("enabled");
    expect(audit[1].from_state).toBe("draft");
  });

  it("audit_entries also records a skill_lifecycle_transitioned row", async () => {
    const { transitionLifecycleState } = await importLifecycleModule();
    const id = insertSkillRow({ lifecycle_state: "draft" });
    const { upsertQuarantineRecord } = await importQuarantineModule();
    upsertQuarantineRecord(db, {
      skillId: id,
      stage: "enabled",
      approvalStatus: "approved",
    });
    transitionLifecycleState(db, id, "enabled", "alice", "go");
    const rows = db
      .prepare(
        `SELECT metadata_json FROM audit_entries
          WHERE event_type = 'skill_lifecycle_transitioned'
            AND entity_id = ?`
      )
      .all(`skill:${id}`) as Array<{ metadata_json: string }>;
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const meta = JSON.parse(rows[0].metadata_json) as Record<string, unknown>;
    expect(meta["from_state"]).toBe("draft");
    expect(meta["to_state"]).toBe("enabled");
    expect(meta["actor"]).toBe("alice");
    expect(meta["reason"]).toBe("go");
  });
});

// ---------------------------------------------------------------------------
// VAL-LIFE-007 — deprecation generates notifications for dependents
// ---------------------------------------------------------------------------
describe("VAL-LIFE-007 deprecation notifications", () => {
  it("deprecated transition creates N audit_entries for N dependents", async () => {
    const { transitionLifecycleState, addSkillDependency } =
      await importLifecycleModule();
    const id = insertSkillRow({ lifecycle_state: "enabled" });
    addSkillDependency(db, {
      skillId: id,
      dependentAgentId: "agent-1",
      skillVersion: "1.0.0",
      registeredBy: "operator",
    });
    addSkillDependency(db, {
      skillId: id,
      dependentAgentId: "agent-2",
      skillVersion: "1.0.0",
      registeredBy: "operator",
    });
    transitionLifecycleState(
      db,
      id,
      "deprecated",
      "operator",
      "superseded by v2"
    );
    const notifyRows = db
      .prepare(
        `SELECT metadata_json FROM audit_entries
          WHERE event_type = 'skill_lifecycle_deprecated'
          ORDER BY rowid ASC`
      )
      .all() as Array<{ metadata_json: string }>;
    expect(notifyRows.length).toBe(2);
    const meta1 = JSON.parse(notifyRows[0].metadata_json) as Record<string, unknown>;
    const meta2 = JSON.parse(notifyRows[1].metadata_json) as Record<string, unknown>;
    const agents = new Set([
      meta1["dependent_agent_id"],
      meta2["dependent_agent_id"],
    ]);
    expect(agents.has("agent-1")).toBe(true);
    expect(agents.has("agent-2")).toBe(true);
    expect(meta1["reason"]).toBe("superseded by v2");
  });
});

// ---------------------------------------------------------------------------
// VAL-LIFE-008 — NOC endpoint surfaces deprecated skills
// ---------------------------------------------------------------------------
describe("VAL-LIFE-008 NOC endpoint surfaces deprecated skills", () => {
  it("NOC response includes a deprecated skills panel with dependent_count + warning_level", async () => {
    const { transitionLifecycleState, addSkillDependency } =
      await importLifecycleModule();
    const id = insertSkillRow({
      name: "noc-deprecated-skill",
      lifecycle_state: "enabled",
    });
    addSkillDependency(db, {
      skillId: id,
      dependentAgentId: "agent-a",
      skillVersion: "1.0.0",
      registeredBy: "operator",
    });
    addSkillDependency(db, {
      skillId: id,
      dependentAgentId: "agent-b",
      skillVersion: "1.0.0",
      registeredBy: "operator",
    });
    transitionLifecycleState(
      db,
      id,
      "deprecated",
      "operator",
      "rolling out successor"
    );

    const { GET } = await import("../../../app/api/operations/noc/route");
    const req = new Request(
      "http://localhost:3000/api/operations/noc?window=24h&workspace=all"
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    const deprecatedSkills = json?.skills?.deprecated ?? json?.deprecated_skills ?? null;
    expect(deprecatedSkills).toBeTruthy();
    expect(Array.isArray(deprecatedSkills) || typeof deprecatedSkills === "object").toBe(true);

    const list = Array.isArray(deprecatedSkills) ? deprecatedSkills : Object.values(deprecatedSkills);
    const found = (list as Array<Record<string, unknown>>).find(
      (s) => s["skill_id"] === id || s["name"] === "noc-deprecated-skill"
    );
    expect(found).toBeTruthy();
    expect(found!["dependent_count"]).toBe(2);
    expect(found!["warning_level"]).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// VAL-LIFE-009 — getDependents returns agents and versions
// ---------------------------------------------------------------------------
describe("VAL-LIFE-009 getDependents returns agent + version", () => {
  it("returns all dependent rows with populated agent_id and skill_version", async () => {
    const { addSkillDependency, getDependents } = await importLifecycleModule();
    const id = insertSkillRow({ name: "deps-skill" });
    addSkillDependency(db, {
      skillId: id,
      dependentAgentId: "agent-1",
      skillVersion: "1.0.0",
      registeredBy: "operator",
    });
    addSkillDependency(db, {
      skillId: id,
      dependentAgentId: "agent-2",
      skillVersion: "1.5.2",
      registeredBy: "operator",
    });
    const deps = getDependents(db, id);
    expect(deps).toHaveLength(2);
    const ids = deps.map((d) => d.dependent_agent_id).sort();
    expect(ids).toEqual(["agent-1", "agent-2"]);
    for (const dep of deps) {
      expect(typeof dep.dependent_agent_id).toBe("string");
      expect(typeof dep.skill_version).toBe("string");
      expect(dep.skill_id).toBe(id);
    }
  });

  it("returns empty array when no dependents are registered", async () => {
    const { getDependents } = await importLifecycleModule();
    const id = insertSkillRow({ name: "no-deps" });
    const deps = getDependents(db, id);
    expect(deps).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// VAL-LIFE-010 — lifecycle_state interacts with dispatch
// ---------------------------------------------------------------------------
describe("VAL-LIFE-010 dispatch respects lifecycle_state", () => {
  it("returns denied for a deprecated skill with dispatch_status=enabled", async () => {
    const { lookupSkillContract } = await import(
      "@/lib/dispatch/skill-lookup"
    );
    insertSkillRow({
      name: "deprecated-but-enabled",
      dispatch_status: "enabled",
      completeness_pct: 100,
      lifecycle_state: "deprecated",
    });
    const result = lookupSkillContract(db, "deprecated-but-enabled");
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("denied");
    if (result!.kind !== "denied") throw new Error("narrow");
    expect(result!.reason).toMatch(/lifecycle|deprecated/i);
  });

  it("returns hit for a skill with lifecycle_state=enabled and dispatch_status=enabled", async () => {
    const { lookupSkillContract } = await import(
      "@/lib/dispatch/skill-lookup"
    );
    insertSkillRow({
      name: "fully-enabled",
      dispatch_status: "enabled",
      completeness_pct: 100,
      lifecycle_state: "enabled",
    });
    const result = lookupSkillContract(db, "fully-enabled");
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("hit");
  });

  it("returns denied for a draft skill even when dispatch_status=enabled", async () => {
    const { lookupSkillContract } = await import(
      "@/lib/dispatch/skill-lookup"
    );
    insertSkillRow({
      name: "draft-but-flipped",
      dispatch_status: "enabled",
      completeness_pct: 100,
      lifecycle_state: "draft",
    });
    const result = lookupSkillContract(db, "draft-but-flipped");
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("denied");
  });

  it("returns denied for a retired skill even when dispatch_status=enabled", async () => {
    const { lookupSkillContract } = await import(
      "@/lib/dispatch/skill-lookup"
    );
    insertSkillRow({
      name: "retired-but-flipped",
      dispatch_status: "enabled",
      completeness_pct: 100,
      lifecycle_state: "retired",
    });
    const result = lookupSkillContract(db, "retired-but-flipped");
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("denied");
  });
});

// ---------------------------------------------------------------------------
// VAL-CROSS-005 — Migration v14 backfills lifecycle_state from dispatch_status
// ---------------------------------------------------------------------------
describe("VAL-CROSS-005 migration v14 backfills lifecycle_state", () => {
  it("stamps user_version=14 after initSchema", () => {
    const version = db.pragma("user_version", { simple: true }) as number;
    expect(version).toBeGreaterThanOrEqual(14);
  });

  it("skill_registry has lifecycle_state column after migration", () => {
    const columns = db
      .prepare(`PRAGMA table_info(skill_registry)`)
      .all() as Array<{ name: string }>;
    const names = columns.map((c) => c.name);
    expect(names).toContain("lifecycle_state");
  });

  it("skill_dependencies table exists with required columns", () => {
    const table = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='skill_dependencies'`
      )
      .get() as { name: string } | undefined;
    expect(table).toBeTruthy();
    const cols = db
      .prepare(`PRAGMA table_info(skill_dependencies)`)
      .all() as Array<{ name: string }>;
    const names = cols.map((c) => c.name);
    expect(names).toContain("dependent_agent_id");
    expect(names).toContain("skill_id");
    expect(names).toContain("skill_version");
  });

  it("skill_lifecycle_audit table exists with required columns", () => {
    const table = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='skill_lifecycle_audit'`
      )
      .get() as { name: string } | undefined;
    expect(table).toBeTruthy();
    const cols = db
      .prepare(`PRAGMA table_info(skill_lifecycle_audit)`)
      .all() as Array<{ name: string }>;
    const names = cols.map((c) => c.name);
    expect(names).toContain("skill_id");
    expect(names).toContain("from_state");
    expect(names).toContain("to_state");
    expect(names).toContain("actor");
    expect(names).toContain("reason");
    expect(names).toContain("transitioned_at");
  });
});

// ---------------------------------------------------------------------------
// API: POST /api/skills/lifecycle
// ---------------------------------------------------------------------------
describe("POST /api/skills/lifecycle", () => {
  it("400 when skill_id is missing", async () => {
    const { POST } = await import(
      "../../../app/api/skills/lifecycle/route"
    );
    const req = new Request(
      "https://memroos.example.com/api/skills/lifecycle",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to_state: "enabled", reason: "go" }),
      }
    );
    const res = await POST(req);
    expect([400, 401, 403]).toContain(res.status);
  });

  it("401 / 403 without operator auth", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "secret-key";
    const id = insertSkillRow({ lifecycle_state: "draft" });
    const { POST } = await import(
      "../../../app/api/skills/lifecycle/route"
    );
    const req = new Request(
      "https://memroos.example.com/api/skills/lifecycle",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          skill_id: id,
          to_state: "enabled",
          actor: "alice",
          reason: "x",
        }),
      }
    );
    const res = await POST(req);
    expect([401, 403]).toContain(res.status);
  });

  it("200 — successful transition returns transition + audit metadata", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "secret-key";
    const id = insertSkillRow({ lifecycle_state: "draft" });
    const { upsertQuarantineRecord } = await importQuarantineModule();
    upsertQuarantineRecord(db, {
      skillId: id,
      stage: "enabled",
      approvalStatus: "approved",
    });
    const { POST } = await import(
      "../../../app/api/skills/lifecycle/route"
    );
    const req = new Request(
      "https://memroos.example.com/api/skills/lifecycle",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer secret-key",
        },
        body: JSON.stringify({
          skill_id: id,
          to_state: "enabled",
          actor: "alice",
          reason: "rolling out",
        }),
      }
    );
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.skill_id).toBe(id);
    expect(json.lifecycle_state).toBe("enabled");
    expect(json.previous_state).toBe("draft");
    expect(json.audit.actor).toBe("alice");
  });
});

describe("lifecycle dependency helpers", () => {
  it("removeSkillDependency deletes an existing dependency row", async () => {
    const { addSkillDependency, removeSkillDependency, getDependents } =
      await importLifecycleModule();
    const id = insertSkillRow({ lifecycle_state: "enabled" });
    addSkillDependency(db, {
      skillId: id,
      dependentAgentId: "agent-remove",
      skillVersion: "1.0.0",
      registeredBy: "alice",
    });
    expect(getDependents(db, id)).toHaveLength(1);
    expect(removeSkillDependency(db, id, "agent-remove")).toBe(true);
    expect(removeSkillDependency(db, id, "agent-remove")).toBe(false);
    expect(getDependents(db, id)).toHaveLength(0);
  });

  it("listDeprecatedSkills derives warning levels from dependent counts", async () => {
    const { transitionLifecycleState, addSkillDependency, listDeprecatedSkills } =
      await importLifecycleModule();
    const { upsertQuarantineRecord } = await importQuarantineModule();
    const id = insertSkillRow({ lifecycle_state: "draft" });
    upsertQuarantineRecord(db, {
      skillId: id,
      stage: "enabled",
      approvalStatus: "approved",
    });
    transitionLifecycleState(db, id, "enabled", "alice", "enable");
    transitionLifecycleState(db, id, "deprecated", "alice", "sunset");
    for (let i = 0; i < 5; i += 1) {
      addSkillDependency(db, {
        skillId: id,
        dependentAgentId: `agent-${i}`,
        skillVersion: "1.0.0",
        registeredBy: "alice",
      });
    }
    const entries = listDeprecatedSkills(db, { limit: 10 });
    const entry = entries.find((row) => row.skill_id === id);
    expect(entry?.warning_level).toBe("critical");
    expect(entry?.dependent_count).toBe(5);
  });

  it("addSkillDependency rejects invalid parameters", async () => {
    const { addSkillDependency, LifecycleTransitionError } = await importLifecycleModule();
    expect(() =>
      addSkillDependency(db, {
        skillId: 0,
        dependentAgentId: "agent",
        skillVersion: "1.0.0",
        registeredBy: "alice",
      })
    ).toThrow(LifecycleTransitionError);
  });

  it("getLifecycleAuditTrail returns empty for invalid skill ids", async () => {
    const { getLifecycleAuditTrail } = await importLifecycleModule();
    expect(getLifecycleAuditTrail(db, { skillId: 0 })).toEqual([]);
  });
});

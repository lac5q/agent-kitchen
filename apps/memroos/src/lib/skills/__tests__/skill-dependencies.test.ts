// @vitest-environment node
/**
 * VAL-SKILL-034 — Dependency views distinguish trust from observation provenance.
 *
 * Covers:
 *   - registry row appears as trusted config provenance
 *   - skill_version_pins rows appear as trusted pin provenance
 *   - skill_dependencies rows appear as trusted pin provenance
 *   - skill_reports appear as observation provenance (is_observation=true, is_trusted=false)
 *   - registered_agents capability name appears as observation provenance
 *   - forward_consistency reports mismatches when pin/listings disagree with registry
 *   - lifecycle audit rows show as trusted lifecycle provenance
 *   - reverse view lists dependents by agent / skill
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

const TMP_ROOT = path.join(os.tmpdir(), `skill-deps-${crypto.randomUUID()}`);

async function loadDb() {
  const root = path.join(TMP_ROOT, `db-${crypto.randomUUID()}`);
  fs.mkdirSync(root, { recursive: true });
  process.env["MEMROOS_ROOT"] = root;
  process.env["SQLITE_DB_PATH"] = path.join(root, "test.db");
  vi.resetModules();
  const { getDb, closeDb } = await import("@/lib/db");
  const { initSchema } = await import("@/lib/db-schema");
  const db = getDb();
  initSchema(db);
  return { db, closeDb };
}


// Helper to ensure the FK on registered_agents(id) holds for both pin
// and capability test inserts. Inserted as a no-op when the row exists.
function insertRegisteredAgent(id: string) {
  db.prepare(
    `INSERT OR IGNORE INTO registered_agents (id, name, role, platform, protocol) VALUES (?, ?, 'agent', 'memroos', 'local')`
  ).run(id, `agent-${id}`);
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
  } catch {}
  delete process.env["MEMROOS_ROOT"];
  delete process.env["SQLITE_DB_PATH"];
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
});

function insertRegistry(opts: { id?: number; name?: string; version?: string; content_hash?: string; raw_body?: string } = {}) {
  const id = opts.id ?? 1;
  db.prepare(
    `INSERT INTO skill_registry (id, name, source_harness, version, content_hash, raw_body, imported_by, dispatch_status, completeness_pct, lifecycle_state)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    opts.name ?? "dep-skill",
    "claude",
    opts.version ?? "1.0.0",
    opts.content_hash ?? "0".repeat(64),
    opts.raw_body ?? "## body",
    "operator",
    "enabled",
    100,
    "enabled"
  );
  return id;
}

function insertPin(agentId: string, skillName: string, version: string, contentHash: string, skillId: number | null) {
  insertRegisteredAgent(agentId);
  db.prepare(
    `INSERT INTO skill_version_pins (agent_id, skill_name, current_version, current_content_hash, skill_id, actor, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(agentId, skillName, version, contentHash, skillId, "operator", new Date().toISOString(), new Date().toISOString());
}

function insertDep(skillId: number, agent: string, version: string) {
  db.prepare(
    `INSERT INTO skill_dependencies (skill_id, dependent_agent_id, skill_version, registered_by) VALUES (?, ?, ?, ?)`
  ).run(skillId, agent, version, "operator");
}

function insertReport(skillId: number, agent: string, name?: string) {
  insertRegisteredAgent(agent);
  db.prepare(
    `INSERT INTO agent_skill_reports (agent_id, skill_id, action, metadata, reported_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(agent, String(skillId), "report", JSON.stringify({ observed_state: "observed" }), new Date().toISOString());
}

function insertLifecycleRow(skillId: number, fromState: string, toState: string) {
  db.prepare(
    `INSERT INTO skill_lifecycle_audit (skill_id, from_state, to_state, actor, reason, transitioned_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(skillId, fromState, toState, "operator", "test", new Date().toISOString());
}

function insertListing(skillId: number, version: string, deprecated = 0) {
  db.prepare(
    `INSERT INTO skill_marketplace (id, skill_id, name, description, author, tags, version, changelog, rating, review_count, download_count, category, published_at, updated_at, deprecated)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, ?)`
  ).run(`m-${skillId}`, String(skillId), "dep-skill", "desc", "ops", "[]", version, "", "general", new Date().toISOString(), new Date().toISOString(), deprecated);
}

describe("VAL-SKILL-034 dependency view — trust provenance", () => {
  it("includes the registry row as config provenance", async () => {
    const { getSkillDependencyView } = await import("../skill-dependencies");
    const id = insertRegistry({ id: 11, name: "config-only", version: "1.0.0", content_hash: "a".repeat(64) });
    const view = getSkillDependencyView(db, id);
    expect(view.skill_name).toBe("config-only");
    expect(view.trusted.find((r) => r.provenance === "config")).toBeTruthy();
    expect(view.trusted.find((r) => r.provenance === "config")?.is_trusted).toBe(true);
  });

  it("includes version pins as trusted pin provenance", async () => {
    const { getSkillDependencyView } = await import("../skill-dependencies");
    const id = insertRegistry({ id: 12, name: "with-pin", version: "2.0.0", content_hash: "b".repeat(64) });
    insertPin("agent-x", "with-pin", "2.0.0", "b".repeat(64), id);

    const view = getSkillDependencyView(db, id);
    const pinRows = view.trusted.filter((r) => r.provenance === "pin");
    expect(pinRows.length).toBeGreaterThanOrEqual(1);
    expect(pinRows[0].is_trusted).toBe(true);
    expect(pinRows[0].is_observation).toBe(false);
  });

  it("reports forward_consistency mismatch when pin version disagrees with registry", async () => {
    const { getSkillDependencyView } = await import("../skill-dependencies");
    const id = insertRegistry({ id: 13, name: "stale-pin", version: "3.0.0", content_hash: "c".repeat(64) });
    insertPin("agent-y", "stale-pin", "2.0.0", "c".repeat(64), id); // version mismatch

    const view = getSkillDependencyView(db, id);
    expect(view.forward_consistency.ok).toBe(false);
    expect(view.forward_consistency.mismatches.some((m) => m.includes("version"))).toBe(true);
  });

  it("includes skill_dependencies rows as pin provenance", async () => {
    const { getSkillDependencyView } = await import("../skill-dependencies");
    const id = insertRegistry({ id: 14, name: "deps-skill" });
    insertDep(id, "agent-z", "1.0.0");

    const view = getSkillDependencyView(db, id);
    const pinRows = view.trusted.filter((r) => r.provenance === "pin" && r.scope.agent_id === "agent-z");
    expect(pinRows.length).toBeGreaterThanOrEqual(1);
  });

  it("includes lifecycle audit rows as trusted lifecycle provenance", async () => {
    const { getSkillDependencyView } = await import("../skill-dependencies");
    const id = insertRegistry({ id: 15, name: "lifecycle-skill" });
    insertLifecycleRow(id, "draft", "enabled");

    const view = getSkillDependencyView(db, id);
    const lc = view.trusted.find((r) => r.provenance === "lifecycle");
    expect(lc).toBeTruthy();
    expect(lc?.reason).toContain("draft -> enabled");
  });

  it("includes marketplace listings as trusted marketplace provenance", async () => {
    const { getSkillDependencyView } = await import("../skill-dependencies");
    const id = insertRegistry({ id: 16, name: "market-skill", version: "5.0.0", content_hash: "d".repeat(64) });
    insertListing(id, "5.0.0");

    const view = getSkillDependencyView(db, id);
    const marketplace = view.trusted.find((r) => r.provenance === "marketplace");
    expect(marketplace).toBeTruthy();
    expect(view.forward_consistency.ok).toBe(true);
  });

  it("marketplace version mismatch flagged as forward inconsistency", async () => {
    const { getSkillDependencyView } = await import("../skill-dependencies");
    const id = insertRegistry({ id: 17, name: "outdated-listing", version: "5.0.0", content_hash: "e".repeat(64) });
    insertListing(id, "4.0.0");

    const view = getSkillDependencyView(db, id);
    expect(view.forward_consistency.ok).toBe(false);
    expect(view.forward_consistency.mismatches.some((m) => m.includes("marketplace"))).toBe(true);
  });
});

describe("VAL-SKILL-034 dependency view — observation provenance", () => {
  it("reports from skill_reports are observation-only (cannot elevate trust)", async () => {
    const { getSkillDependencyView } = await import("../skill-dependencies");
    const id = insertRegistry({ id: 21, name: "report-only" });
    insertReport(id, "observer-1", "report-only");

    const view = getSkillDependencyView(db, id);
    const report = view.observed.find((r) => r.provenance === "report");
    expect(report).toBeTruthy();
    expect(report?.is_observation).toBe(true);
    expect(report?.is_trusted).toBe(false);
    expect(view.trusted.find((r) => r.provenance === "report")).toBeUndefined();
  });

  it("matches agent reports stored by skill name as observation provenance", async () => {
    const { getSkillDependencyView } = await import("../skill-dependencies");
    const id = insertRegistry({ id: 24, name: "named-report" });
    insertRegisteredAgent("observer-name");
    db.prepare(
      `INSERT INTO agent_skill_reports (agent_id, skill_id, action, metadata, reported_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(
      "observer-name",
      "named-report",
      "report",
      JSON.stringify({ observed_state: "name-match" }),
      new Date().toISOString()
    );

    const view = getSkillDependencyView(db, id);
    const report = view.observed.find((r) => r.provenance === "report");
    expect(report).toMatchObject({
      is_observation: true,
      is_trusted: false,
      scope: { agent_id: "observer-name", skill_id: id, skill_name: "named-report" },
    });
  });

  it("agent capability names referencing the skill are observation-only", async () => {
    const { getSkillDependencyView } = await import("../skill-dependencies");
    const id = insertRegistry({ id: 22, name: "capability-skill" });
    insertRegisteredAgent('agent-cap');
    db.prepare(
      `INSERT INTO agent_capabilities (agent_id, capability_id, name, description, tags, created_at, updated_at)
       VALUES ('agent-cap', 'capability-skill', 'capability-skill', 'matches skill name', '[]', ?, ?)`
    ).run(new Date().toISOString(), new Date().toISOString());

    const view = getSkillDependencyView(db, id);
    const cap = view.observed.find((r) => r.provenance === "capability");
    expect(cap).toBeTruthy();
    expect(cap?.is_trusted).toBe(false);
    expect(cap?.is_observation).toBe(true);
  });

  it("capability-only observation does not promote trust (registry row unchanged after capability insert)", async () => {
    const { getSkillDependencyView } = await import("../skill-dependencies");
    // Insert at lifecycle_state=enabled (matches dispatch_status=enabled).
    // The point of this test is that inserting an agent_capability row
    // referencing the skill name does NOT mutate the registry row or
    // add a trusted provenance row.
    const id = insertRegistry({ id: 23, name: "no-promote" });
    const before = db.prepare(`SELECT lifecycle_state, completeness_pct FROM skill_registry WHERE id = ?`).get(id) as { lifecycle_state: string; completeness_pct: number };
    insertRegisteredAgent('agent-cap-2');
    db.prepare(
      `INSERT INTO agent_capabilities (agent_id, capability_id, name, description, tags, created_at, updated_at)
       VALUES ('agent-cap-2', 'no-promote', 'no-promote', '', '[]', ?, ?)`
    ).run(new Date().toISOString(), new Date().toISOString());
    const view = getSkillDependencyView(db, id);
    const after = db.prepare(`SELECT lifecycle_state, completeness_pct FROM skill_registry WHERE id = ?`).get(id) as { lifecycle_state: string; completeness_pct: number };
    expect(after.lifecycle_state).toBe(before.lifecycle_state);
    expect(after.completeness_pct).toBe(before.completeness_pct);
    expect(view.observed.some((r) => r.provenance === "capability")).toBe(true);
    expect(view.trusted.some((r) => r.provenance === "capability")).toBe(false);
  });
});

describe("VAL-SKILL-034 reverse dependency view", () => {
  it("lists agent dependents via pins", async () => {
    const { getReverseDependencyView } = await import("../skill-dependencies");
    const id = insertRegistry({ id: 31, name: "rev-pin-skill" });
    insertPin("agent-a", "rev-pin-skill", "1.0.0", "f".repeat(64), id);

    const reverse = getReverseDependencyView(db, id);
    const trusted = reverse.find((r) => r.dependent_id === "agent-a" && r.is_trusted);
    expect(trusted).toBeTruthy();
    expect(trusted?.via).toBe("pin");
  });

  it("lists observation dependents from capability (is_trusted=false)", async () => {
    const { getReverseDependencyView } = await import("../skill-dependencies");
    const id = insertRegistry({ id: 32, name: "rev-cap-skill" });
    insertRegisteredAgent('agent-cap-3');
    db.prepare(
      `INSERT INTO agent_capabilities (agent_id, capability_id, name, description, tags, created_at, updated_at)
       VALUES ('agent-cap-3', 'rev-cap-skill', 'rev-cap-skill', '', '[]', ?, ?)`
    ).run(new Date().toISOString(), new Date().toISOString());

    const reverse = getReverseDependencyView(db, id);
    const obs = reverse.find((r) => r.dependent_id === "agent-cap-3");
    expect(obs).toBeTruthy();
    expect(obs?.is_observation).toBe(true);
    expect(obs?.is_trusted).toBe(false);
  });

  it("returns empty list for unknown skill_id", async () => {
    const { getSkillDependencyView } = await import("../skill-dependencies");
    const view = getSkillDependencyView(db, 999999);
    expect(view.trusted).toEqual([]);
    expect(view.observed).toEqual([]);
    expect(view.forward_consistency.ok).toBe(false);
  });

  it("lists skill dependents discovered from preconditions", async () => {
    const { getReverseDependencyView } = await import("../skill-dependencies");
    const id = insertRegistry({ id: 33, name: "rev-config-skill" });
    db.prepare(
      `INSERT INTO skill_registry (id, name, source_harness, version, content_hash, raw_body, imported_by, dispatch_status, completeness_pct, lifecycle_state, preconditions)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      34,
      "dependent-skill",
      "claude",
      "1.0.0",
      "a".repeat(64),
      "## body",
      "operator",
      "enabled",
      100,
      "enabled",
      "requires rev-config-skill"
    );

    const reverse = getReverseDependencyView(db, id);
    const skillDependent = reverse.find(
      (row) => row.dependent_kind === "skill" && row.dependent_id === "34"
    );
    expect(skillDependent?.via).toBe("config");
    expect(skillDependent?.is_trusted).toBe(true);
  });
});

describe("VAL-SKILL-034 dependency view — safe fallbacks and summaries", () => {
  it("returns the missing-registry shape when the database read fails", async () => {
    const { getSkillDependencyView } = await import("../skill-dependencies");
    const throwingDb = {
      prepare() {
        throw new Error("schema unavailable");
      },
    };

    const view = getSkillDependencyView(throwingDb as never, 404);
    expect(view).toMatchObject({
      skill_id: 404,
      skill_name: "",
      trusted: [],
      observed: [],
      forward_consistency: {
        ok: false,
        mismatches: ["registry row missing"],
      },
    });
  });

  it("summarizes dependency views with stable counts", async () => {
    const { getSkillDependencyView, summarizeDependencyView } = await import("../skill-dependencies");
    const id = insertRegistry({ id: 41, name: "summary-skill" });
    insertReport(id, "summary-observer");

    const summary = summarizeDependencyView(getSkillDependencyView(db, id));
    expect(summary).toMatchObject({
      skill_id: id,
      skill_name: "summary-skill",
      source_harness: "claude",
      trusted_count: 1,
      observed_count: 1,
      unresolved_count: 0,
    });
  });

  it("includes valid dispatch receipts while skipping malformed payload matches", async () => {
    const { getSkillDependencyView } = await import("../skill-dependencies");
    const id = insertRegistry({ id: 42, name: "dispatch-skill", version: "1.2.3", content_hash: "4".repeat(64) });
    db.exec("ALTER TABLE hive_delegations ADD COLUMN started_at TEXT");
    db.prepare(
      `INSERT INTO hive_delegations(task_id, from_agent, to_agent, task_summary, status, context_id, checkpoint, result, started_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "task-dispatch-bad",
      "agent-dispatch",
      "operator",
      "bad dispatch payload",
      "completed",
      "ctx-dispatch",
      `{"skill_id":${id}`,
      `{"skill_id":${id}`,
      "2026-07-18T10:00:00.000Z"
    );
    db.prepare(
      `INSERT INTO hive_delegations(task_id, from_agent, to_agent, task_summary, status, context_id, checkpoint, result, started_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "task-dispatch-good",
      "agent-dispatch",
      "operator",
      "good dispatch payload",
      "completed",
      "ctx-dispatch",
      "{}",
      JSON.stringify({ skill_id: id }),
      "2026-07-18T10:05:00.000Z"
    );

    const view = getSkillDependencyView(db, id);
    const dispatchRows = view.trusted.filter((row) => row.provenance === "dispatch");

    expect(dispatchRows).toHaveLength(1);
    expect(dispatchRows[0]).toMatchObject({
      scope: { agent_id: "agent-dispatch", skill_id: id },
      identity: { version: "1.2.3", content_hash: "4".repeat(64) },
      status: "observed",
    });
  });
});

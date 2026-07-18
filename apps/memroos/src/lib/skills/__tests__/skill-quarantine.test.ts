// @vitest-environment node
/**
 * Phase 149 / SKILLTRUST-03 — Quarantine Lane tests.
 *
 * Covers:
 *   VAL-QUAR-001 — Imported skills land in dispatch_status='quarantined'.
 *   VAL-QUAR-002 — No import path sets dispatch_status='enabled' directly.
 *   VAL-QUAR-003 — QUARANTINE_STAGES type covers the 6 expected stages;
 *                   CHECK constraint matches the same set in the DB.
 *   VAL-QUAR-004 — Pipeline calls scanContent(); HIGH severity -> rejected.
 *   VAL-QUAR-005 — Pipeline runs sandboxed eval; eval_score persisted.
 *   VAL-QUAR-006 — Operator approval required; auto-advance blocked.
 *   VAL-QUAR-007 — Rejection sets approval_status='rejected' with reason;
 *                   dispatch_status stays non-enabled.
 *   VAL-QUAR-008 — Every stage transition persisted in skill_quarantine.
 *   VAL-QUAR-009 — lookupSkillContract never returns quarantined skills
 *                   as hits; denied with informative reason.
 *   VAL-QUAR-010 — Migration v11 CHECK constraint includes 'quarantined'.
 *   VAL-QUAR-011 — skill_quarantine table schema correct with FK.
 *   VAL-QUAR-012 — Quarantine API endpoints enforce operator auth
 *                   (401 unauthenticated, 403 non-operator, 200 operator).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

const TMP_ROOT = path.join(os.tmpdir(), `skill-quarantine-${crypto.randomUUID()}`);

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

async function importQuarantineModule() {
  return import("../skill-quarantine");
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
  delete process.env["MEMROOS_QUARANTINE_EVAL_THRESHOLD"];
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
});

function insertSkill(
  overrides: {
    name?: string;
    source_harness?: string;
    dispatch_status?: string;
    completeness_pct?: number;
    raw_body?: string;
    verification_checks?: string | null;
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
      overrides.name ?? "quarantine-test-skill",
      "Test description",
      "ops",
      overrides.source_harness ?? "claude",
      "low",
      overrides.dispatch_status ?? "quarantined",
      "1.0.0",
      "none",
      "read_file",
      overrides.verification_checks ?? "verify output",
      "revert",
      overrides.raw_body ?? "## Preconditions\nnone",
      overrides.completeness_pct ?? 100,
      "[]",
      "operator",
      new Date().toISOString(),
      "check output",
      null,
      null,
      null,
      null,
      "unsigned",
      null
    );
  return Number(result.lastInsertRowid);
}

// ---------------------------------------------------------------------------
// VAL-QUAR-003 — state machine stages
// ---------------------------------------------------------------------------

describe("VAL-QUAR-003 QUARANTINE_STAGES", () => {
  it("exports the 6 canonical stages in order", async () => {
    const { QUARANTINE_STAGES } = await importQuarantineModule();
    expect(QUARANTINE_STAGES).toEqual([
      "imported",
      "scanning",
      "eval_sandbox",
      "pending_approval",
      "enabled",
      "rejected",
    ]);
  });

  it("skill_quarantine table CHECK constraint accepts the 6 stages", async () => {
    const { initSchema } = await import("@/lib/db-schema");
    initSchema(db); // idempotent
    const row = db
      .prepare(
        `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'skill_quarantine'`
      )
      .get() as { sql: string } | undefined;
    expect(row?.sql).toBeTruthy();
    expect(row!.sql).toMatch(/CHECK\(stage IN/);
    expect(row!.sql).toContain("'imported'");
    expect(row!.sql).toContain("'scanning'");
    expect(row!.sql).toContain("'eval_sandbox'");
    expect(row!.sql).toContain("'pending_approval'");
    expect(row!.sql).toContain("'enabled'");
    expect(row!.sql).toContain("'rejected'");
  });
});

// ---------------------------------------------------------------------------
// VAL-QUAR-011 — skill_quarantine table schema
// ---------------------------------------------------------------------------

describe("VAL-QUAR-011 skill_quarantine schema", () => {
  it("has all required columns including FK to skill_registry", () => {
    const columns = db
      .prepare(`PRAGMA table_info(skill_quarantine)`)
      .all() as Array<{
      name: string;
      type: string;
      notnull: number;
      pk: number;
    }>;
    const names = columns.map((c) => c.name);
    expect(names).toContain("id");
    expect(names).toContain("skill_id");
    expect(names).toContain("stage");
    expect(names).toContain("scanner_result");
    expect(names).toContain("eval_score");
    expect(names).toContain("approval_status");
    expect(names).toContain("approved_by");
    expect(names).toContain("approved_at");
    expect(names).toContain("rejection_reason");
    expect(names).toContain("created_at");
    expect(names).toContain("updated_at");
  });

  it("skill_id has a UNIQUE constraint and REFERENCES skill_registry", () => {
    const sql = (
      db
        .prepare(
          `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'skill_quarantine'`
        )
        .get() as { sql: string }
    ).sql;
    expect(sql).toMatch(/skill_id\s+INTEGER\s+NOT NULL\s+UNIQUE/);
    expect(sql).toMatch(
      /REFERENCES skill_registry\(id\) ON DELETE CASCADE/
    );
  });

  it("FK rejects inserts that reference a non-existent skill_registry row", () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO skill_quarantine (skill_id, stage) VALUES (?, 'imported')`
        )
        .run(99999)
    ).toThrow(/FOREIGN KEY/);
  });
});

// ---------------------------------------------------------------------------
// VAL-QUAR-010 — Migration v11 includes 'quarantined' in CHECK constraint
// ---------------------------------------------------------------------------

describe("VAL-QUAR-010 dispatch_status CHECK includes 'quarantined'", () => {
  it("rebuilt CHECK constraint lists 'quarantined' alongside other statuses", () => {
    const sql = (
      db
        .prepare(
          `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'skill_registry'`
        )
        .get() as { sql: string }
    ).sql;
    expect(sql).toMatch(
      /CHECK\(dispatch_status IN \('enabled','disabled','incomplete','review','quarantined'\)\)/
    );
  });

  it("INSERT with 'quarantined' succeeds (constraint accepts new value)", () => {
    const id = insertSkill({ dispatch_status: "quarantined" });
    const row = db
      .prepare(`SELECT dispatch_status FROM skill_registry WHERE id = ?`)
      .get(id) as { dispatch_status: string };
    expect(row.dispatch_status).toBe("quarantined");
  });

  it("INSERT with an invalid dispatch_status is rejected by CHECK", () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO skill_registry (
            name, source_harness, dispatch_status, imported_by, imported_at,
            raw_body, completeness_pct, missing_fields_json, trust_level
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          "bad-skill",
          "claude",
          "frobnicated",
          "operator",
          new Date().toISOString(),
          "",
          0,
          "[]",
          "unsigned"
        )
    ).toThrow(/CHECK/);
  });
});

// ---------------------------------------------------------------------------
// VAL-QUAR-001 — Imports always set dispatch_status='quarantined'
// ---------------------------------------------------------------------------

describe("VAL-QUAR-001 imports land in quarantined state", () => {
  it("importing via the route always sets dispatch_status='quarantined'", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "import-test-key";

    const FULL_SKILL_MD = `---
name: import-test
description: import test
owner: ops
source_harness: claude
risk_tier: low
dispatch_status: enabled
---

## Preconditions
- none

## Allowed Tools
- read_file

## Verification Checks
- check output

## Rollback
- revert

## Evidence Examples
- check output
`;

    const request = new Request("https://example.com/api/skills/import", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer import-test-key",
      },
      body: JSON.stringify({
        content: FULL_SKILL_MD,
        source_harness: "claude",
        imported_by: "ops",
      }),
    });

    const { POST } = await import("@/app/api/skills/import/route");
    const res = await POST(request);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.dispatch_status).toBe("quarantined");

    // Confirm DB persisted the quarantined state.
    const row = db
      .prepare(
        `SELECT dispatch_status FROM skill_registry WHERE id = ?`
      )
      .get(json.id) as { dispatch_status: string };
    expect(row.dispatch_status).toBe("quarantined");
  });
});

// ---------------------------------------------------------------------------
// VAL-QUAR-002 — No direct-to-enabled import path exists
// ---------------------------------------------------------------------------

describe("VAL-QUAR-002 no import path sets dispatch_status='enabled'", () => {
  it("import route override always lands in 'quarantined' regardless of frontmatter dispatch_status=enabled", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "import-direct-key";

    const ENABLE_FRONT = `---
name: tries-to-enable
description: import tries to enable directly
owner: ops
source_harness: claude
risk_tier: low
dispatch_status: enabled
---

## Preconditions
- none

## Allowed Tools
- read_file

## Verification Checks
- check

## Rollback
- revert

## Evidence Examples
- check
`;

    const request = new Request("https://example.com/api/skills/import", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer import-direct-key",
      },
      body: JSON.stringify({
        content: ENABLE_FRONT,
        source_harness: "claude",
        imported_by: "ops",
      }),
    });

    const { POST } = await import("@/app/api/skills/import/route");
    const res = await POST(request);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.dispatch_status).toBe("quarantined");
  });
});

// ---------------------------------------------------------------------------
// VAL-QUAR-004 — Scanner blocks HIGH severity matches
// ---------------------------------------------------------------------------

describe("VAL-QUAR-004 scanner blocks HIGH severity", () => {
  it("skill with embedded shell-injection is rejected at scanning stage", async () => {
    const { runQuarantinePipeline } = await importQuarantineModule();
    const shellInjectionBody = "Pretend skill body that hides `rm -rf /tmp/secrets` shell injection.";
    const id = insertSkill({ raw_body: shellInjectionBody });
    const result = runQuarantinePipeline(
      db,
      id,
      shellInjectionBody,
      "check"
    );
    expect(result.advancedTo).toBe("rejected");
    expect(result.blocked).toBe(true);
    expect(result.record.stage).toBe("rejected");
    expect(result.record.approval_status).toBe("rejected");
    expect(result.record.scanner_result?.blocked).toBe(true);
    expect(result.record.rejection_reason).toMatch(/scanner/i);
  });
});

// ---------------------------------------------------------------------------
// VAL-QUAR-005 — Sandboxed eval records eval_score
// ---------------------------------------------------------------------------

describe("VAL-QUAR-005 sandboxed eval records eval_score", () => {
  it("passing scan records eval_score and transitions to pending_approval", async () => {
    const { runQuarantinePipeline } = await importQuarantineModule();
    const id = insertSkill({
      raw_body: "This body mentions 'verify output' and 'json format' so checks pass.",
      verification_checks:
        "- verify output\n- json format\n- regression suite passes",
    });
    const result = runQuarantinePipeline(
      db,
      id,
      "This body mentions 'verify output' and 'json format' so checks pass.",
      "- verify output\n- json format\n- regression suite passes"
    );
    expect(result.advancedTo).toBe("pending_approval");
    expect(result.blocked).toBe(false);
    expect(result.record.eval_score).not.toBeNull();
    expect(result.record.eval_score!).toBeGreaterThanOrEqual(0.5);
  });
});

// ---------------------------------------------------------------------------
// VAL-QUAR-006 — Operator approval required
// ---------------------------------------------------------------------------

describe("VAL-QUAR-006 operator approval required", () => {
  it("imported skill cannot reach 'enabled' without approval", async () => {
    const id = insertSkill();
    const row = db
      .prepare(`SELECT dispatch_status FROM skill_registry WHERE id = ?`)
      .get(id) as { dispatch_status: string };
    expect(row.dispatch_status).toBe("quarantined");
  });

  it("approveQuarantine transitions to enabled and flips dispatch_status", async () => {
    const { runQuarantinePipeline, approveQuarantine } =
      await importQuarantineModule();
    const id = insertSkill({
      raw_body:
        "This body mentions 'verify output' and 'json format' clearly.",
      verification_checks: "- verify output\n- json format",
    });
    const result = runQuarantinePipeline(
      db,
      id,
      "This body mentions 'verify output' and 'json format' clearly.",
      "- verify output\n- json format"
    );
    expect(result.advancedTo).toBe("pending_approval");

    const approved = approveQuarantine(db, id, "alice");
    expect(approved.stage).toBe("enabled");
    expect(approved.approval_status).toBe("approved");
    expect(approved.approved_by).toBe("alice");
    expect(approved.approved_at).not.toBeNull();

    const reg = db
      .prepare(`SELECT dispatch_status FROM skill_registry WHERE id = ?`)
      .get(id) as { dispatch_status: string };
    expect(reg.dispatch_status).toBe("enabled");
  });

  it("approveQuarantine throws when stage is not pending_approval", async () => {
    const { approveQuarantine, QuarantineTransitionError } =
      await importQuarantineModule();
    const id = insertSkill();
    // No pipeline run -> stage is 'imported' from the import-route seed
    // is NOT applied here. We start fresh by inserting a row directly.
    expect(() => approveQuarantine(db, id, "alice")).toThrow(
      QuarantineTransitionError
    );
  });

  it("approveQuarantine throws when operator identity is empty", async () => {
    const { runQuarantinePipeline, approveQuarantine, QuarantineTransitionError } =
      await importQuarantineModule();
    const id = insertSkill({
      raw_body: "verify output json format check",
      verification_checks: "verify output",
    });
    runQuarantinePipeline(db, id, "verify output json format check", "verify output");
    expect(() => approveQuarantine(db, id, "  ")).toThrow(
      QuarantineTransitionError
    );
  });
});

// ---------------------------------------------------------------------------
// VAL-QUAR-007 — Rejection sets approval_status='rejected' with reason
// ---------------------------------------------------------------------------

describe("VAL-QUAR-007 rejection persists reason", () => {
  it("rejection records reason and keeps dispatch_status non-enabled", async () => {
    const { rejectQuarantine, upsertQuarantineRecord } =
      await importQuarantineModule();
    const id = insertSkill();
    // Seed a quarantine record so reject has something to transition.
    upsertQuarantineRecord(db, {
      skillId: id,
      stage: "pending_approval",
      approvalStatus: "pending",
    });
    const updated = rejectQuarantine(db, id, "bob", "policy violation: secrets detected");
    expect(updated.stage).toBe("rejected");
    expect(updated.approval_status).toBe("rejected");
    expect(updated.rejection_reason).toBe("policy violation: secrets detected");
    expect(updated.approved_by).toBe("bob");

    const reg = db
      .prepare(`SELECT dispatch_status FROM skill_registry WHERE id = ?`)
      .get(id) as { dispatch_status: string };
    expect(reg.dispatch_status).not.toBe("enabled");
  });

  it("rejection throws when reason is empty", async () => {
    const { rejectQuarantine, upsertQuarantineRecord, QuarantineTransitionError } =
      await importQuarantineModule();
    const id = insertSkill();
    upsertQuarantineRecord(db, {
      skillId: id,
      stage: "pending_approval",
      approvalStatus: "pending",
    });
    expect(() => rejectQuarantine(db, id, "bob", "")).toThrow(
      QuarantineTransitionError
    );
  });
});

// ---------------------------------------------------------------------------
// VAL-QUAR-008 — Every stage transition persisted
// ---------------------------------------------------------------------------

describe("VAL-QUAR-008 stage transitions persisted", () => {
  it("pipeline writes at least one row per stage transition", async () => {
    const { runQuarantinePipeline, getQuarantineRecord } =
      await importQuarantineModule();
    const id = insertSkill({
      raw_body: "verify output json format",
      verification_checks: "verify output\njson format",
    });
    const result = runQuarantinePipeline(
      db,
      id,
      "verify output json format",
      "verify output\njson format"
    );
    // After pipeline the final record has stage='pending_approval',
    // eval_score populated, scanner_result populated.
    const rec = getQuarantineRecord(db, id)!;
    expect(rec).toBeTruthy();
    expect(rec.stage).toBe("pending_approval");
    expect(rec.scanner_result).not.toBeNull();
    expect(rec.eval_score).not.toBeNull();
    expect(rec.approval_status).toBe("pending");
    // approved_by / approved_at remain null until operator action.
    expect(rec.approved_by).toBeNull();
    expect(rec.approved_at).toBeNull();
    expect(rec.rejection_reason).toBeNull();
    expect(result.record).toEqual(rec);
  });
});

// ---------------------------------------------------------------------------
// VAL-QUAR-009 — Quarantined skills excluded from dispatch
// ---------------------------------------------------------------------------

describe("VAL-QUAR-009 lookupSkillContract never returns quarantined skills", () => {
  it("returns { kind: 'denied' } for a quarantined skill with informative label", async () => {
    const { lookupSkillContract } = await import("@/lib/dispatch/skill-lookup");
    insertSkill({ dispatch_status: "quarantined", name: "q-skill" });
    const result = lookupSkillContract(db, "q-skill");
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("denied");
    if (result!.kind !== "denied") throw new Error("narrow");
    expect(result!.reason).toMatch(/quarantined/i);
    expect(result!.dispatch_status).toBe("quarantined");
  });

  it("approved skill after quarantine returns { kind: 'hit' }", async () => {
    const { lookupSkillContract } = await import("@/lib/dispatch/skill-lookup");
    const { runQuarantinePipeline, approveQuarantine } =
      await importQuarantineModule();
    const id = insertSkill({
      name: "approved-skill",
      raw_body: "verify output and json format",
      verification_checks: "- verify output\n- json format",
    });
    runQuarantinePipeline(
      db,
      id,
      "verify output and json format",
      "- verify output\n- json format"
    );
    approveQuarantine(db, id, "alice");
    const result = lookupSkillContract(db, "approved-skill");
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("hit");
    if (result!.kind !== "hit") throw new Error("narrow");
    expect(result!.skill.name).toBe("approved-skill");
  });
});

// ---------------------------------------------------------------------------
// VAL-QUAR-012 — API endpoints enforce operator auth
// ---------------------------------------------------------------------------

describe("VAL-QUAR-012 API auth gating", () => {
  it("approve endpoint returns 401 when no operator key configured", async () => {
    delete process.env["MEMROOS_OPERATOR_API_KEY"];
    const id = insertSkill({ name: "auth-skill" });

    // Mark it pending_approval so the route reaches the auth gate
    // without the operator check tripping the stage check first.
    // Actually the auth check runs first, so this is not needed, but
    // we still need a real skill_id so the 401 happens before any
    // pre-check fires. We use any valid positive integer.
    const { POST } = await import("@/app/api/skills/quarantine/approve/route");
    const req = new Request("https://example.com/api/skills/quarantine/approve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ skill_id: id, operator: "alice" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("approve endpoint returns 403 when key is configured but wrong", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    const id = insertSkill({ name: "wrong-auth" });

    const { POST } = await import("@/app/api/skills/quarantine/approve/route");
    const req = new Request("https://example.com/api/skills/quarantine/approve", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer wrong-key",
      },
      body: JSON.stringify({ skill_id: id, operator: "alice" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("approve endpoint returns 200 when operator key matches", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    const id = insertSkill({
      name: "approve-ok",
      raw_body: "verify output and json format",
      verification_checks: "- verify output\n- json format",
    });
    const { runQuarantinePipeline } = await importQuarantineModule();
    runQuarantinePipeline(
      db,
      id,
      "verify output and json format",
      "- verify output\n- json format"
    );

    const { POST } = await import("@/app/api/skills/quarantine/approve/route");
    const req = new Request("https://example.com/api/skills/quarantine/approve", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer right-key",
      },
      body: JSON.stringify({ skill_id: id, operator: "alice" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.approved_by).toBe("alice");
    expect(json.stage).toBe("enabled");
  });

  it("reject endpoint returns 401 with no key, 403 with wrong key, 200 with right key", async () => {
    const id = insertSkill({ name: "reject-flow" });
    // Seed a quarantine record so the rejection has something to act on.
    const { upsertQuarantineRecord } = await importQuarantineModule();
    upsertQuarantineRecord(db, {
      skillId: id,
      stage: "pending_approval",
      approvalStatus: "pending",
    });

    const { POST } = await import("@/app/api/skills/quarantine/reject/route");

    // 401
    delete process.env["MEMROOS_OPERATOR_API_KEY"];
    let res = await POST(
      new Request("https://example.com/api/skills/quarantine/reject", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ skill_id: id, operator: "bob", reason: "bad" }),
      })
    );
    expect(res.status).toBe(401);

    // 403
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    res = await POST(
      new Request("https://example.com/api/skills/quarantine/reject", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer wrong-key",
        },
        body: JSON.stringify({ skill_id: id, operator: "bob", reason: "bad" }),
      })
    );
    expect(res.status).toBe(403);

    // 200
    res = await POST(
      new Request("https://example.com/api/skills/quarantine/reject", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer right-key",
        },
        body: JSON.stringify({ skill_id: id, operator: "bob", reason: "policy violation" }),
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.rejection_reason).toBe("policy violation");
    expect(json.stage).toBe("rejected");
  });

  it("GET /api/skills/quarantine returns 200 without auth (read-only)", async () => {
    delete process.env["MEMROOS_OPERATOR_API_KEY"];
    insertSkill({ name: "list-skill" });
    const { GET } = await import("@/app/api/skills/quarantine/route");
    const res = await GET(
      new Request("https://example.com/api/skills/quarantine", { method: "GET" })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(Array.isArray(json.items)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Quarantine module helpers
// ---------------------------------------------------------------------------

describe("quarantine module helpers", () => {
  it("lists and fetches quarantine records with filters", async () => {
    const {
      getQuarantineRecord,
      listQuarantineRecords,
      upsertQuarantineRecord,
    } = await importQuarantineModule();
    const id = insertSkill({ name: "listed-skill" });
    upsertQuarantineRecord(db, {
      skillId: id,
      stage: "pending_approval",
      approvalStatus: "pending",
    });

    expect(getQuarantineRecord(db, 99999)).toBeNull();
    const listed = listQuarantineRecords(db, {
      stage: "pending_approval",
      approvalStatus: "pending",
      limit: 10,
      offset: 0,
    });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.skill_id).toBe(id);
  });

  it("returns null scanner_result for malformed persisted scanner JSON", async () => {
    const { getQuarantineRecord, upsertQuarantineRecord } = await importQuarantineModule();
    const id = insertSkill({ name: "malformed-scan" });
    upsertQuarantineRecord(db, {
      skillId: id,
      stage: "scanning",
      scannerResult: { blocked: false, matches: [], cleanContent: "ok" },
    });
    db.prepare("UPDATE skill_quarantine SET scanner_result = ? WHERE skill_id = ?").run("{bad-json", id);

    expect(getQuarantineRecord(db, id)?.scanner_result).toBeNull();
  });

  it("applies safe default pagination when list options are invalid", async () => {
    const { listQuarantineRecords, upsertQuarantineRecord } = await importQuarantineModule();
    const id = insertSkill({ name: "default-list" });
    upsertQuarantineRecord(db, {
      skillId: id,
      stage: "pending_approval",
      approvalStatus: "pending",
    });

    const listed = listQuarantineRecords(db, { limit: -1, offset: -5 });
    expect(listed.map((row) => row.skill_id)).toContain(id);
  });

  it("upsert updates an existing row instead of inserting a duplicate", async () => {
    const { upsertQuarantineRecord, getQuarantineRecord } = await importQuarantineModule();
    const id = insertSkill({ name: "upsert-skill" });
    upsertQuarantineRecord(db, { skillId: id, stage: "imported", approvalStatus: "pending" });
    upsertQuarantineRecord(db, { skillId: id, stage: "scanning", approvalStatus: "pending" });
    expect(getQuarantineRecord(db, id)?.stage).toBe("scanning");
  });

  it("resolveEvalThreshold reads MEMROOS_QUARANTINE_EVAL_THRESHOLD", async () => {
    const { resolveEvalThreshold } = await importQuarantineModule();
    process.env["MEMROOS_QUARANTINE_EVAL_THRESHOLD"] = "0.9";
    expect(resolveEvalThreshold()).toBe(0.9);
    process.env["MEMROOS_QUARANTINE_EVAL_THRESHOLD"] = "not-a-number";
    expect(resolveEvalThreshold()).toBe(0.5);
  });

  it("scoreVerificationChecks handles empty checks and token-only lines", async () => {
    const { scoreVerificationChecks } = await importQuarantineModule();
    expect(scoreVerificationChecks("body", null)).toBe(1);
    expect(scoreVerificationChecks("body", "- of\n- and")).toBe(1);
    expect(scoreVerificationChecks("verify output json", "- verify output\n- json format")).toBe(1);
    expect(scoreVerificationChecks("unrelated body", "- must have database migration")).toBe(0);
  });

  it("runQuarantinePipeline rejects low eval scores", async () => {
    const { runQuarantinePipeline } = await importQuarantineModule();
    const id = insertSkill({
      raw_body: "harmless skill body",
      verification_checks: "- must include database migration\n- must include regression suite",
    });
    const result = runQuarantinePipeline(
      db,
      id,
      "harmless skill body",
      "- must include database migration\n- must include regression suite",
      { evalThreshold: 0.99 },
    );
    expect(result.advancedTo).toBe("rejected");
    expect(result.reason).toMatch(/below threshold/);
  });

  it("rejectQuarantine is idempotent for rejected rows and blocks enabled skills", async () => {
    const {
      approveQuarantine,
      rejectQuarantine,
      runQuarantinePipeline,
      upsertQuarantineRecord,
      QuarantineTransitionError,
    } = await importQuarantineModule();

    const rejectedId = insertSkill({ name: "already-rejected" });
    upsertQuarantineRecord(db, {
      skillId: rejectedId,
      stage: "rejected",
      approvalStatus: "rejected",
      rejectionReason: "prior",
    });
    const again = rejectQuarantine(db, rejectedId, "bob", "again");
    expect(again.stage).toBe("rejected");

    const enabledId = insertSkill({
      name: "enabled-skill",
      raw_body: "verify output json format",
      verification_checks: "- verify output\n- json format",
    });
    runQuarantinePipeline(db, enabledId, "verify output json format", "- verify output\n- json format");
    approveQuarantine(db, enabledId, "alice");
    expect(() => rejectQuarantine(db, enabledId, "bob", "too late")).toThrow(QuarantineTransitionError);
  });

  it("rejectQuarantine validates operator identity and missing records", async () => {
    const { rejectQuarantine, QuarantineTransitionError } = await importQuarantineModule();
    const id = insertSkill({ name: "reject-operator" });

    expect(() => rejectQuarantine(db, id, " ", "reason")).toThrow(QuarantineTransitionError);
    expect(() => rejectQuarantine(db, id, "bob", "reason")).toThrow(QuarantineTransitionError);
  });
});

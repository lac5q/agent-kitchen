// @vitest-environment node
/**
 * Route tests for POST /api/skills/quarantine/approve and /reject
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

const TMP_ROOT = path.join(
  os.tmpdir(),
  `skill-quarantine-approve-reject-${crypto.randomUUID()}`
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

function insertSkill(
  db: import("better-sqlite3").Database,
  overrides: { name?: string; dispatch_status?: string } = {}
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
      overrides.name ?? "quarantine-approve-skill",
      "Test description",
      "ops",
      "claude",
      "low",
      overrides.dispatch_status ?? "quarantined",
      "1.0.0",
      "none",
      "read_file",
      "verify output",
      "revert",
      "verify output and json format",
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
      null
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

describe("POST /api/skills/quarantine/approve", () => {
  it("401 without operator key on non-loopback host", async () => {
    delete process.env["MEMROOS_OPERATOR_API_KEY"];
    const route = await import("../approve/route");
    const res = await route.POST(
      makePost("https://example.com/api/skills/quarantine/approve", {
        skill_id: 1,
        operator: "alice",
      })
    );
    expect(res.status).toBe(401);
  });

  it("400 for invalid JSON and missing operator", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    const route = await import("../approve/route");

    const invalidJson = await route.POST(
      new Request("https://example.com/api/skills/quarantine/approve", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer right-key",
        },
        body: "{",
      })
    );
    expect(invalidJson.status).toBe(400);

    const missingOperator = await route.POST(
      makePost(
        "https://example.com/api/skills/quarantine/approve",
        { skill_id: 1 },
        { authorization: "Bearer right-key" }
      )
    );
    expect(missingOperator.status).toBe(400);
  });

  it("404 when no quarantine record exists", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    const db = await loadDb();
    const skillId = insertSkill(db);
    const route = await import("../approve/route");

    const res = await route.POST(
      makePost(
        "https://example.com/api/skills/quarantine/approve",
        { skill_id: skillId, operator: "alice" },
        { authorization: "Bearer right-key" }
      )
    );
    expect(res.status).toBe(404);
  });

  it("409 when the quarantine stage is not pending_approval", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    const db = await loadDb();
    const skillId = insertSkill(db);
    const { upsertQuarantineRecord } = await import("@/lib/skills/skill-quarantine");
    upsertQuarantineRecord(db, {
      skillId,
      stage: "enabled",
      approvalStatus: "approved",
    });

    const route = await import("../approve/route");
    const res = await route.POST(
      makePost(
        "https://example.com/api/skills/quarantine/approve",
        { skill_id: skillId, operator: "alice" },
        { authorization: "Bearer right-key" }
      )
    );
    expect(res.status).toBe(409);
  });

  it("200 approves a pending quarantine record", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    const db = await loadDb();
    const skillId = insertSkill(db);
    const { upsertQuarantineRecord } = await import("@/lib/skills/skill-quarantine");
    upsertQuarantineRecord(db, {
      skillId,
      stage: "pending_approval",
      approvalStatus: "pending",
    });

    const route = await import("../approve/route");
    const res = await route.POST(
      makePost(
        "https://example.com/api/skills/quarantine/approve",
        { skill_id: skillId, operator: "alice" },
        { authorization: "Bearer right-key" }
      )
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.stage).toBe("enabled");
    expect(json.dispatch_status).toBe("enabled");
  });
});

describe("POST /api/skills/quarantine/reject", () => {
  it("400 when reason is missing", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    await loadDb();
    const route = await import("../reject/route");
    const res = await route.POST(
      makePost(
        "https://example.com/api/skills/quarantine/reject",
        { skill_id: 1, operator: "bob" },
        { authorization: "Bearer right-key" }
      )
    );
    expect(res.status).toBe(400);
  });

  it("409 when the skill was already approved", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    const db = await loadDb();
    const skillId = insertSkill(db);
    const { upsertQuarantineRecord } = await import("@/lib/skills/skill-quarantine");
    upsertQuarantineRecord(db, {
      skillId,
      stage: "enabled",
      approvalStatus: "approved",
    });

    const route = await import("../reject/route");
    const res = await route.POST(
      makePost(
        "https://example.com/api/skills/quarantine/reject",
        { skill_id: skillId, operator: "bob", reason: "too late" },
        { authorization: "Bearer right-key" }
      )
    );
    expect(res.status).toBe(409);
  });

  it("200 rejects a pending quarantine record", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    const db = await loadDb();
    const skillId = insertSkill(db);
    const { upsertQuarantineRecord } = await import("@/lib/skills/skill-quarantine");
    upsertQuarantineRecord(db, {
      skillId,
      stage: "pending_approval",
      approvalStatus: "pending",
    });

    const route = await import("../reject/route");
    const res = await route.POST(
      makePost(
        "https://example.com/api/skills/quarantine/reject",
        { skill_id: skillId, operator: "bob", reason: "unsafe" },
        { authorization: "Bearer right-key" }
      )
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.stage).toBe("rejected");
    expect(json.rejection_reason).toBe("unsafe");
    expect(json.dispatch_status).toBe("quarantined");
  });
});

// @vitest-environment node
/**
 * Route tests for GET/POST /api/skills/quarantine
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

const TMP_ROOT = path.join(
  os.tmpdir(),
  `skill-quarantine-route-${crypto.randomUUID()}`
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

function insertSkill(
  db: import("better-sqlite3").Database,
  overrides: {
    name?: string;
    source_harness?: string;
    dispatch_status?: string;
    raw_body?: string;
    verification_checks?: string | null;
    risk_tier?: string;
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
      overrides.name ?? "quarantine-route-skill",
      "Test description",
      "ops",
      overrides.source_harness ?? "claude",
      overrides.risk_tier ?? "low",
      overrides.dispatch_status ?? "quarantined",
      "1.0.0",
      "none",
      "read_file",
      overrides.verification_checks ?? "verify output",
      "revert",
      overrides.raw_body ?? "verify output and json format",
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

function makeGet(url: string): Request {
  return new Request(url, { method: "GET" });
}

describe("GET /api/skills/quarantine", () => {
  it("200 returns quarantine records without auth", async () => {
    const db = await loadDb();
    const skillId = insertSkill(db, { name: "listed-quarantine" });
    const { upsertQuarantineRecord } = await import("@/lib/skills/skill-quarantine");
    upsertQuarantineRecord(db, {
      skillId,
      stage: "imported",
      approvalStatus: "pending",
    });

    const route = await loadRoute();
    const res = await route.GET(makeGet("https://example.com/api/skills/quarantine"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.items.length).toBe(1);
    expect(json.items[0].skill).toMatchObject({
      name: "listed-quarantine",
      source_harness: "claude",
      risk_tier: "low",
    });
  });

  it("400 for invalid stage filter", async () => {
    await loadDb();
    const route = await loadRoute();
    const res = await route.GET(
      makeGet("https://example.com/api/skills/quarantine?stage=not-a-stage")
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Invalid stage/i);
  });

  it("400 for invalid approval_status filter", async () => {
    await loadDb();
    const route = await loadRoute();
    const res = await route.GET(
      makeGet("https://example.com/api/skills/quarantine?approval_status=maybe")
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Invalid approval_status/i);
  });

  it("filters by stage and approval_status with pagination defaults", async () => {
    const db = await loadDb();
    const skillId = insertSkill(db, { name: "filtered-skill" });
    const { upsertQuarantineRecord } = await import("@/lib/skills/skill-quarantine");
    upsertQuarantineRecord(db, {
      skillId,
      stage: "pending_approval",
      approvalStatus: "pending",
    });

    const route = await loadRoute();
    const res = await route.GET(
      makeGet(
        "https://example.com/api/skills/quarantine?stage=pending_approval&approval_status=pending&limit=999&offset=-1"
      )
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.limit).toBe(200);
    expect(json.offset).toBe(0);
    expect(json.filters.stage).toBe("pending_approval");
    expect(json.filters.approval_status).toBe("pending");
    expect(json.items).toHaveLength(1);
  });
});

describe("POST /api/skills/quarantine", () => {
  it("401 without operator key on non-loopback host", async () => {
    delete process.env["MEMROOS_OPERATOR_API_KEY"];
    const db = await loadDb();
    const skillId = insertSkill(db);
    const route = await loadRoute();
    const res = await route.POST(
      makePost("https://example.com/api/skills/quarantine", { skill_id: skillId })
    );
    expect(res.status).toBe(401);
  });

  it("403 with wrong operator key", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    const db = await loadDb();
    const skillId = insertSkill(db);
    const route = await loadRoute();
    const res = await route.POST(
      makePost(
        "https://example.com/api/skills/quarantine",
        { skill_id: skillId },
        { authorization: "Bearer wrong-key" }
      )
    );
    expect(res.status).toBe(403);
  });

  it("400 for invalid skill_id", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    await loadDb();
    const route = await loadRoute();
    const res = await route.POST(
      makePost(
        "https://example.com/api/skills/quarantine",
        { skill_id: "abc" },
        { authorization: "Bearer right-key" }
      )
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/positive integer/i);
  });

  it("404 when skill is not in registry", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    await loadDb();
    const route = await loadRoute();
    const res = await route.POST(
      makePost(
        "https://example.com/api/skills/quarantine",
        { skill_id: 99999 },
        { authorization: "Bearer right-key" }
      )
    );
    expect(res.status).toBe(404);
  });

  it("200 runs quarantine pipeline for a registry skill", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    const db = await loadDb();
    const skillId = insertSkill(db, {
      name: "pipeline-skill",
      raw_body: "verify output and json format",
      verification_checks: "- verify output\n- json format",
    });

    const route = await loadRoute();
    const res = await route.POST(
      makePost(
        "https://example.com/api/skills/quarantine",
        { skill_id: skillId },
        { authorization: "Bearer right-key" }
      )
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.skill_id).toBe(skillId);
    expect(json.name).toBe("pipeline-skill");
    expect(json.record).toBeTruthy();
    expect(json.record.stage).toBe("pending_approval");
  });

  it("200 accepts raw_body and verification_checks overrides", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    const db = await loadDb();
    const skillId = insertSkill(db, {
      name: "override-skill",
      raw_body: "old body",
      verification_checks: "old checks",
    });

    const route = await loadRoute();
    const res = await route.POST(
      makePost(
        "https://example.com/api/skills/quarantine",
        {
          skill_id: skillId,
          raw_body: "verify output and json format",
          verification_checks: "- verify output\n- json format",
        },
        { authorization: "Bearer right-key" }
      )
    );
    expect(res.status).toBe(200);
    expect((await res.json()).record.stage).toBe("pending_approval");
  });
});

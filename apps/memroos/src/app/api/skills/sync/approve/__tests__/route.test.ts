// @vitest-environment node
/**
 * Route tests for POST /api/skills/sync/approve
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

const TMP_ROOT = path.join(
  os.tmpdir(),
  `skill-sync-approve-route-${crypto.randomUUID()}`
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
    content_hash?: string;
    dispatch_status?: string;
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
      overrides.name ?? "approve-skill",
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
      100,
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

function makePost(url: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/skills/sync/approve", () => {
  it("401 without operator key on non-loopback host", async () => {
    delete process.env["MEMROOS_OPERATOR_API_KEY"];
    await loadDb();
    const route = await loadRoute();
    const res = await route.POST(
      makePost("https://example.com/api/skills/sync/approve", {
        skill_name: "x",
        source_harness: "claude",
        operator: "alice",
      })
    );
    expect(res.status).toBe(401);
  });

  it("403 with wrong operator key", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    await loadDb();
    const route = await loadRoute();
    const res = await route.POST(
      makePost(
        "https://example.com/api/skills/sync/approve",
        { skill_name: "x", source_harness: "claude", operator: "alice" },
        { authorization: "Bearer wrong-key" }
      )
    );
    expect(res.status).toBe(403);
  });

  it("400 for invalid JSON body", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    await loadDb();
    const route = await loadRoute();
    const res = await route.POST(
      new Request("https://example.com/api/skills/sync/approve", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer right-key",
        },
        body: "not-json",
      })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Invalid JSON/i);
  });

  it("400 when required fields are missing", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    await loadDb();
    const route = await loadRoute();
    const res = await route.POST(
      makePost(
        "https://example.com/api/skills/sync/approve",
        { source_harness: "claude", operator: "alice" },
        { authorization: "Bearer right-key" }
      )
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/skill_name/i);

    const missingHarness = await route.POST(
      makePost(
        "https://example.com/api/skills/sync/approve",
        { skill_name: "x", operator: "alice" },
        { authorization: "Bearer right-key" }
      )
    );
    expect(missingHarness.status).toBe(400);
    expect((await missingHarness.json()).error).toMatch(/source_harness/i);

    const missingOperator = await route.POST(
      makePost(
        "https://example.com/api/skills/sync/approve",
        { skill_name: "x", source_harness: "claude", operator: " " },
        { authorization: "Bearer right-key" }
      )
    );
    expect(missingOperator.status).toBe(400);
    expect((await missingOperator.json()).error).toMatch(/operator/i);

    const nonObject = await route.POST(
      makePost(
        "https://example.com/api/skills/sync/approve",
        [],
        { authorization: "Bearer right-key" }
      )
    );
    expect(nonObject.status).toBe(400);
    expect((await nonObject.json()).error).toBe("Body must be an object");
  });

  it("200 approves a pending sync proposal and quarantines registry row", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    const db = await loadDb();
    insertSkillRow(db, {
      name: "sync-approve-me",
      source_harness: "claude",
      content_hash: "0".repeat(64),
      dispatch_status: "enabled",
    });

    const skillSync = await import("@/lib/skills/skill-sync");
    skillSync.createImportProposal(db, {
      source_harness: "claude",
      detected: {
        skill_name: "sync-approve-me",
        source_harness: "claude",
        version: "2.0.0",
        raw_body: "## Preconditions\nupdated",
        content_hash: "1".repeat(64),
      },
      proposed_by: "scanner",
      diff_summary: "version bump",
    });

    const route = await loadRoute();
    const res = await route.POST(
      makePost(
        "https://example.com/api/skills/sync/approve",
        {
          skill_name: "sync-approve-me",
          source_harness: "claude",
          operator: "alice",
        },
        { authorization: "Bearer right-key" }
      )
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.proposal.approved_by).toBe("alice");
    expect(json.proposal.status).toBe("approved");

    const reg = db
      .prepare(
        `SELECT content_hash, version, dispatch_status FROM skill_registry
           WHERE name = 'sync-approve-me' AND source_harness = 'claude'`
      )
      .get() as { content_hash: string; version: string; dispatch_status: string };
    expect(reg.content_hash).toBe("1".repeat(64));
    expect(reg.version).toBe("2.0.0");
    expect(reg.dispatch_status).toBe("quarantined");
  });

  it("409 when no pending proposal exists", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    const db = await loadDb();
    insertSkillRow(db, {
      name: "no-proposal",
      source_harness: "claude",
      content_hash: "0".repeat(64),
    });

    const route = await loadRoute();
    const res = await route.POST(
      makePost(
        "https://example.com/api/skills/sync/approve",
        {
          skill_name: "no-proposal",
          source_harness: "claude",
          operator: "alice",
        },
        { authorization: "Bearer right-key" }
      )
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/No sync_state row|No pending proposal/i);
  });

  it("allows loopback without operator key", async () => {
    delete process.env["MEMROOS_OPERATOR_API_KEY"];
    const db = await loadDb();
    insertSkillRow(db, {
      name: "loopback-approve",
      source_harness: "claude",
      content_hash: "0".repeat(64),
    });
    const skillSync = await import("@/lib/skills/skill-sync");
    skillSync.createImportProposal(db, {
      source_harness: "claude",
      detected: {
        skill_name: "loopback-approve",
        source_harness: "claude",
        version: "2.0.0",
        raw_body: "updated",
        content_hash: "2".repeat(64),
      },
      proposed_by: "scanner",
    });

    const route = await loadRoute();
    const res = await route.POST(
      makePost("http://localhost/api/skills/sync/approve", {
        skill_name: "loopback-approve",
        source_harness: "claude",
        operator: "loopback-op",
      })
    );
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });
});

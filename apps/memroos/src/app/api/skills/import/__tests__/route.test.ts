// @vitest-environment node
/**
 * Route tests for GET/POST /api/skills/import
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

const TMP_ROOT = path.join(
  os.tmpdir(),
  `skill-import-route-${crypto.randomUUID()}`
);

const FULL_SKILL_MD = `---
name: import-route-test
description: import route test
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
  delete process.env["MEMROOS_SKILL_SIGNING_KEY"];
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

function insertRegistryRow(
  db: import("better-sqlite3").Database,
  overrides: {
    name?: string;
    source_harness?: string;
    dispatch_status?: string;
    missing_fields_json?: string;
    verification_checks?: string | null;
  } = {}
) {
  db.prepare(
    `INSERT INTO skill_registry (
      name, description, owner, source_harness, risk_tier, dispatch_status,
      version, preconditions, allowed_tools, verification_checks, rollback_behavior,
      raw_body, completeness_pct, missing_fields_json, imported_by, imported_at,
      evidence_examples, content_hash, signature, signed_by, signed_at, trust_level,
      public_key_fingerprint
    ) VALUES (
      ?, 'desc', 'ops', ?, 'low', ?,
      '1.0.0', 'none', 'read_file', ?, 'revert',
      'body', 100, ?, 'operator', ?, 'check', 'abc', NULL, NULL, NULL, 'unsigned', NULL
    )`
  ).run(
    overrides.name ?? "listed-skill",
    overrides.source_harness ?? "claude",
    overrides.dispatch_status ?? "quarantined",
    overrides.verification_checks ?? '["verify output"]',
    overrides.missing_fields_json ?? "[]",
    new Date().toISOString()
  );
}

describe("POST /api/skills/import", () => {
  it("403 without operator auth on non-loopback host", async () => {
    delete process.env["MEMROOS_OPERATOR_API_KEY"];
    await loadDb();
    const route = await loadRoute();
    const res = await route.POST(
      makePost("https://example.com/api/skills/import", {
        content: FULL_SKILL_MD,
        source_harness: "claude",
      })
    );
    expect(res.status).toBe(403);
  });

  it("400 for invalid JSON", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "import-key";
    await loadDb();
    const route = await loadRoute();
    const res = await route.POST(
      new Request("https://example.com/api/skills/import", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer import-key",
        },
        body: "{bad",
      })
    );
    expect(res.status).toBe(400);
  });

  it("400 when content is missing", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "import-key";
    await loadDb();
    const route = await loadRoute();
    const res = await route.POST(
      makePost(
        "https://example.com/api/skills/import",
        { source_harness: "claude" },
        { authorization: "Bearer import-key" }
      )
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/content is required/i);
  });

  it("400 when body is not an object or source_harness is missing", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "import-key";
    await loadDb();
    const route = await loadRoute();

    const nonObject = await route.POST(
      makePost(
        "https://example.com/api/skills/import",
        null,
        { authorization: "Bearer import-key" }
      )
    );
    expect(nonObject.status).toBe(400);
    expect((await nonObject.json()).error).toBe("Body must be an object");

    const missingHarness = await route.POST(
      makePost(
        "https://example.com/api/skills/import",
        { content: FULL_SKILL_MD },
        { authorization: "Bearer import-key" }
      )
    );
    expect(missingHarness.status).toBe(400);
    expect((await missingHarness.json()).error).toMatch(/source_harness is required/i);
  });

  it("200 imports SKILL.md and always quarantines dispatch_status", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "import-key";
    const db = await loadDb();
    const route = await loadRoute();
    const res = await route.POST(
      makePost(
        "https://example.com/api/skills/import",
        {
          content: FULL_SKILL_MD,
          source_harness: "claude",
          imported_by: "route-tester",
        },
        { authorization: "Bearer import-key" }
      )
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.name).toBe("import-route-test");
    expect(json.dispatch_status).toBe("quarantined");
    expect(json.completeness_pct).toBeGreaterThan(0);

    const row = db
      .prepare(`SELECT imported_by, dispatch_status FROM skill_registry WHERE id = ?`)
      .get(json.id) as { imported_by: string; dispatch_status: string };
    expect(row.imported_by).toBe("route-tester");
    expect(row.dispatch_status).toBe("quarantined");
  });

  it("defaults imported_by to operator when omitted", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "import-key";
    await loadDb();
    const route = await loadRoute();
    const res = await route.POST(
      makePost(
        "http://localhost/api/skills/import",
        { content: FULL_SKILL_MD, source_harness: "claude" }
      )
    );
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });
});

describe("GET /api/skills/import", () => {
  it("200 lists registry entries without auth", async () => {
    const db = await loadDb();
    insertRegistryRow(db, { name: "alpha-skill", source_harness: "claude" });
    insertRegistryRow(db, { name: "beta-skill", source_harness: "codex" });

    const route = await loadRoute();
    const res = await route.GET(makeGet("https://example.com/api/skills/import"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.items.length).toBe(2);
    expect(json.total).toBe(2);
    expect(json.limit).toBe(20);
    expect(json.offset).toBe(0);
  });

  it("filters by source_harness and dispatch_status", async () => {
    const db = await loadDb();
    insertRegistryRow(db, {
      name: "enabled-skill",
      source_harness: "claude",
      dispatch_status: "enabled",
    });
    insertRegistryRow(db, {
      name: "quarantined-skill",
      source_harness: "claude",
      dispatch_status: "quarantined",
    });

    const route = await loadRoute();
    const res = await route.GET(
      makeGet(
        "https://example.com/api/skills/import?source_harness=claude&dispatch_status=quarantined"
      )
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items).toHaveLength(1);
    expect(json.items[0].name).toBe("quarantined-skill");
  });

  it("parses verification_checks_list and tolerates bad missing_fields_json", async () => {
    const db = await loadDb();
    insertRegistryRow(db, {
      name: "parse-edge",
      missing_fields_json: "not-json",
      verification_checks: '["step one","step two"]',
    });

    const route = await loadRoute();
    const res = await route.GET(makeGet("https://example.com/api/skills/import?limit=10"));
    const json = await res.json();
    const item = json.items.find((it: { name: string }) => it.name === "parse-edge");
    expect(item.missing_fields).toEqual([]);
    expect(item.verification_checks_list).toEqual(["step one", "step two"]);
  });

  it("caps limit at 100 and handles invalid pagination", async () => {
    const db = await loadDb();
    insertRegistryRow(db);

    const route = await loadRoute();
    const res = await route.GET(
      makeGet("https://example.com/api/skills/import?limit=999&offset=-5")
    );
    const json = await res.json();
    expect(json.limit).toBe(100);
    expect(json.offset).toBe(0);
  });
});

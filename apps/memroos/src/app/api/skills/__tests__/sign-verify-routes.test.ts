// @vitest-environment node
/**
 * Phase 148 / VAL-SIGN-011 — API sign + verify endpoints.
 *
 * Covers:
 *   - POST /api/skills/sign signs a stored registry row and returns provenance
 *   - POST /api/skills/sign signs raw content without touching the DB
 *   - POST /api/skills/verify verifies a stored row against the operator key
 *   - POST /api/skills/verify detects tampering (stored hash mismatches raw_body)
 *   - POST /api/skills/verify handles inline mode (content_hash + signature)
 *   - Both endpoints require operator auth (403 without it)
 *   - sign route produces a signature that verify route accepts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

// Repoint the operator key file at a temp dir before the modules load.
const TMP_ROOT = path.join(os.tmpdir(), `memroos-sign-routes-${crypto.randomUUID()}`);
fs.mkdirSync(TMP_ROOT, { recursive: true });

beforeEach(() => {
  process.env["MEMROOS_ROOT"] = TMP_ROOT;
});

afterEach(async () => {
  delete process.env["MEMROOS_ROOT"];
  delete process.env["MEMROOS_OPERATOR_API_KEY"];
  // Force-close the DB singleton if any test opened it.
  try {
    const dbModule = await import("@/lib/db");
    dbModule.closeDb();
  } catch {
    /* ignore */
  }
  vi.resetModules();
  try {
    fs.rmSync(TMP_ROOT, { recursive: true, force: true });
    fs.mkdirSync(TMP_ROOT, { recursive: true });
  } catch {
    /* ignore */
  }
  pendingInserts.clear();
});

function newTempDb(): string {
  const dbPath = path.join(TMP_ROOT, `db-${crypto.randomUUID()}.db`);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  return dbPath;
}

async function setupDbWithRegistryRow(
  body: string,
  options: {
    name?: string;
    source_harness?: string;
    signature?: string | null;
    trust_level?: string;
    content_hash_override?: string | null;
  } = {}
) {
  const dbPath = newTempDb();
  // Defer the actual table creation to initSchema (called in loadRoutesAndDb).
  // We just stash the body+options on a process-global so loadRoutesAndDb can
  // insert the registry row after the schema is ready, avoiding double-create
  // races between our pre-population and initSchema's CREATE TABLE IF NOT EXISTS.
  const crypto = await import("crypto");
  const contentHash = crypto.createHash("sha256").update(body, "utf8").digest("hex");
  pendingInserts.set(dbPath, {
    body,
    contentHash: options.content_hash_override !== undefined
      ? options.content_hash_override
      : contentHash,
    options,
  });
  return dbPath;
}

interface PendingInsert {
  body: string;
  contentHash: string | null;
  options: {
    name?: string;
    source_harness?: string;
    signature?: string | null;
    trust_level?: string;
    content_hash_override?: string | null;
  };
}
const pendingInserts = new Map<string, PendingInsert>();

async function loadRoutesAndDb(dbPath: string) {
  process.env["SQLITE_DB_PATH"] = dbPath;
  vi.resetModules();
  const signRoute = await import("../sign/route");
  const verifyRoute = await import("../verify/route");
  const dbModule = await import("@/lib/db");
  const { getDb, closeDb } = dbModule;
  const { initSchema } = await import("@/lib/db-schema");
  const db = getDb();
  initSchema(db);

  // Insert the queued registry row now that the schema is ready.
  const pending = pendingInserts.get(dbPath);
  if (pending) {
    // Ensure all v11 signature columns exist before we touch them — running
    // initSchema may not have applied v11 in every test environment, so we
    // idempotently ALTER the table here to guarantee the columns exist.
    const existing = new Set(
      (db.prepare(`PRAGMA table_info(skill_registry)`).all() as Array<{ name: string }>).map(
        c => c.name
      )
    );
    for (const col of ["content_hash", "signature", "signed_by", "signed_at", "public_key_fingerprint"]) {
      if (!existing.has(col)) {
        try {
          db.exec(`ALTER TABLE skill_registry ADD COLUMN ${col} TEXT`);
        } catch {
          /* column exists */
        }
      }
    }
    db.prepare(`
      INSERT OR REPLACE INTO skill_registry
        (name, source_harness, risk_tier, dispatch_status, completeness_pct,
         raw_body, content_hash, signature, trust_level, imported_by, imported_at,
         signed_by, signed_at, public_key_fingerprint)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      pending.options.name ?? "api-skill",
      pending.options.source_harness ?? "claude",
      "low",
      "enabled",
      100,
      pending.body,
      pending.contentHash,
      pending.options.signature ?? null,
      pending.options.trust_level ?? "unsigned",
      "test-operator",
      "2026-01-01T00:00:00Z",
      null,
      null,
      null
    );
  }

  // Ensure the operator key file exists so verify can resolve the public key.
  const { loadOrCreateOperatorKeyPair } = await import("@/lib/skills/skill-signing");
  loadOrCreateOperatorKeyPair();

  return { signRoute, verifyRoute, getDb, closeDb };
}

function makePostRequest(body: unknown, headers: Record<string, string> = {}): Request {
  // Use a non-loopback host so the operator-auth gate actually checks the
  // API key instead of letting loopback requests through unconditionally.
  return new Request("https://memroos.example.com/api/skills/sign", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const SAMPLE_BODY = `---
name: api-skill
description: skill for api tests
owner: ops
source_harness: claude
risk_tier: low
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

describe("POST /api/skills/sign", () => {
  it("403 without operator auth", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "secret-key";
    const dbPath = await setupDbWithRegistryRow(SAMPLE_BODY);
    const { signRoute } = await loadRoutesAndDb(dbPath);
    const res = await signRoute.POST(makePostRequest({ skill_name: "api-skill" }));
    expect(res.status).toBe(403);
  });

  it("200 — signs a stored registry row and updates the DB", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "secret-key";
    const dbPath = await setupDbWithRegistryRow(SAMPLE_BODY);
    const { signRoute, getDb, closeDb } = await loadRoutesAndDb(dbPath);
    const res = await signRoute.POST(
      makePostRequest(
        { skill_name: "api-skill" },
        { authorization: "Bearer secret-key" }
      )
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.skill.name).toBe("api-skill");
    expect(json.skill.signature.length).toBeGreaterThan(0);
    expect(json.skill.public_key_fingerprint).toHaveLength(64);

    // DB now has signature populated.
    const row = getDb()
      .prepare(
        `SELECT signature, trust_level, public_key_fingerprint FROM skill_registry WHERE name = 'api-skill'`
      )
      .get();
    expect(row.signature).toBe(json.skill.signature);
    expect(row.trust_level).toBe("signed");
    closeDb();
  });

  it("200 — signs raw content without touching the DB", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "secret-key";
    const dbPath = newTempDb();
    fs.writeFileSync(dbPath, "");
    const { signRoute, closeDb } = await loadRoutesAndDb(dbPath);
    const res = await signRoute.POST(
      makePostRequest(
        { content: "raw-skill-body", source_harness: "codex" },
        { authorization: "Bearer secret-key" }
      )
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.skill.content_hash).toHaveLength(64);
    expect(json.skill.signature.length).toBeGreaterThan(0);
    expect(json.skill.public_key_fingerprint).toHaveLength(64);
    closeDb();
  });

  it("404 — unknown skill name", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "secret-key";
    const dbPath = await setupDbWithRegistryRow(SAMPLE_BODY);
    const { signRoute, closeDb } = await loadRoutesAndDb(dbPath);
    const res = await signRoute.POST(
      makePostRequest(
        { skill_name: "nope" },
        { authorization: "Bearer secret-key" }
      )
    );
    expect(res.status).toBe(404);
    closeDb();
  });

  it("400 — missing skill_name and content", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "secret-key";
    const dbPath = newTempDb();
    fs.writeFileSync(dbPath, "");
    const { signRoute, closeDb } = await loadRoutesAndDb(dbPath);
    const res = await signRoute.POST(
      makePostRequest({}, { authorization: "Bearer secret-key" })
    );
    expect(res.status).toBe(400);
    closeDb();
  });

  it("400 — invalid JSON body and non-object payloads", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "secret-key";
    const dbPath = newTempDb();
    fs.writeFileSync(dbPath, "");
    const { signRoute, closeDb } = await loadRoutesAndDb(dbPath);

    const badJson = await signRoute.POST(
      new Request("https://memroos.example.com/api/skills/sign", {
        method: "POST",
        headers: { authorization: "Bearer secret-key", "content-type": "application/json" },
        body: "not-json",
      })
    );
    expect(badJson.status).toBe(400);
    expect(await badJson.json()).toMatchObject({ ok: false, error: "Invalid JSON body" });

    const notObject = await signRoute.POST(
      makePostRequest([], { authorization: "Bearer secret-key" })
    );
    expect(notObject.status).toBe(400);
    expect(await notObject.json()).toMatchObject({ ok: false, error: "Body must be an object" });
    closeDb();
  });

  it("404 — skill_name with source_harness filter", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "secret-key";
    const dbPath = await setupDbWithRegistryRow(SAMPLE_BODY, { source_harness: "claude" });
    const { signRoute, closeDb } = await loadRoutesAndDb(dbPath);
    const res = await signRoute.POST(
      makePostRequest(
        { skill_name: "api-skill", source_harness: "codex" },
        { authorization: "Bearer secret-key" }
      )
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toContain("for harness 'codex'");
    closeDb();
  });

  it("422 — registry row missing raw_body", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "secret-key";
    const dbPath = await setupDbWithRegistryRow(SAMPLE_BODY);
    const { signRoute, getDb, closeDb } = await loadRoutesAndDb(dbPath);
    getDb().prepare(`UPDATE skill_registry SET raw_body = '' WHERE name = 'api-skill'`).run();

    const res = await signRoute.POST(
      makePostRequest(
        { skill_name: "api-skill" },
        { authorization: "Bearer secret-key" }
      )
    );
    expect(res.status).toBe(422);
    expect((await res.json()).error).toContain("no raw_body");
    closeDb();
  });
});

describe("POST /api/skills/verify", () => {
  it("403 without operator auth", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "secret-key";
    const dbPath = await setupDbWithRegistryRow(SAMPLE_BODY);
    const { verifyRoute, closeDb } = await loadRoutesAndDb(dbPath);
    const res = await verifyRoute.POST(makePostRequest({ skill_name: "api-skill" }));
    expect(res.status).toBe(403);
    closeDb();
  });

  it("200 verified=true — signs then verifies the same row", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "secret-key";
    const dbPath = await setupDbWithRegistryRow(SAMPLE_BODY);
    const { signRoute, verifyRoute, closeDb } = await loadRoutesAndDb(dbPath);
    const signRes = await signRoute.POST(
      makePostRequest(
        { skill_name: "api-skill" },
        { authorization: "Bearer secret-key" }
      )
    );
    expect(signRes.status).toBe(200);
    const verifyRes = await verifyRoute.POST(
      makePostRequest(
        { skill_name: "api-skill" },
        { authorization: "Bearer secret-key" }
      )
    );
    expect(verifyRes.status).toBe(200);
    const json = await verifyRes.json();
    expect(json.ok).toBe(true);
    expect(json.verified).toBe(true);
    expect(json.fingerprint).toHaveLength(64);
    closeDb();
  });

  it("verified=false — tamper detection via wrong stored hash", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "secret-key";
    // Pre-sign the row but then mutate content_hash to simulate tampering.
    const dbPath = await setupDbWithRegistryRow(SAMPLE_BODY);
    const { signRoute, verifyRoute, getDb, closeDb } = await loadRoutesAndDb(dbPath);
    await signRoute.POST(
      makePostRequest(
        { skill_name: "api-skill" },
        { authorization: "Bearer secret-key" }
      )
    );
    // Tamper with the stored hash so it no longer matches raw_body.
    getDb()
      .prepare(`UPDATE skill_registry SET content_hash = ? WHERE name = 'api-skill'`)
      .run("0".repeat(64));
    const verifyRes = await verifyRoute.POST(
      makePostRequest(
        { skill_name: "api-skill" },
        { authorization: "Bearer secret-key" }
      )
    );
    const json = await verifyRes.json();
    expect(json.ok).toBe(true);
    expect(json.verified).toBe(false);
    expect(json.reason).toMatch(/tamper/i);
    closeDb();
  });

  it("verified=false — inline mode with mismatched hash", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "secret-key";
    const dbPath = newTempDb();
    fs.writeFileSync(dbPath, "");
    const { verifyRoute, closeDb } = await loadRoutesAndDb(dbPath);
    const res = await verifyRoute.POST(
      makePostRequest(
        {
          content: "fresh body",
          content_hash: "0".repeat(64),
          signature: "AAAA",
        },
        { authorization: "Bearer secret-key" }
      )
    );
    const json = await res.json();
    expect(json.verified).toBe(false);
    expect(json.reason).toMatch(/tamper/i);
    closeDb();
  });

  it("verified=false — stored row with no signature returns informative reason", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "secret-key";
    const dbPath = await setupDbWithRegistryRow(SAMPLE_BODY, {
      signature: null,
      trust_level: "unsigned",
    });
    const { verifyRoute, closeDb } = await loadRoutesAndDb(dbPath);
    const res = await verifyRoute.POST(
      makePostRequest(
        { skill_name: "api-skill" },
        { authorization: "Bearer secret-key" }
      )
    );
    const json = await res.json();
    expect(json.verified).toBe(false);
    expect(json.reason).toMatch(/no signature|no content_hash/i);
    closeDb();
  });

  it("400 — invalid JSON body and non-object payloads", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "secret-key";
    const dbPath = newTempDb();
    fs.writeFileSync(dbPath, "");
    const { verifyRoute, closeDb } = await loadRoutesAndDb(dbPath);
    const badJson = await verifyRoute.POST(
      new Request("https://memroos.example.com/api/skills/verify", {
        method: "POST",
        headers: { authorization: "Bearer secret-key", "content-type": "application/json" },
        body: "not-json",
      })
    );
    expect(badJson.status).toBe(400);
    const notObject = await verifyRoute.POST(
      makePostRequest([], { authorization: "Bearer secret-key" })
    );
    expect(notObject.status).toBe(400);
    closeDb();
  });

  it("404 — stored skill_name not found", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "secret-key";
    const dbPath = newTempDb();
    fs.writeFileSync(dbPath, "");
    const { verifyRoute, closeDb } = await loadRoutesAndDb(dbPath);
    const res = await verifyRoute.POST(
      makePostRequest({ skill_name: "missing-skill" }, { authorization: "Bearer secret-key" })
    );
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.verified).toBe(false);
    expect(json.reason).toMatch(/not found/i);
    closeDb();
  });

  it("400 — inline mode missing hash/signature and invalid public_key_pem", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "secret-key";
    const dbPath = newTempDb();
    fs.writeFileSync(dbPath, "");
    const { verifyRoute, closeDb } = await loadRoutesAndDb(dbPath);
    const missingFields = await verifyRoute.POST(
      makePostRequest({ content: "only content" }, { authorization: "Bearer secret-key" })
    );
    expect(missingFields.status).toBe(400);

    const badPem = await verifyRoute.POST(
      makePostRequest(
        {
          content_hash: "a".repeat(64),
          signature: "AAAA",
          public_key_pem: "not-a-valid-pem",
        },
        { authorization: "Bearer secret-key" }
      )
    );
    expect(badPem.status).toBe(400);
    const badJson = await badPem.json();
    expect(badJson.reason).toMatch(/valid PEM/i);
    closeDb();
  });

  it("400 — missing skill_name when not using inline mode", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "secret-key";
    const dbPath = newTempDb();
    fs.writeFileSync(dbPath, "");
    const { verifyRoute, closeDb } = await loadRoutesAndDb(dbPath);
    const res = await verifyRoute.POST(
      makePostRequest({}, { authorization: "Bearer secret-key" })
    );
    expect(res.status).toBe(400);
    closeDb();
  });
});

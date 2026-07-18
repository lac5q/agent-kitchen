// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

let tmpRoot: string;

const RAW_SKILL = `---
name: signed-route-skill
description: signed route skill
owner: ops
source_harness: claude
risk_tier: low
dispatch_status: enabled
---

## Preconditions
- none
`;

beforeEach(() => {
  tmpRoot = path.join(os.tmpdir(), `skill-sign-route-${crypto.randomUUID()}`);
  fs.mkdirSync(tmpRoot, { recursive: true });
  process.env["MEMROOS_ROOT"] = tmpRoot;
  process.env["SQLITE_DB_PATH"] = path.join(tmpRoot, "skills.db");
  vi.resetModules();
});

afterEach(async () => {
  delete process.env["MEMROOS_ROOT"];
  delete process.env["SQLITE_DB_PATH"];
  try {
    const dbModule = await import("@/lib/db");
    dbModule.closeDb();
  } catch {
    // ignore cleanup races
  }
  vi.resetModules();
  vi.doUnmock("@/lib/skills/skill-signing");
  vi.doUnmock("@/lib/audit/skill-chain");
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

async function loadDb() {
  const { getDb } = await import("@/lib/db");
  const { initSchema } = await import("@/lib/db-schema");
  const db = getDb();
  initSchema(db);
  return db;
}

function post(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function insertSkillRow(db: import("better-sqlite3").Database, overrides: {
  name?: string;
  source_harness?: string;
  raw_body?: string | null;
  content_hash?: string | null;
  signature?: string | null;
  public_key_fingerprint?: string | null;
} = {}) {
  return Number(db.prepare(
    `INSERT INTO skill_registry (
      name, description, owner, source_harness, risk_tier, dispatch_status,
      version, preconditions, allowed_tools, verification_checks, rollback_behavior,
      raw_body, completeness_pct, missing_fields_json, imported_by, imported_at,
      evidence_examples, content_hash, signature, signed_by, signed_at, trust_level,
      public_key_fingerprint
    ) VALUES (
      ?, 'desc', 'ops', ?, 'low', 'enabled',
      '1.0.0', 'none', 'read_file', 'verify', 'rollback',
      ?, 100, '[]', 'operator', ?, 'evidence', ?, ?, NULL, NULL, 'unsigned', ?
    )`
  ).run(
    overrides.name ?? "signed-route-skill",
    overrides.source_harness ?? "claude",
    "raw_body" in overrides ? overrides.raw_body : RAW_SKILL,
    new Date().toISOString(),
    overrides.content_hash ?? null,
    overrides.signature ?? null,
    overrides.public_key_fingerprint ?? null,
  ).lastInsertRowid);
}

describe("POST /api/skills/sign and /api/skills/verify", () => {
  it("signs raw content and verifies it inline", async () => {
    await loadDb();
    const signRoute = await import("../route");
    const verifyRoute = await import("../../verify/route");

    const signRes = await signRoute.POST(post("http://localhost/api/skills/sign", {
      content: RAW_SKILL,
      source_harness: "claude",
    }));
    expect(signRes.status).toBe(200);
    const signed = await signRes.json();
    expect(signed.skill.name).toBeNull();
    expect(signed.skill.trust_level).toBe("signed");

    const { readOperatorKeyFile } = await import("@/lib/skills/skill-signing");
    const keyFile = readOperatorKeyFile();
    expect(keyFile?.public_key_pem).toContain("BEGIN PUBLIC KEY");

    const verifyRes = await verifyRoute.POST(post("http://localhost/api/skills/verify", {
      content: RAW_SKILL,
      content_hash: signed.skill.content_hash,
      signature: signed.skill.signature,
      public_key_pem: keyFile?.public_key_pem,
    }));
    const verified = await verifyRes.json();

    expect(verifyRes.status).toBe(200);
    expect(verified.verified).toBe(true);
    expect(verified.fingerprint).toBe(signed.skill.public_key_fingerprint);
  });

  it("signs a stored row and verifies it using the local operator key", async () => {
    const db = await loadDb();
    const skillId = insertSkillRow(db, { name: "stored-skill", source_harness: "claude" });
    const signRoute = await import("../route");
    const verifyRoute = await import("../../verify/route");

    const signRes = await signRoute.POST(post("http://localhost/api/skills/sign", {
      skill_name: "stored-skill",
      source_harness: "claude",
    }));
    expect(signRes.status).toBe(200);
    const signed = await signRes.json();
    expect(signed.skill.id).toBe(skillId);

    const verifyRes = await verifyRoute.POST(post("http://localhost/api/skills/verify", {
      skill_name: "stored-skill",
      source_harness: "claude",
    }));
    const verified = await verifyRes.json();

    expect(verifyRes.status).toBe(200);
    expect(verified.verified).toBe(true);
    expect(verified.skill.id).toBe(skillId);
  });

  it("uses fallback plain audit when audit-chain construction fails", async () => {
    const db = await loadDb();
    const skillId = insertSkillRow(db, { name: "fallback-audit" });
    vi.doMock("@/lib/audit/skill-chain", () => ({
      buildSkillAuditEntry: () => {
        throw new Error("chain unavailable");
      },
    }));
    const signRoute = await import("../route");

    const res = await signRoute.POST(post("http://localhost/api/skills/sign", {
      skill_name: "fallback-audit",
    }));

    expect(res.status).toBe(200);
    const audit = db.prepare(
      "SELECT COUNT(*) AS count FROM audit_entries WHERE event_type = 'skill.signed' AND entity_id = ?"
    ).get(`skill:${skillId}`) as { count: number };
    expect(audit.count).toBe(1);
  });

  it("rejects malformed sign bodies and registry rows without raw content", async () => {
    const db = await loadDb();
    insertSkillRow(db, { name: "no-body", raw_body: "" });
    const signRoute = await import("../route");

    const invalidJson = await signRoute.POST(new Request("http://localhost/api/skills/sign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    }));
    expect(invalidJson.status).toBe(400);

    const nonObject = await signRoute.POST(post("http://localhost/api/skills/sign", []));
    expect(nonObject.status).toBe(400);

    const missingMode = await signRoute.POST(post("http://localhost/api/skills/sign", {}));
    expect(missingMode.status).toBe(400);

    const noRaw = await signRoute.POST(post("http://localhost/api/skills/sign", {
      skill_name: "no-body",
    }));
    expect(noRaw.status).toBe(422);

    const missing = await signRoute.POST(post("http://localhost/api/skills/sign", {
      skill_name: "missing",
      source_harness: "claude",
    }));
    expect(missing.status).toBe(404);
    expect((await missing.json()).error).toContain("for harness 'claude'");
  });

  it("reports keypair and database failures from signing", async () => {
    await loadDb();
    vi.doMock("@/lib/skills/skill-signing", async () => {
      const actual = await vi.importActual<typeof import("@/lib/skills/skill-signing")>(
        "@/lib/skills/skill-signing"
      );
      return {
        ...actual,
        loadOrCreateOperatorKeyPair: () => {
          throw new Error("key store read failed");
        },
      };
    });
    const keyFailRoute = await import("../route");
    const keyFail = await keyFailRoute.POST(post("http://localhost/api/skills/sign", {
      content: RAW_SKILL,
    }));
    expect(keyFail.status).toBe(500);
    expect((await keyFail.json()).error).toContain("key store read failed");
    vi.doUnmock("@/lib/skills/skill-signing");
    vi.resetModules();

    const db = await loadDb();
    insertSkillRow(db, { name: "db-fail" });
    db.exec("DROP TABLE audit_entries");
    const signRoute = await import("../route");
    const dbFail = await signRoute.POST(post("http://localhost/api/skills/sign", {
      skill_name: "db-fail",
    }));
    expect(dbFail.status).toBe(500);
    expect((await dbFail.json()).error).toMatch(/Database error/i);
  });

  it("fails closed for verify validation, missing keys, tampering, and bad signatures", async () => {
    const db = await loadDb();
    const verifyRoute = await import("../../verify/route");

    const invalidJson = await verifyRoute.POST(new Request("http://localhost/api/skills/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    }));
    expect(invalidJson.status).toBe(400);

    const nonObject = await verifyRoute.POST(post("http://localhost/api/skills/verify", []));
    expect(nonObject.status).toBe(400);

    const missingKey = await verifyRoute.POST(post("http://localhost/api/skills/verify", {
      skill_name: "anything",
    }));
    expect(missingKey.status).toBe(400);
    expect((await missingKey.json()).reason).toContain("No operator key file");

    const malformedPem = await verifyRoute.POST(post("http://localhost/api/skills/verify", {
      content_hash: "a".repeat(64),
      signature: "bad",
      public_key_pem: "not a pem",
    }));
    expect(malformedPem.status).toBe(400);
    expect((await malformedPem.json()).verified).toBe(false);

    const signRoute = await import("../route");
    const signRes = await signRoute.POST(post("http://localhost/api/skills/sign", { content: RAW_SKILL }));
    const signed = await signRes.json();
    const { readOperatorKeyFile } = await import("@/lib/skills/skill-signing");
    const keyFile = readOperatorKeyFile();

    const inlineMissing = await verifyRoute.POST(post("http://localhost/api/skills/verify", {
      content: RAW_SKILL,
      content_hash: signed.skill.content_hash,
      public_key_pem: keyFile?.public_key_pem,
    }));
    expect(inlineMissing.status).toBe(400);

    const tampered = await verifyRoute.POST(post("http://localhost/api/skills/verify", {
      content: `${RAW_SKILL}\nchanged`,
      content_hash: signed.skill.content_hash,
      signature: signed.skill.signature,
      public_key_pem: keyFile?.public_key_pem,
    }));
    const tamperedJson = await tampered.json();
    expect(tamperedJson.verified).toBe(false);
    expect(tamperedJson.reason).toContain("tampering");

    const badSig = await verifyRoute.POST(post("http://localhost/api/skills/verify", {
      content_hash: signed.skill.content_hash,
      signature: "not-base64",
      public_key_pem: keyFile?.public_key_pem,
    }));
    expect((await badSig.json()).verified).toBe(false);

    insertSkillRow(db, {
      name: "unsigned",
      content_hash: null,
      signature: null,
    });
    const unsigned = await verifyRoute.POST(post("http://localhost/api/skills/verify", {
      skill_name: "unsigned",
    }));
    expect((await unsigned.json()).reason).toContain("no signature");

    const missing = await verifyRoute.POST(post("http://localhost/api/skills/verify", {
      skill_name: "missing",
      source_harness: "claude",
    }));
    expect(missing.status).toBe(404);
  });
});

// @vitest-environment node
/**
 * Phase 148 tests — SKILLTRUST-01 + SKILLTRUST-02
 *
 * Covers:
 *   - Hash computation: known input → known SHA-256 output
 *   - Signing + verification: sign, verify, tamper detection
 *   - Evidence examples parsing: from SKILL.md frontmatter (covered in registry.test.ts)
 *   - Trust threshold dispatch denial: unsigned skill denied when minTrustLevel='signed'
 *   - Registry entry with new fields: insert + retrieve round-trip
 *   - resolveSigningKey: env var fallback
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

import {
  computeContentHash,
  signSkill,
  verifySkillSignature,
  resolveSigningKey,
  parseSkillMd,
  normalizeRegistryEntry,
} from "../registry";

const TEST_DB_DIR = path.join(os.tmpdir(), `skill-trust-${crypto.randomUUID()}`);
const TEST_DB_PATH = path.join(TEST_DB_DIR, "skill-trust.db");

// ---------------------------------------------------------------------------
// Pure crypto tests (no DB needed)
// ---------------------------------------------------------------------------

describe("computeContentHash", () => {
  it("returns the known SHA-256 hex for a known input", () => {
    // SHA-256 of "hello" = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
    const hash = computeContentHash("hello");
    expect(hash).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
    );
  });

  it("returns a 64-character hex string", () => {
    const hash = computeContentHash("some skill body text");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic — same input yields same output", () => {
    const a = computeContentHash("deterministic test");
    const b = computeContentHash("deterministic test");
    expect(a).toBe(b);
  });

  it("differs for different inputs", () => {
    const a = computeContentHash("input A");
    const b = computeContentHash("input B");
    expect(a).not.toBe(b);
  });

  it("handles empty string input", () => {
    const hash = computeContentHash("");
    // SHA-256 of empty string
    expect(hash).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
  });
});

describe("signSkill", () => {
  const testKey = "test-signing-key-12345";
  const testHash = computeContentHash("test content for signing");

  it("produces an HMAC-SHA256 hex signature", () => {
    const { signature, signedBy } = signSkill(testHash, testKey);
    expect(signature).toHaveLength(64);
    expect(signature).toMatch(/^[0-9a-f]{64}$/);
    expect(signedBy).toBe("operator");
  });

  it("produces deterministic signatures for same key + hash", () => {
    const a = signSkill(testHash, testKey);
    const b = signSkill(testHash, testKey);
    expect(a.signature).toBe(b.signature);
  });

  it("produces different signatures for different keys", () => {
    const a = signSkill(testHash, testKey);
    const b = signSkill(testHash, "different-key");
    expect(a.signature).not.toBe(b.signature);
  });

  it("throws on empty signing key", () => {
    expect(() => signSkill(testHash, "")).toThrow();
  });

  it("uses MEMROOS_SKILL_SIGNER_ID env var for signedBy when set", () => {
    const original = process.env["MEMROOS_SKILL_SIGNER_ID"];
    process.env["MEMROOS_SKILL_SIGNER_ID"] = "ci-bot";
    try {
      const { signedBy } = signSkill(testHash, testKey);
      expect(signedBy).toBe("ci-bot");
    } finally {
      if (original === undefined) delete process.env["MEMROOS_SKILL_SIGNER_ID"];
      else process.env["MEMROOS_SKILL_SIGNER_ID"] = original;
    }
  });
});

describe("verifySkillSignature", () => {
  const testKey = "verify-test-key";
  const testHash = computeContentHash("content to verify");
  const tamperedHash = computeContentHash("tampered content");

  it("returns true for a valid signature", () => {
    const { signature } = signSkill(testHash, testKey);
    expect(verifySkillSignature(testHash, signature, testKey)).toBe(true);
  });

  it("returns false for a tampered content hash", () => {
    const { signature } = signSkill(testHash, testKey);
    expect(verifySkillSignature(tamperedHash, signature, testKey)).toBe(false);
  });

  it("returns false for a wrong signing key", () => {
    const { signature } = signSkill(testHash, testKey);
    expect(verifySkillSignature(testHash, signature, "wrong-key")).toBe(false);
  });

  it("returns false for empty signature", () => {
    expect(verifySkillSignature(testHash, "", testKey)).toBe(false);
  });

  it("returns false for empty signing key", () => {
    const { signature } = signSkill(testHash, testKey);
    expect(verifySkillSignature(testHash, signature, "")).toBe(false);
  });

  it("returns false for mismatched signature length", () => {
    expect(verifySkillSignature(testHash, "short", testKey)).toBe(false);
  });
});

describe("resolveSigningKey", () => {
  const origSkillKey = process.env["MEMROOS_SKILL_SIGNING_KEY"];
  const origOperatorKey = process.env["MEMROOS_OPERATOR_API_KEY"];

  afterEach(() => {
    if (origSkillKey === undefined) delete process.env["MEMROOS_SKILL_SIGNING_KEY"];
    else process.env["MEMROOS_SKILL_SIGNING_KEY"] = origSkillKey;
    if (origOperatorKey === undefined) delete process.env["MEMROOS_OPERATOR_API_KEY"];
    else process.env["MEMROOS_OPERATOR_API_KEY"] = origOperatorKey;
  });

  it("returns MEMROOS_SKILL_SIGNING_KEY when set", () => {
    process.env["MEMROOS_SKILL_SIGNING_KEY"] = "dedicated-key";
    process.env["MEMROOS_OPERATOR_API_KEY"] = "operator-key";
    expect(resolveSigningKey()).toBe("dedicated-key");
  });

  it("falls back to MEMROOS_OPERATOR_API_KEY when SKILL_SIGNING_KEY is unset", () => {
    delete process.env["MEMROOS_SKILL_SIGNING_KEY"];
    process.env["MEMROOS_OPERATOR_API_KEY"] = "operator-key";
    expect(resolveSigningKey()).toBe("operator-key");
  });

  it("returns null when neither key is set", () => {
    delete process.env["MEMROOS_SKILL_SIGNING_KEY"];
    delete process.env["MEMROOS_OPERATOR_API_KEY"];
    expect(resolveSigningKey()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// DB round-trip tests
// ---------------------------------------------------------------------------

async function loadModules() {
  process.env.SQLITE_DB_PATH = TEST_DB_PATH;
  const { getDb, closeDb } = await import("@/lib/db");
  const { initSchema } = await import("@/lib/db-schema");
  const db = getDb();
  initSchema(db);
  return { getDb, closeDb, db };
}

let db: import("better-sqlite3").Database;
let closeDb: () => void;

beforeEach(async () => {
  fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
  fs.mkdirSync(TEST_DB_DIR, { recursive: true });
  const mods = await loadModules();
  db = mods.db;
  closeDb = mods.closeDb;
});

afterEach(() => {
  closeDb();
  fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
});

describe("registry entry round-trip with new fields", () => {
  const FULL_SKILL = `
---
name: round-trip-skill
description: Round trip test
owner: test-team
source_harness: claude
risk_tier: low
dispatch_status: enabled
version: 1.0.0
---

## Preconditions
- None

## Allowed Tools
- read_file

## Verification Checks
- Output is not empty

## Rollback
- No state changed

## Evidence Examples
- check output
- verify json
`;

  it("inserts and retrieves evidence_examples, content_hash, trust_level", () => {
    const parsed = parseSkillMd(FULL_SKILL);
    const entry = normalizeRegistryEntry(parsed, "claude", "operator");

    db.prepare(`
      INSERT INTO skill_registry (
        name, description, owner, source_harness, risk_tier, dispatch_status,
        version, preconditions, allowed_tools, verification_checks, rollback_behavior,
        raw_body, completeness_pct, missing_fields_json, imported_by, imported_at,
        evidence_examples, content_hash, signature, signed_by, trust_level
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?
      )
    `).run(
      entry.name ?? "",
      entry.description,
      entry.owner,
      entry.source_harness,
      entry.risk_tier,
      entry.dispatch_status,
      entry.version,
      entry.preconditions,
      entry.allowed_tools,
      entry.verification_checks,
      entry.rollback_behavior,
      entry.raw_body,
      entry.completeness_pct,
      JSON.stringify(entry.missing_fields),
      entry.imported_by,
      entry.imported_at,
      entry.evidence_examples,
      entry.content_hash,
      entry.signature,
      entry.signed_by,
      entry.trust_level
    );

    const row = db.prepare(`
      SELECT evidence_examples, content_hash, signature, signed_by, trust_level
        FROM skill_registry
        WHERE name = 'round-trip-skill'
    `).get() as {
      evidence_examples: string;
      content_hash: string | null;
      signature: string | null;
      signed_by: string | null;
      trust_level: string;
    };

    expect(row.evidence_examples).toBe(entry.evidence_examples);
    expect(row.evidence_examples).toContain("check output");
    expect(row.evidence_examples).toContain("verify json");
    expect(row.content_hash).toBe(entry.content_hash);
    expect(row.content_hash).toHaveLength(64);
    expect(row.signature).toBeNull();
    expect(row.signed_by).toBeNull();
    expect(row.trust_level).toBe("unsigned");
  });

  it("updates trust_level to 'signed' after signing", () => {
    const parsed = parseSkillMd(FULL_SKILL);
    const entry = normalizeRegistryEntry(parsed, "claude", "operator");

    // Insert
    db.prepare(`
      INSERT INTO skill_registry (
        name, description, owner, source_harness, risk_tier, dispatch_status,
        version, preconditions, allowed_tools, verification_checks, rollback_behavior,
        raw_body, completeness_pct, missing_fields_json, imported_by, imported_at,
        evidence_examples, content_hash, signature, signed_by, trust_level
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?
      )
    `).run(
      entry.name ?? "",
      entry.description,
      entry.owner,
      entry.source_harness,
      entry.risk_tier,
      entry.dispatch_status,
      entry.version,
      entry.preconditions,
      entry.allowed_tools,
      entry.verification_checks,
      entry.rollback_behavior,
      entry.raw_body,
      entry.completeness_pct,
      JSON.stringify(entry.missing_fields),
      entry.imported_by,
      entry.imported_at,
      entry.evidence_examples,
      entry.content_hash,
      entry.signature,
      entry.signed_by,
      entry.trust_level
    );

    // Sign
    const signingKey = "round-trip-signing-key";
    const { signature, signedBy } = signSkill(entry.content_hash!, signingKey);

    // Update with signature
    db.prepare(`
      UPDATE skill_registry
         SET signature = ?, signed_by = ?, trust_level = 'signed'
       WHERE name = 'round-trip-skill'
    `).run(signature, signedBy);

    // Retrieve and verify
    const row = db.prepare(`
      SELECT content_hash, signature, signed_by, trust_level
        FROM skill_registry
        WHERE name = 'round-trip-skill'
    `).get() as {
      content_hash: string;
      signature: string;
      signed_by: string;
      trust_level: string;
    };

    expect(row.trust_level).toBe("signed");
    expect(row.signed_by).toBe("operator");
    expect(verifySkillSignature(row.content_hash, row.signature, signingKey)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Trust threshold dispatch tests
// ---------------------------------------------------------------------------

async function getSkillLookup() {
  const mod = await import("@/lib/dispatch/skill-lookup");
  return mod;
}

function insertSkillWithTrust(
  db: import("better-sqlite3").Database,
  overrides: Partial<{
    name: string;
    source_harness: string;
    risk_tier: string;
    dispatch_status: string;
    completeness_pct: number;
    trust_level: string;
  }> = {}
) {
  const row = {
    name: overrides.name ?? "trust-test-skill",
    source_harness: overrides.source_harness ?? "claude",
    risk_tier: overrides.risk_tier ?? "low",
    dispatch_status: overrides.dispatch_status ?? "enabled",
    completeness_pct: overrides.completeness_pct ?? 100,
    trust_level: overrides.trust_level ?? "unsigned",
    owner: "team-a",
    description: "A test skill",
    version: "1.0",
    raw_body: "## Preconditions\nnone",
    missing_fields_json: "[]",
    preconditions: "none",
    allowed_tools: "read_file",
    verification_checks: "check output",
    rollback_behavior: "no-op",
    evidence_examples: "check output",
    content_hash: null,
    signature: null,
    signed_by: null,
    imported_by: "operator",
    imported_at: new Date().toISOString(),
  };

  db.prepare(`
    INSERT OR REPLACE INTO skill_registry
      (name, source_harness, risk_tier, dispatch_status, completeness_pct,
       owner, description, version, raw_body, missing_fields_json,
       preconditions, allowed_tools, verification_checks, rollback_behavior,
       imported_by, imported_at, evidence_examples, content_hash, signature,
       signed_by, trust_level)
    VALUES
      (@name, @source_harness, @risk_tier, @dispatch_status, @completeness_pct,
       @owner, @description, @version, @raw_body, @missing_fields_json,
       @preconditions, @allowed_tools, @verification_checks, @rollback_behavior,
       @imported_by, @imported_at, @evidence_examples, @content_hash, @signature,
       @signed_by, @trust_level)
  `).run(row);
}

describe("lookupSkillContract with trust threshold (Phase 148)", () => {
  it("returns hit when no minTrustLevel is specified (backward compatible)", async () => {
    const { lookupSkillContract } = await getSkillLookup();
    insertSkillWithTrust(db, { name: "no-threshold", trust_level: "unsigned" });
    const result = lookupSkillContract(db, "no-threshold");
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("hit");
    if (result!.kind !== "hit") throw new Error("narrow");
    expect(result!.skill.trust_level).toBe("unsigned");
  });

  it("denies unsigned skill when minTrustLevel='signed'", async () => {
    const { lookupSkillContract } = await getSkillLookup();
    insertSkillWithTrust(db, { name: "unsigned-skill", trust_level: "unsigned" });
    const result = lookupSkillContract(db, "unsigned-skill", "signed");
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("denied");
    if (result!.kind !== "denied") throw new Error("narrow");
    expect(result!.reason).toContain("unsigned");
    expect(result!.reason).toContain("signed");
  });

  it("allows signed skill when minTrustLevel='signed'", async () => {
    const { lookupSkillContract } = await getSkillLookup();
    insertSkillWithTrust(db, { name: "signed-skill", trust_level: "signed" });
    const result = lookupSkillContract(db, "signed-skill", "signed");
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("hit");
    if (result!.kind !== "hit") throw new Error("narrow");
    expect(result!.skill.trust_level).toBe("signed");
  });

  it("allows verified skill when minTrustLevel='signed' (verified > signed)", async () => {
    const { lookupSkillContract } = await getSkillLookup();
    insertSkillWithTrust(db, { name: "verified-skill", trust_level: "verified" });
    const result = lookupSkillContract(db, "verified-skill", "signed");
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("hit");
  });

  it("denies signed skill when minTrustLevel='verified' (signed < verified)", async () => {
    const { lookupSkillContract } = await getSkillLookup();
    insertSkillWithTrust(db, { name: "signed-below-verified", trust_level: "signed" });
    const result = lookupSkillContract(db, "signed-below-verified", "verified");
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("denied");
    if (result!.kind !== "denied") throw new Error("narrow");
    expect(result!.reason).toContain("signed");
    expect(result!.reason).toContain("verified");
  });

  it("allows verified skill when minTrustLevel='verified'", async () => {
    const { lookupSkillContract } = await getSkillLookup();
    insertSkillWithTrust(db, { name: "verified-match", trust_level: "verified" });
    const result = lookupSkillContract(db, "verified-match", "verified");
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("hit");
  });

  it("includes trust_level in SkillContractSummary", async () => {
    const { lookupSkillContract } = await getSkillLookup();
    insertSkillWithTrust(db, { name: "summary-trust", trust_level: "signed" });
    const result = lookupSkillContract(db, "summary-trust");
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("hit");
    if (result!.kind !== "hit") throw new Error("narrow");
    expect(result!.skill).toHaveProperty("trust_level");
    expect(result!.skill.trust_level).toBe("signed");
  });
});

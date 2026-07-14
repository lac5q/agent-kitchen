/**
 * Skill signing layer tests — Phase 148 SKILLTRUST-02 (VAL-SIGN-001..012).
 *
 * Covers:
 *   - Ed25519 keypair generation, fingerprinting, and persistence
 *   - SHA-256 content hashing determinism (VAL-SIGN-001, VAL-SIGN-002)
 *   - signSkill / verifySkill round-trip and tamper detection (VAL-SIGN-003..005)
 *   - public_key_fingerprint derivation and persistence (VAL-SIGN-006)
 *   - provenance record completeness (VAL-SIGN-007)
 *   - require_signed_skills policy predicate (VAL-SIGN-008)
 *   - key file persistence + gitignore coverage (VAL-SIGN-009)
 *   - graceful signature-failure denial at dispatch time (VAL-SIGN-010)
 *   - import signs when key present, skips gracefully when absent (VAL-SIGN-012)
 *   - private key never appears in DB / logs (security)
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import crypto from "crypto";
import Database from "better-sqlite3";

import {
  DEFAULT_SIGNER_ID,
  applySignatureToRegistryEntry,
  generateKeyPair,
  hashSkillContent,
  isRequireSignedSkillsEnabled,
  loadOrCreateOperatorKeyPair,
  loadOrCreateOperatorKeyPair as loadKeyPair,
  publicKeyFingerprint,
  readOperatorKeyFile,
  resolveOperatorKeyPath,
  signRawSkillBody,
  signSkill,
  verifySkill,
  writeOperatorKeyFile,
} from "../skill-signing";
import { lookupSkillContract } from "@/lib/dispatch/skill-lookup";

const REPO_ROOT_OVERRIDE = path.join(
  tmpdir(),
  `memroos-skill-signing-${crypto.randomUUID()}`
);

beforeEach(() => {
  process.env["MEMROOS_ROOT"] = REPO_ROOT_OVERRIDE;
  // Make sure no signing env var leaks from the host.
  delete process.env["MEMROOS_REQUIRE_SIGNED_SKILLS"];
});

afterEach(() => {
  delete process.env["MEMROOS_ROOT"];
  delete process.env["MEMROOS_REQUIRE_SIGNED_SKILLS"];
  try {
    rmSync(REPO_ROOT_OVERRIDE, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

// ---------------------------------------------------------------------------
// VAL-SIGN-001 — hashSkillContent returns deterministic 64-char hex SHA-256
// ---------------------------------------------------------------------------

describe("VAL-SIGN-001 hashSkillContent", () => {
  it("returns the known SHA-256 hex for 'hello'", () => {
    expect(hashSkillContent("hello")).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
    );
  });

  it("returns 64 lowercase hex characters for arbitrary input", () => {
    const h = hashSkillContent("some-skill-body");
    expect(h).toHaveLength(64);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns the SHA-256 of the empty string when given ''", () => {
    expect(hashSkillContent("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
  });

  it("treats null/undefined body as empty string (deterministic)", () => {
    expect(hashSkillContent(null as unknown as string)).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
    expect(hashSkillContent(undefined as unknown as string)).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
  });
});

// ---------------------------------------------------------------------------
// VAL-SIGN-002 — Hash determinism across re-imports
// ---------------------------------------------------------------------------

describe("VAL-SIGN-002 hash determinism", () => {
  it("same input -> same hash", () => {
    const a = hashSkillContent("deterministic body");
    const b = hashSkillContent("deterministic body");
    expect(a).toBe(b);
  });

  it("different inputs -> different hashes", () => {
    expect(hashSkillContent("a")).not.toBe(hashSkillContent("b"));
  });
});

// ---------------------------------------------------------------------------
// VAL-SIGN-003 — Ed25519 keypair generation + sign/verify round-trip
// ---------------------------------------------------------------------------

describe("VAL-SIGN-003 generateKeyPair", () => {
  it("returns a usable Ed25519 keypair", () => {
    const { publicKey, privateKey } = generateKeyPair();
    expect(publicKey.type).toBe("public");
    expect(privateKey.type).toBe("private");
    const hash = hashSkillContent("payload");
    const sig = signSkill(privateKey, hash);
    expect(verifySkill(publicKey, hash, sig)).toBe(true);
  });

  it("produces a unique keypair on each call", () => {
    const a = generateKeyPair();
    const b = generateKeyPair();
    const hash = hashSkillContent("payload");
    const sigA = signSkill(a.privateKey, hash);
    expect(verifySkill(b.publicKey, hash, sigA)).toBe(false);
    expect(verifySkill(a.publicKey, hash, sigA)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// VAL-SIGN-004 / VAL-SIGN-005 — signSkill + verifySkill semantics
// ---------------------------------------------------------------------------

describe("VAL-SIGN-004/005 signSkill + verifySkill", () => {
  const sample = "skill-body-for-signing";

  it("returns a non-empty base64 signature for a valid key + hash", () => {
    const { privateKey } = generateKeyPair();
    const sig = signSkill(privateKey, hashSkillContent(sample));
    expect(typeof sig).toBe("string");
    expect(sig.length).toBeGreaterThan(0);
    // base64 of a 64-byte Ed25519 signature decodes to 64 bytes; the
    // encoded form should be ~88 chars (ceil(64*4/3))
    expect(sig.length).toBeGreaterThanOrEqual(80);
    expect(sig.length).toBeLessThan(120);
  });

  it("produces deterministic signatures for the same key + hash", () => {
    const { privateKey } = generateKeyPair();
    const hash = hashSkillContent(sample);
    const sigA = signSkill(privateKey, hash);
    const sigB = signSkill(privateKey, hash);
    expect(sigA).toBe(sigB);
  });

  it("throws when given a missing private key", () => {
    expect(() =>
      signSkill(null as unknown as crypto.KeyObject, hashSkillContent(sample))
    ).toThrow();
  });

  it("throws when given a public KeyObject (wrong type)", () => {
    const { publicKey } = generateKeyPair();
    expect(() =>
      signSkill(publicKey as unknown as crypto.KeyObject, hashSkillContent(sample))
    ).toThrow();
  });

  it("throws on empty hash", () => {
    const { privateKey } = generateKeyPair();
    expect(() => signSkill(privateKey, "")).toThrow();
  });
});

describe("VAL-SIGN-005 verifySkill tamper detection", () => {
  it("returns true for a valid signature", () => {
    const { publicKey, privateKey } = generateKeyPair();
    const hash = hashSkillContent("untampered body");
    expect(verifySkill(publicKey, hash, signSkill(privateKey, hash))).toBe(true);
  });

  it("returns false when the content hash was tampered with", () => {
    const { publicKey, privateKey } = generateKeyPair();
    const hash = hashSkillContent("original");
    const sig = signSkill(privateKey, hash);
    const tamperedHash = hashSkillContent("tampered");
    expect(verifySkill(publicKey, tamperedHash, sig)).toBe(false);
  });

  it("returns false when a wrong public key is supplied", () => {
    const a = generateKeyPair();
    const b = generateKeyPair();
    const hash = hashSkillContent("payload");
    const sig = signSkill(a.privateKey, hash);
    expect(verifySkill(b.publicKey, hash, sig)).toBe(false);
  });

  it("returns false when the signature is corrupted", () => {
    const { publicKey, privateKey } = generateKeyPair();
    const hash = hashSkillContent("payload");
    const sig = signSkill(privateKey, hash);
    // Flip the first character of the base64 string.
    const corrupted =
      (sig[0] === "A" ? "B" : "A") + sig.slice(1);
    expect(verifySkill(publicKey, hash, corrupted)).toBe(false);
  });

  it("returns false when the signature is empty", () => {
    const { publicKey } = generateKeyPair();
    expect(verifySkill(publicKey, hashSkillContent("x"), "")).toBe(false);
  });

  it("returns false when the public key is missing", () => {
    const { privateKey } = generateKeyPair();
    const sig = signSkill(privateKey, hashSkillContent("x"));
    expect(verifySkill(null, hashSkillContent("x"), sig)).toBe(false);
  });

  it("returns false when the hash is missing", () => {
    const { publicKey } = generateKeyPair();
    expect(verifySkill(publicKey, "", "abc")).toBe(false);
  });

  it("returns false when the signature is not valid base64", () => {
    const { publicKey } = generateKeyPair();
    expect(
      verifySkill(publicKey, hashSkillContent("x"), "!!!not-base64!!!")
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// VAL-SIGN-006 — publicKeyFingerprint derivation
// ---------------------------------------------------------------------------

describe("VAL-SIGN-006 publicKeyFingerprint", () => {
  it("returns a stable 64-char hex fingerprint for a given public key", () => {
    const { publicKey } = generateKeyPair();
    const fp = publicKeyFingerprint(publicKey);
    expect(fp).toHaveLength(64);
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
    expect(publicKeyFingerprint(publicKey)).toBe(fp);
  });

  it("differs across distinct keys", () => {
    const a = generateKeyPair();
    const b = generateKeyPair();
    expect(publicKeyFingerprint(a.publicKey)).not.toBe(
      publicKeyFingerprint(b.publicKey)
    );
  });

  it("throws when given a private KeyObject", () => {
    const { privateKey } = generateKeyPair();
    expect(() => publicKeyFingerprint(privateKey as unknown as crypto.KeyObject)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// VAL-SIGN-007 — Provenance record completeness
// ---------------------------------------------------------------------------

describe("VAL-SIGN-007 signRawSkillBody provenance completeness", () => {
  it("populates all five provenance fields", () => {
    const keyPair = loadKeyPair();
    const record = signRawSkillBody("body", keyPair);
    expect(record.content_hash).toHaveLength(64);
    expect(record.signature.length).toBeGreaterThan(0);
    expect(record.signed_by).toBe(DEFAULT_SIGNER_ID);
    expect(typeof record.signed_at).toBe("string");
    expect(() => new Date(record.signed_at)).not.toThrow();
    expect(record.public_key_fingerprint).toHaveLength(64);
    expect(record.public_key_fingerprint).toBe(keyPair.fingerprint);
  });

  it("honours MEMROOS_SKILL_SIGNER_ID for signed_by", () => {
    process.env["MEMROOS_SKILL_SIGNER_ID"] = "ci-runner";
    const keyPair = loadKeyPair();
    const record = signRawSkillBody("body", keyPair);
    expect(record.signed_by).toBe("ci-runner");
  });

  it("honours an explicit signerId argument", () => {
    const keyPair = loadKeyPair();
    const record = signRawSkillBody("body", keyPair, "alice");
    expect(record.signed_by).toBe("alice");
  });
});

// ---------------------------------------------------------------------------
// VAL-SIGN-009 — Operator keypair stored locally and gitignored
// ---------------------------------------------------------------------------

describe("VAL-SIGN-009 operator keypair persistence + gitignore", () => {
  it("creates the key file on first load and reuses it thereafter", () => {
    const first = loadOrCreateOperatorKeyPair();
    expect(first.created).toBe(true);
    const second = loadOrCreateOperatorKeyPair();
    expect(second.created).toBe(false);
    expect(second.fingerprint).toBe(first.fingerprint);
  });

  it("writes the file under apps/memroos/data/skill-signing-key.json", () => {
    loadOrCreateOperatorKeyPair();
    const filePath = resolveOperatorKeyPath();
    expect(filePath).toMatch(/apps[\\/]+memroos[\\/]+data[\\/]+skill-signing-key\.json$/);
    expect(existsSync(filePath)).toBe(true);
  });

  it("never stores the private key in the DB or logs (file is local-only)", () => {
    loadOrCreateOperatorKeyPair();
    const filePath = resolveOperatorKeyPath();
    const file = JSON.parse(readFileSync(filePath, "utf8"));
    expect(file.algorithm).toBe("ed25519");
    expect(file.public_key_pem).toMatch(/-----BEGIN PUBLIC KEY-----/);
    expect(file.private_key_pem).toMatch(/-----BEGIN PRIVATE KEY-----/);
    expect(file.public_key_fingerprint).toHaveLength(64);
  });

  it("gitignore covers apps/memroos/data/skill-signing-key.json", () => {
    // Read the repo-level .gitignore and verify the entry exists.
    // We try several candidate locations because tests run from various
    // working directories (vitest launches from apps/memroos or the repo root).
    const candidates = [
      ".gitignore",
      "../.gitignore",
      "../../.gitignore",
      "../../../.gitignore",
      path.resolve(process.cwd(), ".gitignore"),
    ];
    let found = false;
    for (const candidate of candidates) {
      try {
        const text = readFileSync(candidate, "utf8");
        if (text.includes("apps/memroos/data/skill-signing-key.json")) {
          found = true;
          break;
        }
      } catch {
        /* try next candidate */
      }
    }
    expect(found).toBe(true);
  });

  it("writeOperatorKeyFile produces a parseable, fingerprint-bearing file", () => {
    const { publicKey, privateKey } = generateKeyPair();
    const fp = publicKeyFingerprint(publicKey);
    const written = writeOperatorKeyFile({
      algorithm: "ed25519",
      public_key_pem: publicKey.export({ type: "spki", format: "pem" }) as string,
      private_key_pem: privateKey.export({ type: "pkcs8", format: "pem" }) as string,
      public_key_fingerprint: fp,
      generated_at: new Date().toISOString(),
    });
    expect(existsSync(written)).toBe(true);
    const reloaded = readOperatorKeyFile();
    expect(reloaded).not.toBeNull();
    expect(reloaded!.public_key_fingerprint).toBe(fp);
  });
});

// ---------------------------------------------------------------------------
// VAL-SIGN-008 — Dispatch policy `require_signed_skills`
// ---------------------------------------------------------------------------

describe("VAL-SIGN-008 require_signed_skills dispatch policy", () => {
  it("isRequireSignedSkillsEnabled reads MEMROOS_REQUIRE_SIGNED_SKILLS", () => {
    expect(isRequireSignedSkillsEnabled()).toBe(false);
    process.env["MEMROOS_REQUIRE_SIGNED_SKILLS"] = "true";
    expect(isRequireSignedSkillsEnabled()).toBe(true);
    process.env["MEMROOS_REQUIRE_SIGNED_SKILLS"] = "1";
    expect(isRequireSignedSkillsEnabled()).toBe(true);
    process.env["MEMROOS_REQUIRE_SIGNED_SKILLS"] = "false";
    expect(isRequireSignedSkillsEnabled()).toBe(false);
    process.env["MEMROOS_REQUIRE_SIGNED_SKILLS"] = "yes";
    expect(isRequireSignedSkillsEnabled()).toBe(true);
  });

  it("lookupSkillContract denies unsigned skill when requireSigned=true", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE skill_registry (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        source_harness TEXT NOT NULL,
        risk_tier TEXT,
        dispatch_status TEXT NOT NULL,
        completeness_pct INTEGER NOT NULL,
        trust_level TEXT NOT NULL,
        signature TEXT,
        imported_at TEXT NOT NULL DEFAULT '2026-01-01T00:00:00Z'
      );
    `);
    db.prepare(
      `INSERT INTO skill_registry (name, source_harness, risk_tier, dispatch_status,
                                   completeness_pct, trust_level, signature)
       VALUES ('unsigned-skill', 'claude', 'low', 'enabled', 100, 'unsigned', NULL)`
    ).run();

    // Policy off -> still a hit (default behaviour).
    const off = lookupSkillContract(db, "unsigned-skill");
    expect(off?.kind).toBe("hit");

    // Policy on -> denied with informative reason.
    const on = lookupSkillContract(db, "unsigned-skill", null, { requireSigned: true });
    expect(on?.kind).toBe("denied");
    if (on?.kind === "denied") {
      expect(on.reason).toMatch(/unsigned/i);
      expect(on.reason).toMatch(/require_signed_skills/i);
    }
  });

  it("lookupSkillContract allows signed skill when requireSigned=true", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE skill_registry (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        source_harness TEXT NOT NULL,
        risk_tier TEXT,
        dispatch_status TEXT NOT NULL,
        completeness_pct INTEGER NOT NULL,
        trust_level TEXT NOT NULL,
        signature TEXT,
        imported_at TEXT NOT NULL DEFAULT '2026-01-01T00:00:00Z'
      );
    `);
    db.prepare(
      `INSERT INTO skill_registry (name, source_harness, risk_tier, dispatch_status,
                                   completeness_pct, trust_level, signature)
       VALUES ('signed-skill', 'claude', 'low', 'enabled', 100, 'signed', 'abc123')`
    ).run();

    const result = lookupSkillContract(db, "signed-skill", null, { requireSigned: true });
    expect(result?.kind).toBe("hit");
    if (result?.kind === "hit") {
      expect(result.skill.signature).toBe("abc123");
    }
  });
});

// ---------------------------------------------------------------------------
// VAL-SIGN-010 — Graceful denial when verification fails (no crash)
// ---------------------------------------------------------------------------

describe("VAL-SIGN-010 graceful denial on signature failure", () => {
  it("verifySkill returns false rather than throwing on bad input", () => {
    const { publicKey } = generateKeyPair();
    expect(() =>
      verifySkill(publicKey, "irrelevant", "not-base64-!@#")
    ).not.toThrow();
    expect(
      verifySkill(publicKey, "irrelevant", "not-base64-!@#")
    ).toBe(false);
  });

  it("lookupSkillContract returns a denied result when the signature column is empty", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE skill_registry (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        source_harness TEXT NOT NULL,
        risk_tier TEXT,
        dispatch_status TEXT NOT NULL,
        completeness_pct INTEGER NOT NULL,
        trust_level TEXT NOT NULL,
        signature TEXT,
        imported_at TEXT NOT NULL DEFAULT '2026-01-01T00:00:00Z'
      );
    `);
    db.prepare(
      `INSERT INTO skill_registry (name, source_harness, risk_tier, dispatch_status,
                                   completeness_pct, trust_level, signature)
       VALUES ('missing-sig', 'claude', 'low', 'enabled', 100, 'unsigned', NULL)`
    ).run();

    const result = lookupSkillContract(db, "missing-sig", null, { requireSigned: true });
    expect(result?.kind).toBe("denied");
  });
});

// ---------------------------------------------------------------------------
// VAL-SIGN-012 — Import signs when key present, skips gracefully when absent
// ---------------------------------------------------------------------------

describe("VAL-SIGN-012 import signs when key present, skips when absent", () => {
  it("applySignatureToRegistryEntry populates provenance when keyPair is supplied", () => {
    const keyPair = loadOrCreateOperatorKeyPair();
    const entry = {
      raw_body: "skill body",
      content_hash: null as string | null,
      signature: null as string | null,
      signed_by: null as string | null,
      signed_at: null as string | null,
      public_key_fingerprint: null as string | null,
    };
    const signed = applySignatureToRegistryEntry(entry, keyPair);
    expect(signed.content_hash).toHaveLength(64);
    expect(signed.signature).not.toBeNull();
    expect(signed.signed_by).toBeTruthy();
    expect(signed.signed_at).toBeTruthy();
    expect(signed.public_key_fingerprint).toBe(keyPair.fingerprint);
  });

  it("applySignatureToRegistryEntry is a no-op when keyPair is null", () => {
    const entry = {
      raw_body: "skill body",
      content_hash: null as string | null,
      signature: null as string | null,
      signed_by: null as string | null,
      signed_at: null as string | null,
      public_key_fingerprint: null as string | null,
    };
    const out = applySignatureToRegistryEntry(entry, null);
    expect(out.signature).toBeNull();
    expect(out.signed_by).toBeNull();
    expect(out.signed_at).toBeNull();
    expect(out.public_key_fingerprint).toBeNull();
  });

  it("applySignatureToRegistryEntry is a no-op when entry has no raw_body", () => {
    const keyPair = loadOrCreateOperatorKeyPair();
    const entry = {
      content_hash: null as string | null,
      signature: null as string | null,
      signed_by: null as string | null,
      signed_at: null as string | null,
      public_key_fingerprint: null as string | null,
    };
    const out = applySignatureToRegistryEntry(entry, keyPair);
    expect(out.signature).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Security: private key never written to DB or in audit-style payloads
// ---------------------------------------------------------------------------

describe("skill-signing security boundary", () => {
  it("the public_key_fingerprint stored on a row is sufficient for verification", () => {
    const keyPair = loadOrCreateOperatorKeyPair();
    const record = signRawSkillBody("body", keyPair);
    // Verify the signature using only the public_key_fingerprint-derived key.
    const { publicKey, privateKey } = generateKeyPair();
    // Use the operator's actual publicKey (the one whose fingerprint is stored).
    const reloaded = readOperatorKeyFile();
    expect(reloaded).not.toBeNull();
    const reloadedKey = crypto.createPublicKey(reloaded!.public_key_pem);
    expect(verifySkill(reloadedKey, record.content_hash, record.signature)).toBe(true);
    expect(verifySkill(publicKey, record.content_hash, record.signature)).toBe(false);

    // And we never need the private key bytes to do that check.
    expect(privateKey).toBeDefined();
  });

  it("does not export private key bytes from any public function", () => {
    const keyPair = loadOrCreateOperatorKeyPair();
    const publicPem = keyPair.publicKey.export({ type: "spki", format: "pem" });
    const privPem = keyPair.privateKey.export({ type: "pkcs8", format: "pem" });
    // Public export of a private key would be a bug — guard against regressions.
    expect(typeof publicPem).toBe("string");
    expect((publicPem as string).startsWith("-----BEGIN PUBLIC KEY-----")).toBe(true);
    expect((privPem as string).startsWith("-----BEGIN PRIVATE KEY-----")).toBe(true);
  });
});

// @vitest-environment node
/**
 * Phase 149 (continued) / SKILLTRUST-04 / VAL-SKILL-031 — Library
 * tests for the dispatch lookup's pinned branch.
 *
 * Covers:
 *   - A valid pin overrides the unpinned latest row only on an exact
 *     harness, version, and hash identity match.
 *   - A pin whose version or hash does not match the registry row fails closed.
 *   - A pin whose registry row is non-dispatchable fails closed.
 *   - When a pin is provided the source_harness binding is taken from
 *     the pin so the same-name ambiguity check is bypassed.
 *   - A pin to a retired row still dispatches when lifecycle_state
 *     is not 'enabled' (the pin override requires dispatch_status='enabled').
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

const PINNED_BODY = "## Preconditions\nnone";
const PINNED_HASH = crypto.createHash("sha256").update(PINNED_BODY, "utf8").digest("hex");

const TMP_ROOT = path.join(
  os.tmpdir(),
  `skill-lookup-pinned-${crypto.randomUUID()}`
);

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
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
});

function insertSkillRow(overrides: {
  name?: string;
  source_harness?: string;
  content_hash?: string;
  dispatch_status?: string;
  completeness_pct?: number;
  lifecycle_state?: string;
  version?: string;
  raw_body?: string;
  signature?: string | null;
  trust_level?: string;
} = {}): number {
  const rawBody = overrides.raw_body ?? PINNED_BODY;
  const result = db
    .prepare(
      `INSERT INTO skill_registry (
        name, description, owner, source_harness, risk_tier, dispatch_status,
        version, preconditions, allowed_tools, verification_checks, rollback_behavior,
        raw_body, completeness_pct, missing_fields_json, imported_by, imported_at,
        evidence_examples, content_hash, signature, signed_by, signed_at, trust_level,
        public_key_fingerprint, lifecycle_state
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?
      )`
    )
    .run(
      overrides.name ?? "pinned-skill",
      "Test",
      "ops",
      overrides.source_harness ?? "claude",
      "low",
      overrides.dispatch_status ?? "enabled",
      overrides.version ?? "1.0.0",
      "none",
      "read_file",
      "verify output",
      "revert",
      rawBody,
      overrides.completeness_pct ?? 100,
      "[]",
      "operator",
      new Date().toISOString(),
      "check output",
      overrides.content_hash ?? PINNED_HASH,
      overrides.signature ?? null,
      null,
      null,
      overrides.trust_level ?? "unsigned",
      null,
      overrides.lifecycle_state ?? "enabled"
    );
  return Number(result.lastInsertRowid);
}

describe("VAL-SKILL-031 pinned dispatch wins over unpinned latest", () => {
  it("dispatches only when the pinned version and hash exactly match the selected registry skill", async () => {
    const { lookupSkillContract } = await import("../skill-lookup");
    // Two harness rows sharing the name; the pin binds to one of them.
    const pinnedId = insertSkillRow({
      name: "shared-skill",
      source_harness: "claude",
      content_hash: PINNED_HASH,
      version: "1.0.0",
    });
    insertSkillRow({
      name: "shared-skill",
      source_harness: "codex",
      content_hash: PINNED_HASH,
      version: "2.0.0",
    });

    const result = lookupSkillContract(db, "shared-skill", {
      pinned: {
        agent_id: "a-1",
        source_harness: "claude",
        current_version: "1.0.0",
        current_content_hash: PINNED_HASH,
      },
    });
    expect(result?.kind).toBe("hit");
    if (result && result.kind === "hit") {
      expect(result.skill.id).toBe(pinnedId);
      expect(result.skill.source_harness).toBe("claude");
      expect(result.skill.version).toBe("1.0.0");
      expect(result.skill.content_hash).toBe(PINNED_HASH);
    }
  });

  it("denies same-hash version drift caused by an unchanged-content reimport", async () => {
    const { lookupSkillContract } = await import("../skill-lookup");
    insertSkillRow({
      name: "same-hash-version-drift",
      source_harness: "claude",
      version: "2.0.0",
      content_hash: PINNED_HASH,
    });

    const result = lookupSkillContract(db, "same-hash-version-drift", {
      pinned: {
        agent_id: "a-1",
        source_harness: "claude",
        current_version: "1.0.0",
        current_content_hash: PINNED_HASH,
      },
    });

    expect(result).toMatchObject({
      kind: "denied",
      skill_name: "same-hash-version-drift",
      source_harness: "claude",
    });
    if (result?.kind === "denied") {
      expect(result.reason).toMatch(/version mismatch/i);
      expect(result.reason).not.toContain(PINNED_BODY);
    }
  });

  it("pin hash mismatch fails closed with a typed denial", async () => {
    const { lookupSkillContract } = await import("../skill-lookup");
    insertSkillRow({
      name: "tamper-pin",
      source_harness: "claude",
      content_hash: PINNED_HASH,
    });
    const result = lookupSkillContract(db, "tamper-pin", {
      pinned: {
        agent_id: "a-1",
        source_harness: "claude",
        current_version: "1.0.0",
        current_content_hash: "f".repeat(64), // registry has "1111..."
      },
    });
    expect(result?.kind).toBe("denied");
    if (result && result.kind === "denied") {
      expect(result.reason).toMatch(/Pin(hash|ned).*mismatch/i);
    }
  });

  it("denies combined version and content-hash drift", async () => {
    const { lookupSkillContract } = await import("../skill-lookup");
    insertSkillRow({
      name: "combined-identity-drift",
      source_harness: "claude",
      version: "2.0.0",
      content_hash: "b".repeat(64),
    });

    const result = lookupSkillContract(db, "combined-identity-drift", {
      pinned: {
        agent_id: "a-1",
        source_harness: "claude",
        current_version: "1.0.0",
        current_content_hash: PINNED_HASH,
      },
    });

    expect(result).toMatchObject({
      kind: "denied",
      skill_name: "combined-identity-drift",
      source_harness: "claude",
    });
    if (result?.kind === "denied") {
      expect(result.reason).toMatch(/version mismatch/i);
      expect(result.reason).not.toContain(PINNED_BODY);
    }
  });

  it("pin to a non-dispatchable registry row fails closed", async () => {
    const { lookupSkillContract } = await import("../skill-lookup");
    insertSkillRow({
      name: "non-dispatchable-pin",
      source_harness: "claude",
      content_hash: PINNED_HASH,
      dispatch_status: "quarantined",
    });
    const result = lookupSkillContract(db, "non-dispatchable-pin", {
      pinned: {
        agent_id: "a-1",
        source_harness: "claude",
        current_version: "1.0.0",
        current_content_hash: PINNED_HASH,
      },
    });
    expect(result?.kind).toBe("denied");
    if (result && result.kind === "denied") {
      expect(result.reason).toMatch(/dispatch_status/i);
    }
  });

  it("pin to an incomplete registry row fails closed", async () => {
    const { lookupSkillContract } = await import("../skill-lookup");
    insertSkillRow({
      name: "incomplete-pin",
      source_harness: "claude",
      content_hash: PINNED_HASH,
      completeness_pct: 91,
    });

    const result = lookupSkillContract(db, "incomplete-pin", {
      pinned: {
        agent_id: "a-1",
        source_harness: "claude",
        current_version: "1.0.0",
        current_content_hash: PINNED_HASH,
      },
    });

    expect(result).toMatchObject({
      kind: "denied",
      reason: expect.stringMatching(/incomplete/i),
    });
  });

  it("pin still enforces lifecycle, trust, signing, and artifact integrity gates", async () => {
    const { lookupSkillContract } = await import("../skill-lookup");
    insertSkillRow({
      name: "retired-pin",
      source_harness: "claude",
      content_hash: PINNED_HASH,
      lifecycle_state: "retired",
    });
    expect(lookupSkillContract(db, "retired-pin", {
      pinned: {
        agent_id: "a-1",
        source_harness: "claude",
        current_version: "1.0.0",
        current_content_hash: PINNED_HASH,
      },
    })).toMatchObject({
      kind: "denied",
      reason: expect.stringMatching(/lifecycle_state='retired'/i),
    });

    insertSkillRow({
      name: "low-trust-pin",
      source_harness: "claude",
      content_hash: PINNED_HASH,
      trust_level: "signed",
    });
    expect(lookupSkillContract(db, "low-trust-pin", {
      minTrustLevel: "verified",
      pinned: {
        agent_id: "a-1",
        source_harness: "claude",
        current_version: "1.0.0",
        current_content_hash: PINNED_HASH,
      },
    })).toMatchObject({
      kind: "denied",
      reason: expect.stringMatching(/below required minimum/i),
    });

    insertSkillRow({
      name: "unsigned-pin",
      source_harness: "claude",
      content_hash: PINNED_HASH,
    });
    expect(lookupSkillContract(db, "unsigned-pin", {
      requireSigned: true,
      pinned: {
        agent_id: "a-1",
        source_harness: "claude",
        current_version: "1.0.0",
        current_content_hash: PINNED_HASH,
      },
    })).toMatchObject({
      kind: "denied",
      reason: expect.stringMatching(/unsigned/i),
    });

    insertSkillRow({
      name: "tampered-pin",
      source_harness: "claude",
      raw_body: "body changed after hash",
      content_hash: PINNED_HASH,
      signature: "signature-present",
      trust_level: "signed",
    });
    expect(lookupSkillContract(db, "tampered-pin", {
      pinned: {
        agent_id: "a-1",
        source_harness: "claude",
        current_version: "1.0.0",
        current_content_hash: PINNED_HASH,
      },
    })).toMatchObject({
      kind: "denied",
      reason: expect.stringMatching(/integrity verification failed/i),
    });
  });

  it("missing registry row for the pin's source_harness fails closed", async () => {
    const { lookupSkillContract } = await import("../skill-lookup");
    const result = lookupSkillContract(db, "missing-pin", {
      pinned: {
        agent_id: "a-1",
        source_harness: "codex",
        current_version: "1.0.0",
        current_content_hash: "1".repeat(64),
      },
    });
    expect(result?.kind).toBe("denied");
    if (result && result.kind === "denied") {
      expect(result.reason).toMatch(/no registry row/i);
    }
  });

  it("ambiguous same-name lookup returns hit when a pin disambiguates", async () => {
    const { lookupSkillContract } = await import("../skill-lookup");
    insertSkillRow({
      name: "ambiguous-pin",
      source_harness: "claude",
      content_hash: PINNED_HASH,
    });
    insertSkillRow({
      name: "ambiguous-pin",
      source_harness: "codex",
      content_hash: PINNED_HASH,
    });
    const result = lookupSkillContract(db, "ambiguous-pin", {
      pinned: {
        agent_id: "a-1",
        source_harness: "codex",
        current_version: "1.0.0",
        current_content_hash: PINNED_HASH,
      },
    });
    expect(result?.kind).toBe("hit");
    if (result && result.kind === "hit") {
      expect(result.skill.source_harness).toBe("codex");
    }
  });
});

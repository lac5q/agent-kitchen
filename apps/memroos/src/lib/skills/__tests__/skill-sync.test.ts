// @vitest-environment node
/**
 * Phase 149 / SKILLTRUST-04 — Governed cross-harness sync engine tests.
 *
 * Covers the v8.6 SKILLTRUST-04 validation contract:
 *   VAL-SYNC-001 — detectHarnessSkills scans Claude Code (.claude/skills/),
 *                   Codex, Hermes, and OpenCode dirs for SKILL.md files.
 *   VAL-SYNC-002 — diffSkills returns structured field-level diffs with
 *                   old/new values for changed skills, plus an "add" diff
 *                   type for new skills.
 *   VAL-SYNC-003 — Detected changes create pending proposals in
 *                   skill_sync_state; skill_registry is never mutated.
 *   VAL-SYNC-004 — approve updates registry + last_synced_hash; reject
 *                   clears without mutating the registry.
 *   VAL-SYNC-005 — version_pinned_to suppresses drift proposals for
 *                   pinned skills.
 *   VAL-SYNC-006 — One-step rollback restores the prior version content
 *                   and hash.
 *   VAL-SYNC-007 — GET /api/skills/sync returns per-skill observability
 *                   (last_synced, pending, drift, pin).
 *   VAL-SYNC-008 — Sync check is idempotent (no duplicate proposals on
 *                   re-run with no changes).
 *   VAL-SYNC-009 — Malformed SKILL.md files are skipped with an error log
 *                   and the scan continues for remaining files.
 *   VAL-SYNC-010 — Approved sync proposals route through quarantine
 *                   (dispatch_status != 'enabled'), not direct enablement.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { getDb, closeDb } from "@/lib/db";

const TMP_ROOT = path.join(
  os.tmpdir(),
  `skill-sync-${crypto.randomUUID()}`
);

let db: import("better-sqlite3").Database;

beforeEach(() => {
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
  fs.mkdirSync(TMP_ROOT, { recursive: true });
  process.env["MEMROOS_ROOT"] = TMP_ROOT;
  process.env["SQLITE_DB_PATH"] = path.join(TMP_ROOT, `db-${crypto.randomUUID()}.db`);
  try {
    closeDb();
  } catch {
    /* ignore */
  }
  db = getDb();
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

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const VALID_SKILL_MD = (skillName: string, version: string): string => `---
name: ${skillName}
description: A test skill
owner: ops
source_harness: claude
risk_tier: low
version: ${version}
---

## Preconditions
- none

## Allowed Tools
- read_file

## Verification Checks
- verify output

## Rollback
- revert

## Evidence Examples
- verify output
`;

function insertSkillRow(
  overrides: {
    name?: string;
    source_harness?: string;
    dispatch_status?: string;
    completeness_pct?: number;
    content_hash?: string | null;
    version?: string | null;
    raw_body?: string | null;
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
      overrides.name ?? "sync-test-skill",
      "Test description",
      "ops",
      overrides.source_harness ?? "claude",
      "low",
      overrides.dispatch_status ?? "enabled",
      overrides.version ?? "1.0.0",
      "none",
      "read_file",
      "verify output",
      "revert",
      overrides.raw_body ?? VALID_SKILL_MD("sync-test-skill", "1.0.0"),
      overrides.completeness_pct ?? 100,
      "[]",
      "operator",
      new Date().toISOString(),
      "verify output",
      overrides.content_hash ?? null,
      null,
      null,
      null,
      "unsigned",
      null
    );
  return Number(result.lastInsertRowid);
}

function buildHarnessRoots(baseDir: string): {
  claude: string;
  codex: string;
  hermes: string;
  opencode: string;
} {
  return {
    claude: path.join(baseDir, ".claude", "skills"),
    codex: path.join(baseDir, "codex", "skills"),
    hermes: path.join(baseDir, "hermes", "skills"),
    opencode: path.join(baseDir, "opencode", "skills"),
  };
}

function writeHarnessSkill(
  rootDir: string,
  skillName: string,
  body: string
): string {
  fs.mkdirSync(rootDir, { recursive: true });
  const filePath = path.join(rootDir, `${skillName}.md`);
  fs.writeFileSync(filePath, body, "utf8");
  return filePath;
}

// ---------------------------------------------------------------------------
// VAL-SYNC-001 — detectHarnessSkills scans all four harness dirs
// ---------------------------------------------------------------------------

describe("VAL-SYNC-001 detectHarnessSkills scans all four harness dirs", () => {
  it("returns structured entries with source_harness attribution for each dir", async () => {
    const { detectHarnessSkills } = await import("../skill-sync");
    const harnessRoots = buildHarnessRoots(TMP_ROOT);
    writeHarnessSkill(
      harnessRoots.claude,
      "claude-skill",
      VALID_SKILL_MD("claude-skill", "1.0.0")
    );
    writeHarnessSkill(
      harnessRoots.codex,
      "codex-skill",
      VALID_SKILL_MD("codex-skill", "1.0.0")
    );
    writeHarnessSkill(
      harnessRoots.hermes,
      "hermes-skill",
      VALID_SKILL_MD("hermes-skill", "1.0.0")
    );
    writeHarnessSkill(
      harnessRoots.opencode,
      "opencode-skill",
      VALID_SKILL_MD("opencode-skill", "1.0.0")
    );

    const detected = detectHarnessSkills({ roots: harnessRoots });
    expect(detected.errors).toEqual([]);
    expect(detected.entries).toHaveLength(4);
    const sources = detected.entries.map((e) => e.source_harness).sort();
    expect(sources).toEqual(["claude", "codex", "hermes", "opencode"]);
    for (const entry of detected.entries) {
      expect(entry.skill_name).toBeTruthy();
      expect(typeof entry.content_hash).toBe("string");
      expect(entry.content_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(entry.file_path).toMatch(/\.md$/);
      expect(typeof entry.raw_body).toBe("string");
    }
  });

  it("skips directories that do not exist (returns empty entries for that harness)", async () => {
    const { detectHarnessSkills } = await import("../skill-sync");
    const harnessRoots = buildHarnessRoots(TMP_ROOT);
    writeHarnessSkill(
      harnessRoots.claude,
      "only-claude",
      VALID_SKILL_MD("only-claude", "1.0.0")
    );
    const detected = detectHarnessSkills({ roots: harnessRoots });
    expect(detected.entries.map((e) => e.source_harness)).toEqual(["claude"]);
  });
});

// ---------------------------------------------------------------------------
// VAL-SYNC-002 — diffSkills returns field-level diffs
// ---------------------------------------------------------------------------

describe("VAL-SYNC-002 diffSkills returns field-level diffs", () => {
  it("produces an 'add' diff for a new skill (no existing entry)", async () => {
    const { diffSkills } = await import("../skill-sync");
    const detected = {
      skill_name: "new-skill",
      source_harness: "claude",
      version: "1.0.0",
      raw_body: VALID_SKILL_MD("new-skill", "1.0.0"),
      content_hash:
        "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
      file_path: "/tmp/x.md",
      parse_error: null,
    };
    const diff = diffSkills(null, detected);
    expect(diff.kind).toBe("add");
    expect(diff.skill_name).toBe("new-skill");
    expect(diff.source_harness).toBe("claude");
    expect(diff.changed_fields).toEqual([]);
  });

  it("produces a 'change' diff identifying changed fields with old/new values", async () => {
    const { diffSkills } = await import("../skill-sync");
    const existingRaw = VALID_SKILL_MD("changed-skill", "1.0.0");
    const newRaw = VALID_SKILL_MD("changed-skill", "2.0.0");
    const existing = {
      skill_name: "changed-skill",
      source_harness: "claude",
      version: "1.0.0",
      raw_body: existingRaw,
      content_hash:
        "0000000000000000000000000000000000000000000000000000000000000000",
      file_path: "/tmp/x.md",
      parse_error: null,
    };
    const detected = {
      ...existing,
      raw_body: newRaw,
      content_hash:
        "1111111111111111111111111111111111111111111111111111111111111111",
      version: "2.0.0",
    };
    const diff = diffSkills(existing, detected);
    expect(diff.kind).toBe("change");
    expect(diff.changed_fields.length).toBeGreaterThan(0);
    const versionDiff = diff.changed_fields.find((c) => c.field === "version");
    expect(versionDiff).toBeTruthy();
    expect(versionDiff?.old_value).toBe("1.0.0");
    expect(versionDiff?.new_value).toBe("2.0.0");
    const rawBodyDiff = diff.changed_fields.find((c) => c.field === "raw_body");
    expect(rawBodyDiff).toBeTruthy();
    expect(rawBodyDiff?.old_value).toBe(existingRaw);
    expect(rawBodyDiff?.new_value).toBe(newRaw);
  });

  it("produces a 'no_change' diff when content_hash matches", async () => {
    const { diffSkills } = await import("../skill-sync");
    const sameBody = VALID_SKILL_MD("stable-skill", "1.0.0");
    const hash =
      "2222222222222222222222222222222222222222222222222222222222222222";
    const entry = {
      skill_name: "stable-skill",
      source_harness: "claude",
      version: "1.0.0",
      raw_body: sameBody,
      content_hash: hash,
      file_path: "/tmp/x.md",
      parse_error: null,
    };
    const detected = { ...entry };
    const diff = diffSkills(entry, detected);
    expect(diff.kind).toBe("no_change");
  });
});

// ---------------------------------------------------------------------------
// VAL-SYNC-003 — Detected changes create pending proposals, registry untouched
// ---------------------------------------------------------------------------

describe("VAL-SYNC-003 createImportProposal inserts into skill_sync_state", () => {
  it("creates a pending proposal row and never mutates skill_registry", async () => {
    const { createImportProposal } = await import("../skill-sync");
    const id = insertSkillRow({
      name: "sync-skill",
      content_hash:
        "0000000000000000000000000000000000000000000000000000000000000000",
      version: "1.0.0",
    });

    const beforeRegistry = db
      .prepare(
        `SELECT dispatch_status, version, content_hash FROM skill_registry WHERE id = ?`
      )
      .get(id) as {
      dispatch_status: string;
      version: string;
      content_hash: string | null;
    };

    const detected = {
      skill_name: "sync-skill",
      source_harness: "claude",
      version: "2.0.0",
      raw_body: VALID_SKILL_MD("sync-skill", "2.0.0"),
      content_hash:
        "1111111111111111111111111111111111111111111111111111111111111111",
      file_path: "/tmp/sync-skill.md",
      parse_error: null,
    };

    const result = createImportProposal(db, {
      source_harness: "claude",
      detected,
      proposed_by: "scanner",
    });

    expect(result.created).toBe(true);
    expect(result.proposal.status).toBe("pending");
    expect(result.proposal.skill_name).toBe("sync-skill");
    expect(result.proposal.source_harness).toBe("claude");
    expect(result.proposal.pending_proposal_id).toBeTruthy();
    expect(result.proposal.last_synced_hash).toBe(
      "0000000000000000000000000000000000000000000000000000000000000000"
    );
    expect(result.proposal.version_pinned_to).toBeNull();

    // Registry is untouched.
    const afterRegistry = db
      .prepare(
        `SELECT dispatch_status, version, content_hash FROM skill_registry WHERE id = ?`
      )
      .get(id) as {
      dispatch_status: string;
      version: string;
      content_hash: string | null;
    };
    expect(afterRegistry.dispatch_status).toBe(beforeRegistry.dispatch_status);
    expect(afterRegistry.version).toBe(beforeRegistry.version);
    expect(afterRegistry.content_hash).toBe(beforeRegistry.content_hash);
  });
});

// ---------------------------------------------------------------------------
// VAL-SYNC-004 — Approve updates registry + last_synced_hash; reject clears
// ---------------------------------------------------------------------------

describe("VAL-SYNC-004 approve / reject behavior", () => {
  it("approve updates the registry content + last_synced_hash and routes to quarantine", async () => {
    const { createImportProposal, approveImportProposal } =
      await import("../skill-sync");
    const oldHash =
      "0000000000000000000000000000000000000000000000000000000000000000";
    const newHash =
      "1111111111111111111111111111111111111111111111111111111111111111";
    const id = insertSkillRow({
      name: "approve-skill",
      content_hash: oldHash,
      version: "1.0.0",
      raw_body: VALID_SKILL_MD("approve-skill", "1.0.0"),
    });
    createImportProposal(db, {
      source_harness: "claude",
      detected: {
        skill_name: "approve-skill",
        source_harness: "claude",
        version: "2.0.0",
        raw_body: VALID_SKILL_MD("approve-skill", "2.0.0"),
        content_hash: newHash,
        file_path: "/tmp/approve-skill.md",
        parse_error: null,
      },
      proposed_by: "scanner",
    });

    const approved = approveImportProposal(db, {
      source_harness: "claude",
      skill_name: "approve-skill",
      operator: "alice",
    });
    expect(approved.status).toBe("approved");
    expect(approved.last_synced_hash).toBe(newHash);
    expect(approved.pending_proposal_id).toBeNull();

    // Registry content updated (content_hash reflects new body) but dispatch_status is NOT enabled.
    const reg = db
      .prepare(
        `SELECT dispatch_status, content_hash, version, raw_body FROM skill_registry WHERE id = ?`
      )
      .get(id) as {
      dispatch_status: string;
      content_hash: string | null;
      version: string | null;
      raw_body: string | null;
    };
    expect(reg.content_hash).toBe(newHash);
    expect(reg.version).toBe("2.0.0");
    expect(reg.raw_body).toBe(VALID_SKILL_MD("approve-skill", "2.0.0"));
    expect(reg.dispatch_status).not.toBe("enabled");
  });

  it("reject clears the pending proposal without mutating the registry", async () => {
    const { createImportProposal, rejectImportProposal } =
      await import("../skill-sync");
    const id = insertSkillRow({
      name: "reject-skill",
      content_hash:
        "0000000000000000000000000000000000000000000000000000000000000000",
      version: "1.0.0",
    });
    createImportProposal(db, {
      source_harness: "claude",
      detected: {
        skill_name: "reject-skill",
        source_harness: "claude",
        version: "2.0.0",
        raw_body: VALID_SKILL_MD("reject-skill", "2.0.0"),
        content_hash:
          "1111111111111111111111111111111111111111111111111111111111111111",
        file_path: "/tmp/reject-skill.md",
        parse_error: null,
      },
      proposed_by: "scanner",
    });

    const rejected = rejectImportProposal(db, {
      source_harness: "claude",
      skill_name: "reject-skill",
      operator: "alice",
      reason: "out of policy",
    });
    expect(rejected.status).toBe("rejected");
    expect(rejected.pending_proposal_id).toBeNull();
    expect(rejected.last_synced_hash).toBe(
      "0000000000000000000000000000000000000000000000000000000000000000"
    );

    const reg = db
      .prepare(
        `SELECT dispatch_status, content_hash FROM skill_registry WHERE id = ?`
      )
      .get(id) as { dispatch_status: string; content_hash: string | null };
    expect(reg.dispatch_status).toBe("enabled");
    expect(reg.content_hash).toBe(
      "0000000000000000000000000000000000000000000000000000000000000000"
    );
  });
});

// ---------------------------------------------------------------------------
// VAL-SYNC-005 — Version pinning suppresses drift proposals
// ---------------------------------------------------------------------------

describe("VAL-SYNC-005 version_pinned_to suppresses drift proposals", () => {
  it("creates no proposal when the skill is pinned to a version", async () => {
    const { createImportProposal, pinVersion, getSyncStateRow } =
      await import("../skill-sync");
    insertSkillRow({
      name: "pinned-skill",
      content_hash:
        "0000000000000000000000000000000000000000000000000000000000000000",
      version: "1.0.0",
    });
    // Seed sync state with a pin.
    pinVersion(db, {
      skill_name: "pinned-skill",
      source_harness: "claude",
      version: "1.0.0",
      actor: "alice",
    });
    const beforeState = getSyncStateRow(db, "pinned-skill", "claude");
    expect(beforeState?.version_pinned_to).toBe("1.0.0");
    expect(beforeState?.pending_proposal_id).toBeNull();

    const detected = {
      skill_name: "pinned-skill",
      source_harness: "claude",
      version: "2.0.0",
      raw_body: VALID_SKILL_MD("pinned-skill", "2.0.0"),
      content_hash:
        "1111111111111111111111111111111111111111111111111111111111111111",
      file_path: "/tmp/pinned-skill.md",
      parse_error: null,
    };
    const result = createImportProposal(db, {
      source_harness: "claude",
      detected,
      proposed_by: "scanner",
    });
    expect(result.created).toBe(false);
    expect(result.proposal.status).toBe("no_change");
    expect(result.proposal.pending_proposal_id).toBeNull();
  });

  it("allows proposals again after the pin is cleared", async () => {
    const { createImportProposal, pinVersion, clearVersionPin } =
      await import("../skill-sync");
    insertSkillRow({
      name: "pinned-then-unpinned",
      content_hash:
        "0000000000000000000000000000000000000000000000000000000000000000",
      version: "1.0.0",
    });
    pinVersion(db, {
      skill_name: "pinned-then-unpinned",
      source_harness: "claude",
      version: "1.0.0",
      actor: "alice",
    });
    clearVersionPin(db, {
      skill_name: "pinned-then-unpinned",
      source_harness: "claude",
      actor: "alice",
    });

    const detected = {
      skill_name: "pinned-then-unpinned",
      source_harness: "claude",
      version: "2.0.0",
      raw_body: VALID_SKILL_MD("pinned-then-unpinned", "2.0.0"),
      content_hash:
        "1111111111111111111111111111111111111111111111111111111111111111",
      file_path: "/tmp/x.md",
      parse_error: null,
    };
    const result = createImportProposal(db, {
      source_harness: "claude",
      detected,
      proposed_by: "scanner",
    });
    expect(result.created).toBe(true);
    expect(result.proposal.status).toBe("pending");
  });
});

// ---------------------------------------------------------------------------
// VAL-SYNC-006 — One-step rollback restores prior version
// ---------------------------------------------------------------------------

describe("VAL-SYNC-006 one-step rollback restores prior version", () => {
  it("rollback restores the prior version content and hash on the registry row", async () => {
    const {
      createImportProposal,
      approveImportProposal,
      rollbackToPriorVersion,
    } = await import("../skill-sync");
    const oldHash =
      "0000000000000000000000000000000000000000000000000000000000000000";
    const newHash =
      "1111111111111111111111111111111111111111111111111111111111111111";
    const id = insertSkillRow({
      name: "rollback-skill",
      content_hash: oldHash,
      version: "1.0.0",
      raw_body: VALID_SKILL_MD("rollback-skill", "1.0.0"),
    });
    createImportProposal(db, {
      source_harness: "claude",
      detected: {
        skill_name: "rollback-skill",
        source_harness: "claude",
        version: "2.0.0",
        raw_body: VALID_SKILL_MD("rollback-skill", "2.0.0"),
        content_hash: newHash,
        file_path: "/tmp/rollback-skill.md",
        parse_error: null,
      },
      proposed_by: "scanner",
    });
    const approved = approveImportProposal(db, {
      source_harness: "claude",
      skill_name: "rollback-skill",
      operator: "alice",
    });
    expect(approved.last_synced_hash).toBe(newHash);

    const rolled = rollbackToPriorVersion(db, {
      skill_name: "rollback-skill",
      source_harness: "claude",
      operator: "alice",
    });
    expect(rolled.last_synced_hash).toBe(oldHash);

    const reg = db
      .prepare(
        `SELECT content_hash, version, raw_body FROM skill_registry WHERE id = ?`
      )
      .get(id) as {
      content_hash: string | null;
      version: string | null;
      raw_body: string | null;
    };
    expect(reg.content_hash).toBe(oldHash);
    expect(reg.version).toBe("1.0.0");
    expect(reg.raw_body).toBe(VALID_SKILL_MD("rollback-skill", "1.0.0"));
  });

  it("rollback is exactly one step — a second rollback fails", async () => {
    const {
      createImportProposal,
      approveImportProposal,
      rollbackToPriorVersion,
    } = await import("../skill-sync");
    insertSkillRow({
      name: "rollback-once",
      content_hash:
        "0000000000000000000000000000000000000000000000000000000000000000",
      version: "1.0.0",
      raw_body: VALID_SKILL_MD("rollback-once", "1.0.0"),
    });
    createImportProposal(db, {
      source_harness: "claude",
      detected: {
        skill_name: "rollback-once",
        source_harness: "claude",
        version: "2.0.0",
        raw_body: VALID_SKILL_MD("rollback-once", "2.0.0"),
        content_hash:
          "1111111111111111111111111111111111111111111111111111111111111111",
        file_path: "/tmp/x.md",
        parse_error: null,
      },
      proposed_by: "scanner",
    });
    approveImportProposal(db, {
      source_harness: "claude",
      skill_name: "rollback-once",
      operator: "alice",
    });
    rollbackToPriorVersion(db, {
      skill_name: "rollback-once",
      source_harness: "claude",
      operator: "alice",
    });
    expect(() =>
      rollbackToPriorVersion(db, {
        skill_name: "rollback-once",
        source_harness: "claude",
        operator: "alice",
      })
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// VAL-SYNC-007 — GET /api/skills/sync returns per-skill observability
// ---------------------------------------------------------------------------

describe("VAL-SYNC-007 GET /api/skills/sync observability", () => {
  it("returns per-skill observability with last_synced, pending, drift, pin", async () => {
    const { createImportProposal } = await import("../skill-sync");
    const { GET } = await import("../../../app/api/skills/sync/route");
    insertSkillRow({
      name: "obs-skill",
      content_hash:
        "0000000000000000000000000000000000000000000000000000000000000000",
      version: "1.0.0",
    });
    createImportProposal(db, {
      source_harness: "claude",
      detected: {
        skill_name: "obs-skill",
        source_harness: "claude",
        version: "2.0.0",
        raw_body: VALID_SKILL_MD("obs-skill", "2.0.0"),
        content_hash:
          "1111111111111111111111111111111111111111111111111111111111111111",
        file_path: "/tmp/x.md",
        parse_error: null,
      },
      proposed_by: "scanner",
    });

    const req = new Request("http://localhost:3000/api/skills/sync", {
      method: "GET",
    });
    const res = await GET(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    const found = json.items.find(
      (it: { skill_name: string; source_harness: string }) =>
        it.skill_name === "obs-skill" && it.source_harness === "claude"
    );
    expect(found).toBeTruthy();
    expect(found).toHaveProperty("last_synced_hash");
    expect(found).toHaveProperty("pending_proposal_id");
    expect(found).toHaveProperty("drift");
    expect(found).toHaveProperty("version_pinned_to");
    expect(found.drift).toBe(true);
    expect(found.pending_proposal_id).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// VAL-SYNC-008 — Sync check is idempotent
// ---------------------------------------------------------------------------

describe("VAL-SYNC-008 sync check is idempotent", () => {
  it("re-running the check with no changes creates zero new proposals", async () => {
    const { createImportProposal } = await import("../skill-sync");
    insertSkillRow({
      name: "stable-skill",
      content_hash:
        "0000000000000000000000000000000000000000000000000000000000000000",
      version: "1.0.0",
    });
    const detected = {
      skill_name: "stable-skill",
      source_harness: "claude",
      version: "2.0.0",
      raw_body: VALID_SKILL_MD("stable-skill", "2.0.0"),
      content_hash:
        "1111111111111111111111111111111111111111111111111111111111111111",
      file_path: "/tmp/x.md",
      parse_error: null,
    };
    const first = createImportProposal(db, {
      source_harness: "claude",
      detected,
      proposed_by: "scanner",
    });
    expect(first.created).toBe(true);
    expect(first.proposal.pending_proposal_id).toBeTruthy();

    const second = createImportProposal(db, {
      source_harness: "claude",
      detected,
      proposed_by: "scanner",
    });
    expect(second.created).toBe(false);
    expect(second.proposal.pending_proposal_id).toBe(
      first.proposal.pending_proposal_id
    );

    // Exactly one row in skill_sync_state for this skill+harness pair.
    const count = db
      .prepare(
        `SELECT COUNT(*) as c FROM skill_sync_state WHERE skill_name = ? AND source_harness = ?`
      )
      .get("stable-skill", "claude") as { c: number };
    expect(count.c).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// VAL-SYNC-009 — Malformed SKILL.md skipped gracefully
// ---------------------------------------------------------------------------

describe("VAL-SYNC-009 malformed SKILL.md files skipped gracefully", () => {
  it("returns valid entries and logs an error for malformed files without throwing", async () => {
    const { detectHarnessSkills } = await import("../skill-sync");
    const harnessRoots = buildHarnessRoots(TMP_ROOT);
    // Valid skill.
    writeHarnessSkill(
      harnessRoots.claude,
      "valid-skill",
      VALID_SKILL_MD("valid-skill", "1.0.0")
    );
    // Malformed: not parseable YAML frontmatter (frontmatter starts but never closes).
    const malformedPath = path.join(harnessRoots.claude, "malformed-skill.md");
    fs.mkdirSync(harnessRoots.claude, { recursive: true });
    fs.writeFileSync(
      malformedPath,
      "---\nname: still-going\nbut no closing fence\n## Body\nMore body text.\n",
      "utf8"
    );
    // Binary garbage — not parseable as UTF-8 text.
    const binaryPath = path.join(harnessRoots.claude, "binary-skill.md");
    fs.writeFileSync(binaryPath, Buffer.from([0xff, 0xfe, 0x00, 0x12, 0x80]));

    const detected = detectHarnessSkills({ roots: harnessRoots });
    const names = detected.entries.map((e) => e.skill_name).sort();
    expect(names).toContain("valid-skill");
    expect(detected.errors.length).toBeGreaterThan(0);
    const errorNames = detected.errors.map((e) =>
      path.basename(e.file_path)
    );
    expect(errorNames).toContain("malformed-skill.md");
    expect(errorNames).toContain("binary-skill.md");
  });
});

// ---------------------------------------------------------------------------
// VAL-SYNC-010 — Approved sync proposals route through quarantine
// ---------------------------------------------------------------------------

describe("VAL-SYNC-010 approved sync proposals enter quarantine", () => {
  it("after sync approval the dispatch_status is 'quarantined' (not 'enabled') and dispatch is denied", async () => {
    const {
      createImportProposal,
      approveImportProposal,
    } = await import("../skill-sync");
    const { lookupSkillContract } = await import("../../dispatch/skill-lookup");
    const id = insertSkillRow({
      name: "quarantine-skill",
      content_hash:
        "0000000000000000000000000000000000000000000000000000000000000000",
      version: "1.0.0",
    });
    createImportProposal(db, {
      source_harness: "claude",
      detected: {
        skill_name: "quarantine-skill",
        source_harness: "claude",
        version: "2.0.0",
        raw_body: VALID_SKILL_MD("quarantine-skill", "2.0.0"),
        content_hash:
          "1111111111111111111111111111111111111111111111111111111111111111",
        file_path: "/tmp/x.md",
        parse_error: null,
      },
      proposed_by: "scanner",
    });
    approveImportProposal(db, {
      source_harness: "claude",
      skill_name: "quarantine-skill",
      operator: "alice",
    });

    const reg = db
      .prepare(
        `SELECT dispatch_status FROM skill_registry WHERE id = ?`
      )
      .get(id) as { dispatch_status: string };
    expect(reg.dispatch_status).not.toBe("enabled");

    const lookup = lookupSkillContract(db, "quarantine-skill");
    expect(lookup?.kind).toBe("denied");
    if (lookup && lookup.kind === "denied") {
      expect(lookup.dispatch_status).not.toBe("enabled");
    }
  });
});

// ---------------------------------------------------------------------------
// API auth — POST endpoints require operator key
// ---------------------------------------------------------------------------

describe("sync API auth gates", () => {
  it("POST /api/skills/sync/check requires operator authentication", async () => {
    const { POST } = await import("../../../app/api/skills/sync/check/route");
    // No operator key configured, non-loopback.
    const req = new Request(
      "http://memroos.example.com/api/skills/sync/check",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roots: {} }),
      }
    );
    const res = await POST(req);
    expect([401, 403]).toContain(res.status);
  });

  it("POST /api/skills/sync/approve requires operator authentication", async () => {
    const { POST } = await import("../../../app/api/skills/sync/approve/route");
    const req = new Request(
      "http://memroos.example.com/api/skills/sync/approve",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          skill_name: "x",
          source_harness: "claude",
          operator: "alice",
        }),
      }
    );
    const res = await POST(req);
    expect([401, 403]).toContain(res.status);
  });
});

// ---------------------------------------------------------------------------
// VAL-SKILL-028 — symlink / traversal protection
// ---------------------------------------------------------------------------

describe("VAL-SKILL-028 detectHarnessSkills rejects symlinks and traversal escape", () => {
  it("skips symlinked files under the harness root and logs a refusal error", async () => {
    const { detectHarnessSkills } = await import("../skill-sync");
    const harnessRoots = buildHarnessRoots(TMP_ROOT);
    fs.mkdirSync(harnessRoots.claude, { recursive: true });
    // Real skill (should be picked up).
    writeHarnessSkill(
      harnessRoots.claude,
      "real-skill",
      VALID_SKILL_MD("real-skill", "1.0.0")
    );
    // External target file outside the harness root.
    const externalDir = path.join(TMP_ROOT, "external");
    fs.mkdirSync(externalDir, { recursive: true });
    const externalFile = path.join(externalDir, "external-skill.md");
    fs.writeFileSync(externalFile, VALID_SKILL_MD("external-skill", "1.0.0"), "utf8");
    // Symlink from inside harness root to the external file.
    fs.symlinkSync(externalFile, path.join(harnessRoots.claude, "leak-skill.md"));

    const detected = detectHarnessSkills({ roots: harnessRoots });
    const names = detected.entries.map((e) => e.skill_name);
    expect(names).toContain("real-skill");
    expect(names).not.toContain("external-skill");
    expect(names).not.toContain("leak-skill");
    const errorReasons = detected.errors.map((e) => e.reason);
    expect(errorReasons.some((r) => r.includes("symlink"))).toBe(true);
  });

  it("rejects a symlinked harness root with an explicit error", async () => {
    const { detectHarnessSkills } = await import("../skill-sync");
    const harnessRoots = buildHarnessRoots(TMP_ROOT);
    fs.mkdirSync(harnessRoots.claude, { recursive: true });
    writeHarnessSkill(
      harnessRoots.claude,
      "real-skill",
      VALID_SKILL_MD("real-skill", "1.0.0")
    );
    const realRoot = harnessRoots.claude;
    const symlinkRoot = path.join(TMP_ROOT, "harness-symlink");
    try {
      fs.symlinkSync(realRoot, symlinkRoot);
    } catch {
      // On systems that forbid symlinks the test is effectively a no-op;
      // the production code path is still exercised by the file-level
      // check above.
      return;
    }
    const roots = { ...harnessRoots, claude: symlinkRoot };
    const detected = detectHarnessSkills({ roots });
    // The symlinked root must be rejected.
    const rootErr = detected.errors.find((e) => e.file_path === symlinkRoot);
    expect(rootErr?.reason).toMatch(/symlink/i);
  });

  it("skips hidden / dot-prefixed entries under the harness root", async () => {
    const { detectHarnessSkills } = await import("../skill-sync");
    const harnessRoots = buildHarnessRoots(TMP_ROOT);
    fs.mkdirSync(harnessRoots.claude, { recursive: true });
    writeHarnessSkill(
      harnessRoots.claude,
      "normal-skill",
      VALID_SKILL_MD("normal-skill", "1.0.0")
    );
    fs.writeFileSync(
      path.join(harnessRoots.claude, ".hidden-skill.md"),
      VALID_SKILL_MD("hidden-skill", "1.0.0"),
      "utf8"
    );
    const detected = detectHarnessSkills({ roots: harnessRoots });
    const names = detected.entries.map((e) => e.skill_name);
    expect(names).toContain("normal-skill");
    expect(names).not.toContain("hidden-skill");
  });
});

// ---------------------------------------------------------------------------
// checkSync, listSyncState, clearVersionPin
// ---------------------------------------------------------------------------

describe("checkSync and sync state helpers", () => {
  it("checkSync scans harness roots and creates proposals for drift", async () => {
    const { checkSync } = await import("../skill-sync");
    const harnessRoots = buildHarnessRoots(TMP_ROOT);
    writeHarnessSkill(
      harnessRoots.claude,
      "check-sync-skill",
      VALID_SKILL_MD("check-sync-skill", "1.0.0")
    );
    insertSkillRow({
      name: "check-sync-skill",
      content_hash: "0".repeat(64),
      version: "0.9.0",
    });
    const result = checkSync(db, { roots: harnessRoots, proposed_by: "scanner" });
    expect(result.detected).toBeGreaterThanOrEqual(1);
    expect(result.created).toBeGreaterThanOrEqual(1);
    expect(result.errors).toEqual([]);
  });

  it("listSyncState and listSyncObservability expose pending and drift flags", async () => {
    const { createImportProposal, listSyncState, listSyncObservability } =
      await import("../skill-sync");
    insertSkillRow({
      name: "obs-drift",
      content_hash: "0".repeat(64),
      version: "1.0.0",
    });
    createImportProposal(db, {
      source_harness: "claude",
      detected: {
        skill_name: "obs-drift",
        source_harness: "claude",
        version: "2.0.0",
        raw_body: VALID_SKILL_MD("obs-drift", "2.0.0"),
        content_hash: "1".repeat(64),
        file_path: "/tmp/obs-drift.md",
        parse_error: null,
      },
      proposed_by: "scanner",
    });
    const rows = listSyncState(db, { pending_only: true });
    expect(rows.some((r) => r.skill_name === "obs-drift")).toBe(true);
    const observability = listSyncObservability(db, { pending_only: true });
    const item = observability.find((o) => o.skill_name === "obs-drift");
    expect(item?.drift).toBe(true);
    expect(item?.pending_proposal_id).toBeTruthy();
  });

  it("clearVersionPin removes an existing pin", async () => {
    const { pinVersion, clearVersionPin } = await import("../skill-sync");
    insertSkillRow({ name: "pin-clear", version: "1.0.0" });
    pinVersion(db, {
      skill_name: "pin-clear",
      source_harness: "claude",
      version: "1.0.0",
      actor: "alice",
    });
    const cleared = clearVersionPin(db, {
      skill_name: "pin-clear",
      source_harness: "claude",
      actor: "alice",
    });
    expect(cleared.version_pinned_to).toBeNull();
  });

  it("requireHarness rejects unsupported harness identifiers", async () => {
    const { requireHarness } = await import("../skill-sync");
    expect(() => requireHarness("unknown-harness")).toThrow(/Unsupported source_harness/);
  });
});


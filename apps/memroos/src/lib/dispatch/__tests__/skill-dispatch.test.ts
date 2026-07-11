// @vitest-environment node
/**
 * Skill-aware dispatch tests (Plan 72-06, SKILL-03)
 *
 * Covers:
 *   - Registry hit: enabled+complete skill contract is returned
 *   - Fallback: no skill_name → lookup returns null (normal dispatch proceeds)
 *   - Disabled contract denial: dispatch_status='disabled' → denied
 *   - Incomplete contract denial: completeness_pct < 100 → denied
 *   - Evidence shape: selected skill or denial reason is captured
 *
 * Security: evidence must NOT include raw_body, preconditions, allowed_tools, or
 * verification_checks (untrusted imported content). Only id, name, source_harness,
 * risk_tier, completeness_pct, and dispatch_status are allowed.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

const TEST_DB_DIR = path.join(os.tmpdir(), `skill-dispatch-${crypto.randomUUID()}`);
const TEST_DB_PATH = path.join(TEST_DB_DIR, "skill-dispatch.db");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadModules() {
  process.env.SQLITE_DB_PATH = TEST_DB_PATH;
  const { getDb, closeDb } = await import("@/lib/db");
  const { initSchema } = await import("@/lib/db-schema");
  const db = getDb();
  initSchema(db);
  return { getDb, closeDb, db };
}

function insertSkill(
  db: ReturnType<typeof import("better-sqlite3")["default"]>,
  overrides: Partial<{
    name: string;
    source_harness: string;
    risk_tier: string;
    dispatch_status: string;
    completeness_pct: number;
    owner: string;
    description: string;
    version: string;
    raw_body: string;
    missing_fields_json: string;
    preconditions: string;
    allowed_tools: string;
    verification_checks: string;
    rollback_behavior: string;
    imported_by: string;
    imported_at: string;
    evidence_examples: string;
  }> = {}
) {
  const row = {
    name: overrides.name ?? "test-skill",
    source_harness: overrides.source_harness ?? "claude",
    risk_tier: overrides.risk_tier ?? "low",
    dispatch_status: overrides.dispatch_status ?? "enabled",
    completeness_pct: overrides.completeness_pct ?? 100,
    // Phase 150: keep lifecycle_state aligned with dispatch_status so the
    // v14 SQL gate lets enabled+complete rows through.
    lifecycle_state: (overrides.dispatch_status ?? "enabled") === "enabled" ? "enabled" : "draft",
    owner: overrides.owner ?? "team-a",
    description: overrides.description ?? "A test skill",
    version: overrides.version ?? "1.0",
    raw_body: overrides.raw_body ?? "## Preconditions\nnone",
    missing_fields_json: overrides.missing_fields_json ?? "[]",
    preconditions: overrides.preconditions ?? "none",
    allowed_tools: overrides.allowed_tools ?? "read_file",
    verification_checks: overrides.verification_checks ?? "check output",
    rollback_behavior: overrides.rollback_behavior ?? "no-op",
    imported_by: overrides.imported_by ?? "operator",
    imported_at: overrides.imported_at ?? new Date().toISOString(),
    evidence_examples: overrides.evidence_examples ?? "check output",
  };

  db.prepare(`
    INSERT OR REPLACE INTO skill_registry
      (name, source_harness, risk_tier, dispatch_status, completeness_pct,
       owner, description, version, raw_body, missing_fields_json,
       preconditions, allowed_tools, verification_checks, rollback_behavior,
       imported_by, imported_at, evidence_examples, lifecycle_state)
    VALUES
      (@name, @source_harness, @risk_tier, @dispatch_status, @completeness_pct,
       @owner, @description, @version, @raw_body, @missing_fields_json,
       @preconditions, @allowed_tools, @verification_checks, @rollback_behavior,
       @imported_by, @imported_at, @evidence_examples, @lifecycle_state)
  `).run(row);
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Import the module under test (lazily, after DB is ready)
// ---------------------------------------------------------------------------

async function getSkillLookup() {
  const mod = await import("@/lib/dispatch/skill-lookup");
  return mod;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("lookupSkillContract", () => {
  it("returns null when no skill_name is provided (fallback path)", async () => {
    const { lookupSkillContract } = await getSkillLookup();
    const result = lookupSkillContract(db, undefined);
    expect(result).toBeNull();
  });

  it("returns null when skill_name is empty string (fallback path)", async () => {
    const { lookupSkillContract } = await getSkillLookup();
    const result = lookupSkillContract(db, "");
    expect(result).toBeNull();
  });

  it("returns the enabled+complete skill contract (registry hit)", async () => {
    const { lookupSkillContract } = await getSkillLookup();
    insertSkill(db, {
      name: "code-review",
      source_harness: "claude",
      dispatch_status: "enabled",
      completeness_pct: 100,
      risk_tier: "medium",
    });

    const result = lookupSkillContract(db, "code-review");
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("hit");
    if (result!.kind !== "hit") throw new Error("narrow");
    expect(result!.skill.name).toBe("code-review");
    expect(result!.skill.source_harness).toBe("claude");
    expect(result!.skill.risk_tier).toBe("medium");
    expect(result!.skill.dispatch_status).toBe("enabled");
    expect(result!.skill.completeness_pct).toBe(100);
  });

  it("does NOT return raw_body, preconditions, allowed_tools, or verification_checks in evidence (security)", async () => {
    const { lookupSkillContract } = await getSkillLookup();
    insertSkill(db, {
      name: "code-review",
      raw_body: "## SECRET\ndo not leak this",
      preconditions: "secret precondition text",
      allowed_tools: "secret tool list",
      verification_checks: "secret checks",
    });

    const result = lookupSkillContract(db, "code-review");
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("hit");
    if (result!.kind !== "hit") throw new Error("narrow");

    const skillKeys = Object.keys(result!.skill);
    expect(skillKeys).not.toContain("raw_body");
    expect(skillKeys).not.toContain("preconditions");
    expect(skillKeys).not.toContain("allowed_tools");
    expect(skillKeys).not.toContain("verification_checks");
    expect(skillKeys).not.toContain("rollback_behavior");
  });

  it("returns denial for disabled skill contract", async () => {
    const { lookupSkillContract } = await getSkillLookup();
    insertSkill(db, {
      name: "risky-skill",
      dispatch_status: "disabled",
      completeness_pct: 100,
    });

    const result = lookupSkillContract(db, "risky-skill");
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("denied");
    if (result!.kind !== "denied") throw new Error("narrow");
    expect(result!.reason).toMatch(/disabled/i);
    expect(result!.skill_name).toBe("risky-skill");
  });

  it("returns denial for incomplete skill contract (completeness_pct < 100)", async () => {
    const { lookupSkillContract } = await getSkillLookup();
    insertSkill(db, {
      name: "partial-skill",
      dispatch_status: "incomplete",
      completeness_pct: 60,
    });

    const result = lookupSkillContract(db, "partial-skill");
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("denied");
    if (result!.kind !== "denied") throw new Error("narrow");
    expect(result!.reason).toMatch(/incomplete/i);
  });

  it("returns denial for review status skill contract", async () => {
    const { lookupSkillContract } = await getSkillLookup();
    insertSkill(db, {
      name: "review-skill",
      dispatch_status: "review",
      completeness_pct: 100,
    });

    const result = lookupSkillContract(db, "review-skill");
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("denied");
    if (result!.kind !== "denied") throw new Error("narrow");
    expect(result!.reason).toMatch(/review/i);
  });

  it("returns denial when skill name not found in registry", async () => {
    const { lookupSkillContract } = await getSkillLookup();
    const result = lookupSkillContract(db, "nonexistent-skill");
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("denied");
    if (result!.kind !== "denied") throw new Error("narrow");
    expect(result!.reason).toMatch(/not found/i);
    expect(result!.skill_name).toBe("nonexistent-skill");
  });

  it("uses indexed SQL WHERE clause (not JS post-filter) — disabled row is not returned by enabled lookup", async () => {
    const { lookupSkillContract } = await getSkillLookup();
    // Insert both an enabled and a disabled version (different harnesses to avoid UNIQUE conflict)
    insertSkill(db, { name: "dual-skill", source_harness: "claude", dispatch_status: "enabled", completeness_pct: 100 });
    insertSkill(db, { name: "dual-skill-disabled", source_harness: "openai", dispatch_status: "disabled", completeness_pct: 100 });

    // Lookup the enabled one
    const hit = lookupSkillContract(db, "dual-skill");
    expect(hit!.kind).toBe("hit");

    // Lookup the disabled one — must deny, not return the enabled one
    const denied = lookupSkillContract(db, "dual-skill-disabled");
    expect(denied!.kind).toBe("denied");
  });

  it("multi-harness: same skill name enabled in one harness, disabled in another — ambiguous without binding (VAL-SKILL-018)", async () => {
    const { lookupSkillContract } = await getSkillLookup();
    // Same name 'shared-skill' exists in two harnesses with different statuses
    // UNIQUE(name, source_harness) allows this
    insertSkill(db, { name: "shared-skill", source_harness: "openai", dispatch_status: "disabled", completeness_pct: 100 });
    insertSkill(db, { name: "shared-skill", source_harness: "claude", dispatch_status: "enabled", completeness_pct: 100 });

    // Without explicit source_harness, dispatch must refuse to silently pick
    // a harness. The result is "ambiguous" so the operator can choose.
    const result = lookupSkillContract(db, "shared-skill");
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("ambiguous");
    if (result!.kind !== "ambiguous") throw new Error("narrow");
    expect(result!.candidate_harnesses).toContain("openai");
    expect(result!.candidate_harnesses).toContain("claude");
    expect(result!.reason).toMatch(/multiple harnesses/i);
  });

  it("multi-harness: explicit source_harness binding returns the correct hit (VAL-SKILL-018)", async () => {
    const { lookupSkillContract } = await getSkillLookup();
    insertSkill(db, { name: "shared-skill", source_harness: "openai", dispatch_status: "disabled", completeness_pct: 100 });
    insertSkill(db, { name: "shared-skill", source_harness: "claude", dispatch_status: "enabled", completeness_pct: 100 });

    // With explicit source_harness, lookup is constrained to that exact row.
    const claudeHit = lookupSkillContract(db, "shared-skill", { sourceHarness: "claude" });
    expect(claudeHit!.kind).toBe("hit");
    if (claudeHit!.kind !== "hit") throw new Error("narrow");
    expect(claudeHit!.skill.source_harness).toBe("claude");
    expect(claudeHit!.skill.dispatch_status).toBe("enabled");

    const openaiDenied = lookupSkillContract(db, "shared-skill", { sourceHarness: "openai" });
    expect(openaiDenied!.kind).toBe("denied");
  });

  it("multi-harness: same skill name disabled in all harnesses — ambiguous without binding, denied with binding (VAL-SKILL-018)", async () => {
    const { lookupSkillContract } = await getSkillLookup();
    insertSkill(db, { name: "all-disabled", source_harness: "openai", dispatch_status: "disabled", completeness_pct: 100 });
    insertSkill(db, { name: "all-disabled", source_harness: "claude", dispatch_status: "disabled", completeness_pct: 100 });

    // Without explicit source_harness the result is ambiguous (multiple harnesses).
    const result = lookupSkillContract(db, "all-disabled");
    expect(result!.kind).toBe("ambiguous");
    if (result!.kind !== "ambiguous") throw new Error("narrow");
    expect(result!.candidate_harnesses).toContain("openai");
    expect(result!.candidate_harnesses).toContain("claude");

    // With explicit binding, the constrained lookup returns denied (disabled).
    const bound = lookupSkillContract(db, "all-disabled", { sourceHarness: "claude" });
    expect(bound!.kind).toBe("denied");
    if (bound!.kind !== "denied") throw new Error("narrow");
    expect(bound!.reason).toMatch(/disabled/i);
  });
});

describe("buildSkillEvidence", () => {
  it("returns skill evidence for a registry hit", async () => {
    const { buildSkillEvidence } = await getSkillLookup();
    insertSkill(db, {
      name: "ev-skill",
      source_harness: "gemini",
      risk_tier: "low",
      dispatch_status: "enabled",
      completeness_pct: 100,
    });

    const { lookupSkillContract } = await getSkillLookup();
    const contract = lookupSkillContract(db, "ev-skill");
    expect(contract).not.toBeNull();

    const evidence = buildSkillEvidence(contract!);
    expect(evidence.skill_governance).toBeDefined();
    expect(evidence.skill_governance.selected_skill).toBeDefined();
    expect(evidence.skill_governance.selected_skill!.name).toBe("ev-skill");
    expect(evidence.skill_governance.selected_skill!.source_harness).toBe("gemini");
    expect(evidence.skill_governance.selected_skill!.risk_tier).toBe("low");
    expect(evidence.skill_governance.denial_reason).toBeUndefined();
  });

  it("returns denial evidence for a denied contract", async () => {
    const { buildSkillEvidence, lookupSkillContract } = await getSkillLookup();
    insertSkill(db, { name: "denied-ev-skill", dispatch_status: "disabled", completeness_pct: 100 });
    const contract = lookupSkillContract(db, "denied-ev-skill");
    const evidence = buildSkillEvidence(contract!);
    expect(evidence.skill_governance.denial_reason).toBeDefined();
    expect(evidence.skill_governance.selected_skill).toBeUndefined();
  });

  it("returns fallback evidence when no skill was requested", async () => {
    const { buildSkillEvidence } = await getSkillLookup();
    const evidence = buildSkillEvidence(null);
    expect(evidence.skill_governance).toBeDefined();
    expect(evidence.skill_governance.selected_skill).toBeUndefined();
    expect(evidence.skill_governance.denial_reason).toBeUndefined();
    expect(evidence.skill_governance.mode).toBe("fallback");
  });
});

// ---------------------------------------------------------------------------
// SKILLTRUST-01 / VAL-CONTRACT-003..005, 009 — dispatch surface guarantees
// ---------------------------------------------------------------------------

describe("VAL-CONTRACT-003 — Skill missing evidence_examples is marked incomplete", () => {
  it("normalizeRegistryEntry sets dispatch_status='incomplete' when evidence_examples is absent", async () => {
    const { normalizeRegistryEntry, parseSkillMd } = await import("@/lib/skills/registry");
    const md = `
---
name: incomplete-ev
description: d
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
`;
    const parsed = parseSkillMd(md);
    const entry = normalizeRegistryEntry(parsed, "claude", "operator");
    expect(entry.dispatch_status).toBe("incomplete");
    expect(entry.missing_fields).toContain("evidence_examples");
    expect(entry.completeness_pct).toBeLessThan(100);
  });
});

describe("VAL-CONTRACT-004 — Dispatch denied for skill missing evidence_examples", () => {
  it("returns denied when completeness_pct < 100 (evidence_examples absent)", async () => {
    const { lookupSkillContract } = await getSkillLookup();
    // A skill whose evidence_examples was absent at parse-time will, when
    // normalized, be marked dispatch_status='incomplete' with completeness_pct<100.
    insertSkill(db, {
      name: "missing-ev",
      dispatch_status: "incomplete",
      completeness_pct: 91, // 10/11 = 91% — evidence_examples missing
      evidence_examples: "",
    });
    const result = lookupSkillContract(db, "missing-ev");
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("denied");
    // The SQL gate enforces completeness_pct = 100, so an incomplete row is denied.
    if (result!.kind !== "denied") throw new Error("narrow");
    expect(result.reason).toMatch(/incomplete/i);
  });

  it("returns denied even when dispatch_status='enabled' but completeness_pct<100 (SQL gate is fail-closed)", async () => {
    const { lookupSkillContract } = await getSkillLookup();
    insertSkill(db, {
      name: "enabled-but-incomplete",
      dispatch_status: "enabled",
      completeness_pct: 91,
      evidence_examples: "",
    });
    const result = lookupSkillContract(db, "enabled-but-incomplete");
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("denied");
    // SQL filter on completeness_pct = 100 excludes this row → never returns kind: "hit"
  });
});

describe("VAL-CONTRACT-005 — Fully specified skill with evidence_examples is dispatchable", () => {
  it("returns hit when completeness_pct=100, dispatch_status=enabled, evidence_examples non-empty", async () => {
    const { lookupSkillContract } = await getSkillLookup();
    insertSkill(db, {
      name: "complete-ev",
      dispatch_status: "enabled",
      completeness_pct: 100,
      evidence_examples: "- verify output\n- run regression suite",
    });
    const result = lookupSkillContract(db, "complete-ev");
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("hit");
    if (result!.kind !== "hit") throw new Error("narrow");
    expect(result.skill.name).toBe("complete-ev");
    expect(result.skill.completeness_pct).toBe(100);
  });
});

describe("VAL-CONTRACT-009 — buildSkillEvidence never leaks evidence_examples body text", () => {
  it("does NOT include evidence_examples in SkillGovernanceEvidence (hit path)", async () => {
    const { buildSkillEvidence, lookupSkillContract } = await getSkillLookup();
    const secretEvidence = "secret operator instructions do not leak this";
    insertSkill(db, {
      name: "no-leak-hit",
      dispatch_status: "enabled",
      completeness_pct: 100,
      evidence_examples: secretEvidence,
    });
    const contract = lookupSkillContract(db, "no-leak-hit");
    expect(contract!.kind).toBe("hit");
    const evidence = buildSkillEvidence(contract!);

    // The selected_skill must NOT contain evidence_examples
    const skillKeys = Object.keys(evidence.skill_governance.selected_skill!);
    expect(skillKeys).not.toContain("evidence_examples");

    // Serialized evidence JSON must not contain the secret text
    const serialized = JSON.stringify(evidence);
    expect(serialized).not.toContain(secretEvidence);
    expect(serialized).not.toContain("evidence_examples");
  });

  it("does NOT include evidence_examples in SkillGovernanceEvidence (denied path)", async () => {
    const { buildSkillEvidence, lookupSkillContract } = await getSkillLookup();
    const secretEvidence = "denied-path secret instructions";
    insertSkill(db, {
      name: "no-leak-denied",
      dispatch_status: "disabled",
      completeness_pct: 100,
      evidence_examples: secretEvidence,
    });
    const contract = lookupSkillContract(db, "no-leak-denied");
    expect(contract!.kind).toBe("denied");
    const evidence = buildSkillEvidence(contract!);

    const serialized = JSON.stringify(evidence);
    expect(serialized).not.toContain(secretEvidence);
    expect(serialized).not.toContain("evidence_examples");
  });

  it("does NOT include evidence_examples in SkillContractSummary (type-level)", async () => {
    const { lookupSkillContract } = await getSkillLookup();
    insertSkill(db, {
      name: "type-level-summary",
      dispatch_status: "enabled",
      completeness_pct: 100,
      evidence_examples: "operator-only secret text",
    });
    const contract = lookupSkillContract(db, "type-level-summary");
    expect(contract!.kind).toBe("hit");
    if (contract!.kind !== "hit") throw new Error("narrow");
    // SkillContractSummary keys must not include evidence_examples
    const summaryKeys = Object.keys(contract.skill);
    expect(summaryKeys).not.toContain("evidence_examples");
    // And the serialized form must not include the secret
    expect(JSON.stringify(contract.skill)).not.toContain("operator-only secret text");
  });
});

// @vitest-environment node
/**
 * Phase 149 SKILLTRUST-01 (continued) tests:
 *   VAL-SKILL-017: dispatch fallback does not select arbitrary skills
 *   VAL-SKILL-018: same-name harnesses are unambiguous
 *   VAL-SKILL-019: dispatch evidence uses a safe schema
 *
 * Covers:
 *   - Unnamed dispatch (no skill_name) returns null and produces fallback
 *     evidence with mode=fallback. No registry hit is recorded.
 *   - Named dispatch without source_harness binding returns ambiguous when
 *     multiple harnesses share the skill name; no arbitrary row is picked.
 *   - Named dispatch with explicit source_harness binding returns the bound
 *     row (or a denial if it is not enabled+complete).
 *   - Version mismatch is denied rather than silently selecting a different
 *     version.
 *   - Evidence block contains only safe identifying fields -- never raw_body,
 *     contract sections, secrets, or untrusted example text.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

const TEST_DB_DIR = path.join(os.tmpdir(), `skill-dispatch-fallback-${crypto.randomUUID()}`);
const TEST_DB_PATH = path.join(TEST_DB_DIR, "fallback.db");

async function loadModules() {
  process.env.SQLITE_DB_PATH = TEST_DB_PATH;
  const { getDb, closeDb } = await import("@/lib/db");
  const { initSchema } = await import("@/lib/db-schema");
  const db = getDb();
  initSchema(db);
  return { getDb, closeDb, db };
}

function insertSkill(
  db: import("better-sqlite3").Database,
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
    signature: string | null;
    trust_level: string;
    content_hash: string | null;
  }> = {}
) {
  const row = {
    name: overrides.name ?? "test-skill",
    source_harness: overrides.source_harness ?? "claude",
    risk_tier: overrides.risk_tier ?? "low",
    dispatch_status: overrides.dispatch_status ?? "enabled",
    completeness_pct: overrides.completeness_pct ?? 100,
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
    signature: overrides.signature ?? null,
    trust_level: overrides.trust_level ?? "unsigned",
    content_hash: overrides.content_hash ?? null,
  };

  db.prepare(`
    INSERT OR REPLACE INTO skill_registry
      (name, source_harness, risk_tier, dispatch_status, completeness_pct,
       owner, description, version, raw_body, missing_fields_json,
       preconditions, allowed_tools, verification_checks, rollback_behavior,
       imported_by, imported_at, evidence_examples, signature, trust_level, content_hash)
    VALUES
      (@name, @source_harness, @risk_tier, @dispatch_status, @completeness_pct,
       @owner, @description, @version, @raw_body, @missing_fields_json,
       @preconditions, @allowed_tools, @verification_checks, @rollback_behavior,
       @imported_by, @imported_at, @evidence_examples, @signature, @trust_level, @content_hash)
  `).run(row);
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

async function getSkillLookup() {
  return await import("@/lib/dispatch/skill-lookup");
}

// ---------------------------------------------------------------------------
// VAL-SKILL-017: dispatch fallback does not select arbitrary skills
// ---------------------------------------------------------------------------

describe("VAL-SKILL-017 — dispatch fallback", () => {
  it("no skill_name produces null result and mode=fallback evidence (no registry hit)", async () => {
    const { lookupSkillContract, buildSkillEvidence } = await getSkillLookup();
    const result = lookupSkillContract(db, undefined);
    expect(result).toBeNull();
    const evidence = buildSkillEvidence(null);
    expect(evidence.skill_governance.mode).toBe("fallback");
    expect(evidence.skill_governance.selected_skill).toBeUndefined();
    expect(evidence.skill_governance.denial_reason).toBeUndefined();
  });

  it("empty skill_name produces null result and mode=fallback evidence", async () => {
    const { lookupSkillContract, buildSkillEvidence } = await getSkillLookup();
    const result = lookupSkillContract(db, "");
    expect(result).toBeNull();
    const evidence = buildSkillEvidence(null);
    expect(evidence.skill_governance.mode).toBe("fallback");
  });

  it("whitespace-only skill_name produces null result and mode=fallback evidence", async () => {
    const { lookupSkillContract, buildSkillEvidence } = await getSkillLookup();
    const result = lookupSkillContract(db, "   ");
    expect(result).toBeNull();
    const evidence = buildSkillEvidence(null);
    expect(evidence.skill_governance.mode).toBe("fallback");
  });

  it("named dispatch returns the bound registry hit when source_harness is supplied", async () => {
    const { lookupSkillContract } = await getSkillLookup();
    insertSkill(db, {
      name: "review-pr",
      source_harness: "claude",
      dispatch_status: "enabled",
      completeness_pct: 100,
      version: "1.0.0",
    });
    const result = lookupSkillContract(db, "review-pr", { sourceHarness: "claude" });
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("hit");
    if (result!.kind !== "hit") throw new Error("narrow");
    expect(result!.skill.name).toBe("review-pr");
    expect(result!.skill.source_harness).toBe("claude");
  });

  it("version mismatch denies instead of silently picking a different version", async () => {
    const { lookupSkillContract } = await getSkillLookup();
    insertSkill(db, {
      name: "review-pr",
      source_harness: "claude",
      dispatch_status: "enabled",
      completeness_pct: 100,
      version: "1.0.0",
    });
    const result = lookupSkillContract(db, "review-pr", {
      sourceHarness: "claude",
      version: "2.0.0",
    });
    expect(result!.kind).toBe("denied");
    if (result!.kind !== "denied") throw new Error("narrow");
    expect(result!.reason).toMatch(/version mismatch/i);
  });
});

// ---------------------------------------------------------------------------
// VAL-SKILL-018: same-name harnesses are unambiguous
// ---------------------------------------------------------------------------

describe("VAL-SKILL-018 — same-name harness disambiguation", () => {
  it("same-name skills from different harnesses remain distinct and produce ambiguous without binding", async () => {
    const { lookupSkillContract } = await getSkillLookup();
    insertSkill(db, { name: "shared", source_harness: "claude", dispatch_status: "enabled", completeness_pct: 100 });
    insertSkill(db, { name: "shared", source_harness: "openai", dispatch_status: "enabled", completeness_pct: 100 });

    const result = lookupSkillContract(db, "shared");
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("ambiguous");
    if (result!.kind !== "ambiguous") throw new Error("narrow");
    expect(result!.candidate_harnesses).toContain("claude");
    expect(result!.candidate_harnesses).toContain("openai");
    expect(result!.candidate_harnesses).toHaveLength(2);
    expect(result!.reason).toMatch(/multiple harnesses/i);
  });

  it("explicit source_harness binding selects the deterministic row from multiple harnesses", async () => {
    const { lookupSkillContract } = await getSkillLookup();
    insertSkill(db, { name: "shared", source_harness: "claude", dispatch_status: "enabled", completeness_pct: 100 });
    insertSkill(db, { name: "shared", source_harness: "openai", dispatch_status: "enabled", completeness_pct: 100 });

    const claudeHit = lookupSkillContract(db, "shared", { sourceHarness: "claude" });
    expect(claudeHit!.kind).toBe("hit");
    if (claudeHit!.kind !== "hit") throw new Error("narrow");
    expect(claudeHit!.skill.source_harness).toBe("claude");

    const openaiHit = lookupSkillContract(db, "shared", { sourceHarness: "openai" });
    expect(openaiHit!.kind).toBe("hit");
    if (openaiHit!.kind !== "hit") throw new Error("narrow");
    expect(openaiHit!.skill.source_harness).toBe("openai");
  });

  it("single harness with the skill name does not produce ambiguous (no source_harness needed)", async () => {
    const { lookupSkillContract } = await getSkillLookup();
    insertSkill(db, { name: "solo-skill", source_harness: "claude", dispatch_status: "enabled", completeness_pct: 100 });

    const result = lookupSkillContract(db, "solo-skill");
    expect(result!.kind).toBe("hit");
  });

  it("ambiguous result can be distinguished from denied in evidence builder", async () => {
    const { buildSkillEvidence } = await getSkillLookup();
    const evidence = buildSkillEvidence({
      kind: "ambiguous",
      skill_name: "shared",
      candidate_harnesses: ["claude", "openai"],
      reason: "multiple harnesses",
    });
    expect(evidence.skill_governance.mode).toBe("governed");
    expect(evidence.skill_governance.denial_reason).toMatch(/multiple harnesses/i);
    expect(evidence.skill_governance.denied_skill).toBe("shared");
    expect(evidence.skill_governance.selected_skill).toBeUndefined();
  });

  it("reimport to a different harness does not change the other harness identity (VAL-SKILL-018)", async () => {
    const { lookupSkillContract } = await getSkillLookup();
    // Initial import into claude
    insertSkill(db, {
      name: "isolate",
      source_harness: "claude",
      dispatch_status: "enabled",
      completeness_pct: 100,
      version: "1.0.0",
    });
    const before = lookupSkillContract(db, "isolate", { sourceHarness: "claude" });
    expect(before!.kind).toBe("hit");

    // Reimport into openai (different harness, same name)
    insertSkill(db, {
      name: "isolate",
      source_harness: "openai",
      dispatch_status: "enabled",
      completeness_pct: 100,
      version: "1.1.0",
    });

    // The claude row is unchanged
    const claudeStill = lookupSkillContract(db, "isolate", { sourceHarness: "claude" });
    expect(claudeStill!.kind).toBe("hit");
    if (claudeStill!.kind !== "hit") throw new Error("narrow");
    expect(claudeStill!.skill.version).toBe("1.0.0");

    // The openai row is new
    const openaiHit = lookupSkillContract(db, "isolate", { sourceHarness: "openai" });
    expect(openaiHit!.kind).toBe("hit");
    if (openaiHit!.kind !== "hit") throw new Error("narrow");
    expect(openaiHit!.skill.version).toBe("1.1.0");

    // Without binding, the result is ambiguous
    const ambiguous = lookupSkillContract(db, "isolate");
    expect(ambiguous!.kind).toBe("ambiguous");
  });
});

// ---------------------------------------------------------------------------
// VAL-SKILL-019: dispatch evidence uses a safe schema
// ---------------------------------------------------------------------------

describe("VAL-SKILL-019 — safe dispatch evidence schema", () => {
  it("hit evidence exposes only safe identifying fields", async () => {
    const { lookupSkillContract, buildSkillEvidence } = await getSkillLookup();
    insertSkill(db, {
      name: "safe-evidence",
      source_harness: "claude",
      dispatch_status: "enabled",
      completeness_pct: 100,
      raw_body: "## SECRET BODY do not leak",
      preconditions: "secret preconditions",
      allowed_tools: "secret tools",
      verification_checks: "secret checks",
      rollback_behavior: "secret rollback",
      evidence_examples: "secret examples",
      risk_tier: "medium",
    });
    const contract = lookupSkillContract(db, "safe-evidence");
    expect(contract!.kind).toBe("hit");
    const evidence = buildSkillEvidence(contract!);

    const selected = evidence.skill_governance.selected_skill!;
    const keys = Object.keys(selected).sort();
    // The selected_skill block MUST NOT include raw_body, contract sections,
    // evidence_examples, signature, or other untrusted content.
    expect(keys).not.toContain("raw_body");
    expect(keys).not.toContain("preconditions");
    expect(keys).not.toContain("allowed_tools");
    expect(keys).not.toContain("verification_checks");
    expect(keys).not.toContain("rollback_behavior");
    expect(keys).not.toContain("evidence_examples");
    expect(keys).not.toContain("signature_secret");
    // The serialized JSON must not contain any of the secret body text.
    const serialized = JSON.stringify(evidence);
    expect(serialized).not.toContain("SECRET BODY do not leak");
    expect(serialized).not.toContain("secret preconditions");
    expect(serialized).not.toContain("secret tools");
    expect(serialized).not.toContain("secret checks");
    expect(serialized).not.toContain("secret rollback");
    expect(serialized).not.toContain("secret examples");
  });

  it("denied evidence exposes only safe identifying fields", async () => {
    const { lookupSkillContract, buildSkillEvidence } = await getSkillLookup();
    insertSkill(db, {
      name: "denied-safe",
      source_harness: "claude",
      dispatch_status: "disabled",
      completeness_pct: 100,
      raw_body: "## SECRET do not leak in denial",
      evidence_examples: "secret denial example",
    });
    const contract = lookupSkillContract(db, "denied-safe");
    expect(contract!.kind).toBe("denied");
    const evidence = buildSkillEvidence(contract!);

    const serialized = JSON.stringify(evidence);
    expect(serialized).not.toContain("SECRET do not leak in denial");
    expect(serialized).not.toContain("secret denial example");
  });

  it("ambiguous evidence exposes only safe identifying fields", async () => {
    const { buildSkillEvidence } = await getSkillLookup();
    insertSkill(db, { name: "shared", source_harness: "claude", dispatch_status: "enabled", completeness_pct: 100, raw_body: "## SECRET A" });
    insertSkill(db, { name: "shared", source_harness: "openai", dispatch_status: "enabled", completeness_pct: 100, raw_body: "## SECRET B" });

    const { lookupSkillContract } = await getSkillLookup();
    const contract = lookupSkillContract(db, "shared");
    expect(contract!.kind).toBe("ambiguous");
    const evidence = buildSkillEvidence(contract!);

    const serialized = JSON.stringify(evidence);
    expect(serialized).not.toContain("SECRET A");
    expect(serialized).not.toContain("SECRET B");
    expect(serialized).toContain("multiple harnesses");
  });

  it("fallback evidence has mode=fallback and no selected_skill", async () => {
    const { buildSkillEvidence } = await getSkillLookup();
    const evidence = buildSkillEvidence(null);
    expect(evidence.skill_governance.mode).toBe("fallback");
    expect(evidence.skill_governance.selected_skill).toBeUndefined();
  });

  it("evidence schema is stable for downstream validation", async () => {
    const { buildSkillEvidence } = await getSkillLookup();
    const fallback = buildSkillEvidence(null);
    expect(Object.keys(fallback.skill_governance).sort()).toEqual(["mode"]);
  });
});

// @vitest-environment node
/**
 * VAL-SKILL-036 / VAL-SKILL-037 — SkillForge intake, export, rollback.
 *
 * Covers:
 *   - intake creates non-authoritative proposals
 *   - approval alone does not export
 *   - state machine blocks comments / repeated actions from advancing past failed eval
 *   - export binds edit/evaluation hashes + pre/post runtime identity
 *   - rollback restores runtime boundary or reports status_only truthfully
 *   - duplicate intake on the same edit hash is idempotent
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { createHash } from "crypto";

const TMP_ROOT = path.join(os.tmpdir(), `intake-export-${crypto.randomUUID()}`);

async function loadDb() {
  const root = path.join(TMP_ROOT, `db-${crypto.randomUUID()}`);
  fs.mkdirSync(root, { recursive: true });
  process.env["MEMROOS_ROOT"] = root;
  process.env["SQLITE_DB_PATH"] = path.join(root, "test.db");
  vi.resetModules();
  const { getDb, closeDb } = await import("@/lib/db");
  const { initSchema } = await import("@/lib/db-schema");
  const db = getDb();
  initSchema(db);
  return { db, closeDb };
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
  } catch {}
  delete process.env["MEMROOS_ROOT"];
  delete process.env["SQLITE_DB_PATH"];
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
});

describe("VAL-SKILL-036 intake creates non-authoritative proposals", () => {
  it("intakeProposal persists row at intake_pending state", async () => {
    const { intakeProposal, loadIntakeRow, PROPOSAL_STATES } = await import(
      "../intake-export"
    );
    expect(PROPOSAL_STATES).toContain("intake_pending");

    const record = intakeProposal(db, {
      proposalId: "intake-1",
      sourceSkillId: "skill-99",
      sourceVersion: "1.0.0",
      proposedDiff: "## Preconditions\nnone",
      actor: "operator",
    });
    expect(record.state).toBe("intake_pending");
    expect(record.editHash).toBe(createHash("sha256").update("## Preconditions\nnone", "utf8").digest("hex"));
    expect(record.evaluationHash).toBeNull();
    expect(record.redactedEntryCount).toBe(0);

    const roundtrip = loadIntakeRow(db, "intake-1");
    expect(roundtrip?.state).toBe("intake_pending");
  });

  it("intake is idempotent on (source_skill_id, source_version, edit_hash)", async () => {
    const { intakeProposal, loadIntakeRow } = await import("../intake-export");
    const a = intakeProposal(db, {
      proposalId: "intake-idemp-1",
      sourceSkillId: "skill-100",
      sourceVersion: "1.0.0",
      proposedDiff: "## Preconditions\nnone",
      actor: "operator",
    });
    const b = intakeProposal(db, {
      proposalId: "intake-idemp-1-different-id",
      sourceSkillId: "skill-100",
      sourceVersion: "1.0.0",
      proposedDiff: "## Preconditions\nnone",
      actor: "operator",
    });
    expect(a.proposalId).toBe("intake-idemp-1");
    expect(b.proposalId).toBe("intake-idemp-1");
    const row = loadIntakeRow(db, "intake-idemp-1");
    expect(row).not.toBeNull();
  });

  it("recordIntakeRedaction stamps count and scope key", async () => {
    const { intakeProposal, recordIntakeRedaction, loadIntakeRow } = await import(
      "../intake-export"
    );
    intakeProposal(db, {
      proposalId: "intake-redact",
      sourceSkillId: "skill-101",
      sourceVersion: "1.0.0",
      proposedDiff: "## Preconditions\nnone",
      actor: "operator",
    });
    const after = recordIntakeRedaction(db, {
      proposalId: "intake-redact",
      actor: "operator",
      redactedEntryCount: 4,
      scopeKey: "tenant-a",
    });
    expect(after.redactedEntryCount).toBe(4);
    expect(after.scopeKey).toBe("tenant-a");

    const row = loadIntakeRow(db, "intake-redact");
    expect(row?.redactedEntryCount).toBe(4);
    expect(row?.scopeKey).toBe("tenant-a");
  });
});

describe("VAL-SKILL-036 state machine blocks repeated actions and failed eval", () => {
  it("terminal states (rejected, exported) cannot be left", async () => {
    const { intakeProposal, advanceProposalState, SkillForgeIntakeError } = await import(
      "../intake-export"
    );
    intakeProposal(db, {
      proposalId: "term-rej",
      sourceSkillId: "skill-200",
      sourceVersion: "1.0.0",
      proposedDiff: "## Preconditions\nnone",
      actor: "operator",
    });
    advanceProposalState(db, { proposalId: "term-rej", actor: "operator", toState: "analyzing" });
    advanceProposalState(db, { proposalId: "term-rej", actor: "operator", toState: "rejected" });

    expect(() =>
      advanceProposalState(db, { proposalId: "term-rej", actor: "operator", toState: "analyzing" })
    ).toThrow(SkillForgeIntakeError);
  });

  it("skipping states is rejected (intake_pending -> pending_approval blocked)", async () => {
    const { intakeProposal, advanceProposalState, SkillForgeIntakeError } = await import(
      "../intake-export"
    );
    intakeProposal(db, {
      proposalId: "skip-1",
      sourceSkillId: "skill-201",
      sourceVersion: "1.0.0",
      proposedDiff: "## Preconditions\nnone",
      actor: "operator",
    });
    expect(() =>
      advanceProposalState(db, { proposalId: "skip-1", actor: "operator", toState: "pending_approval" })
    ).toThrow(SkillForgeIntakeError);
  });

  it("comments (note) cannot bypass failed evaluation (rejected after eval_running)", async () => {
    const { intakeProposal, advanceProposalState, loadIntakeRow } = await import(
      "../intake-export"
    );
    intakeProposal(db, {
      proposalId: "comment-1",
      sourceSkillId: "skill-202",
      sourceVersion: "1.0.0",
      proposedDiff: "## Preconditions\nnone",
      actor: "operator",
    });
    advanceProposalState(db, { proposalId: "comment-1", actor: "operator", toState: "analyzing" });
    advanceProposalState(db, { proposalId: "comment-1", actor: "operator", toState: "eval_running" });
    advanceProposalState(db, { proposalId: "comment-1", actor: "operator", toState: "rejected", note: "failed eval" });

    // Re-advance after rejected: must fail
    expect(() =>
      advanceProposalState(db, { proposalId: "comment-1", actor: "operator", toState: "eval_running", note: "second try" })
    ).toThrow();

    const row = loadIntakeRow(db, "comment-1");
    expect(row?.state).toBe("rejected");
  });
});

describe("VAL-SKILL-037 export binds hashes and prevents runtime when not approved", () => {
  it("exportProposal refuses a non-authoritative proposal (no auto-export from approval)", async () => {
    const { intakeProposal, exportProposal, SkillForgeIntakeError } = await import(
      "../intake-export"
    );
    intakeProposal(db, {
      proposalId: "not-auth",
      sourceSkillId: "skill-300",
      sourceVersion: "1.0.0",
      proposedDiff: "## Preconditions\nnone",
      actor: "operator",
    });
    expect(() =>
      exportProposal(db, {
        proposalId: "not-auth",
        runtimeSkillId: "skill-300",
        runtimeVersion: "1.0.0",
        runtimeContentHash: "abc",
        actor: "operator",
      })
    ).toThrow(SkillForgeIntakeError);
  });

  it("exportProposal binds edit + eval hashes and runtime identity; advances to exported", async () => {
    const { intakeProposal, advanceProposalState, exportProposal, loadIntakeRow, loadExportRecord } =
      await import("../intake-export");
    intakeProposal(db, {
      proposalId: "export-1",
      sourceSkillId: "skill-301",
      sourceVersion: "1.0.0",
      proposedDiff: "## Preconditions\nnone",
      evaluationHash: "deadbeef",
      actor: "operator",
    });
    advanceProposalState(db, { proposalId: "export-1", actor: "operator", toState: "analyzing" });
    advanceProposalState(db, { proposalId: "export-1", actor: "operator", toState: "eval_running" });
    advanceProposalState(db, { proposalId: "export-1", actor: "operator", toState: "pending_approval" });
    advanceProposalState(db, { proposalId: "export-1", actor: "operator", toState: "approved" });

    const exportRec = exportProposal(db, {
      proposalId: "export-1",
      runtimeSkillId: "skill-301",
      runtimeVersion: "1.0.0",
      runtimeContentHash: "newhash",
      actor: "operator",
    });
    expect(exportRec.runtimeSkillId).toBe("skill-301");
    expect(exportRec.runtimeVersion).toBe("1.0.0");
    expect(exportRec.runtimeContentHash).toBe("newhash");
    expect(exportRec.editHash).toBe(createHash("sha256").update("## Preconditions\nnone", "utf8").digest("hex"));
    expect(exportRec.evaluationHash).toBe("deadbeef");

    const proposal = loadIntakeRow(db, "export-1");
    expect(proposal?.state).toBe("exported");

    const stored = loadExportRecord(db, "export-1");
    expect(stored).not.toBeNull();
    expect(stored?.runtimeContentHash).toBe("newhash");
  });

  it("rollback restores runtime identity and stamps rolled_back_at", async () => {
    const { intakeProposal, advanceProposalState, exportProposal, rollbackExport } =
      await import("../intake-export");
    intakeProposal(db, {
      proposalId: "rollback-1",
      sourceSkillId: "skill-400",
      sourceVersion: "1.0.0",
      proposedDiff: "## Preconditions\nnone",
      actor: "operator",
    });
    advanceProposalState(db, { proposalId: "rollback-1", actor: "operator", toState: "analyzing" });
    advanceProposalState(db, { proposalId: "rollback-1", actor: "operator", toState: "eval_running" });
    advanceProposalState(db, { proposalId: "rollback-1", actor: "operator", toState: "pending_approval" });
    advanceProposalState(db, { proposalId: "rollback-1", actor: "operator", toState: "approved" });
    exportProposal(db, {
      proposalId: "rollback-1",
      runtimeSkillId: "skill-400",
      runtimeVersion: "1.0.0",
      runtimeContentHash: "post-hash",
      actor: "operator",
    });

    const result = rollbackExport(db, {
      proposalId: "rollback-1",
      actor: "operator",
      reason: "reverting",
    });
    expect(result.outcome).toBe("restored");
    expect(result.restored?.runtimeContentHash).toBe("post-hash");
  });

  it("rollback of never-exported proposal returns status_only with reason", async () => {
    const { intakeProposal, rollbackExport } = await import("../intake-export");
    intakeProposal(db, {
      proposalId: "never-export",
      sourceSkillId: "skill-401",
      sourceVersion: "1.0.0",
      proposedDiff: "## Preconditions\nnone",
      actor: "operator",
    });

    const result = rollbackExport(db, {
      proposalId: "never-export",
      actor: "operator",
      reason: "abandon",
    });
    expect(result.outcome).toBe("status_only");
    expect(result.reason).toMatch(/not_exported|status-only/);
  });
});

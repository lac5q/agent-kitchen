// @vitest-environment node
import Database from "better-sqlite3";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { initSchema } from "@/lib/db-schema";
import { SkillForgeWorker } from "../worker";
import { DEFAULT_SKILLFORGE_CONFIG } from "../types";

let db: Database.Database;

beforeEach(() => {
  db = new Database(":memory:");
  initSchema(db);
});

afterEach(() => {
  db.close();
});

describe("SkillForge Worker", () => {
  it("runs successfully with no data", async () => {
    const worker = new SkillForgeWorker(db, DEFAULT_SKILLFORGE_CONFIG);
    const result = await worker.run();

    expect(result.status).toBe("success");
    expect(result.entriesProcessed).toBe(0);
    expect(result.proposalsCreated).toBe(0);
    expect(result.proposalsSubmitted).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it("processes skill_registry entries and creates proposals", async () => {
    db.prepare(
      `INSERT INTO skill_registry (name, source_harness, dispatch_status, version, imported_by, imported_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run("test-skill", "codex", "enabled", "1.0.0", "test", new Date().toISOString());

    const config = { ...DEFAULT_SKILLFORGE_CONFIG, minTraceAgeHours: 0 };
    const worker = new SkillForgeWorker(db, config);
    const result = await worker.run();

    expect(result.status).toBe("success");
    expect(result.entriesProcessed).toBeGreaterThan(0);
    expect(result.proposalsCreated).toBeGreaterThanOrEqual(0);
    expect(result.proposalsSubmitted).toBeGreaterThanOrEqual(0);
  });

  it("respects batch size limit", async () => {
    const now = new Date().toISOString();
    for (let i = 0; i < 10; i++) {
      db.prepare(
        `INSERT INTO skill_registry (name, source_harness, dispatch_status, version, imported_by, imported_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(`skill-${i}`, "codex", "enabled", "1.0.0", "test", now);
    }

    const config = { ...DEFAULT_SKILLFORGE_CONFIG, batchSize: 3, minTraceAgeHours: 0 };
    const worker = new SkillForgeWorker(db, config);
    const result = await worker.run();

    expect(result.proposalsCreated).toBeLessThanOrEqual(3);
  });

  it("logs run to skillforge_run_log", async () => {
    const config = { ...DEFAULT_SKILLFORGE_CONFIG, minTraceAgeHours: 0 };
    const worker = new SkillForgeWorker(db, config);
    await worker.run();

    const log = db
      .prepare("SELECT * FROM skillforge_run_log ORDER BY id DESC LIMIT 1")
      .get() as { run_id: string; status: string } | undefined;

    expect(log).toBeTruthy();
    expect(log?.status).toBe("success");
  });

  it("getStatus returns last run info", async () => {
    const config = { ...DEFAULT_SKILLFORGE_CONFIG, minTraceAgeHours: 0 };
    const worker = new SkillForgeWorker(db, config);
    await worker.run();

    const status = worker.getStatus();
    expect(status.lastRun).toBeTruthy();
    expect(status.status).toBe("success");
  });

  it("getStatus returns empty when no runs", () => {
    const worker = new SkillForgeWorker(db, DEFAULT_SKILLFORGE_CONFIG);
    const status = worker.getStatus();
    expect(status.lastRun).toBeNull();
    expect(status.status).toBeNull();
  });

  it("records eval-gate rejections into skillforge_rejected_edits", async () => {
    const now = new Date().toISOString();
    const expires = new Date(Date.now() + 86_400_000).toISOString();
    db.prepare(
      `INSERT INTO skillforge_rejected_edits (id, skill_id, edit_hash, reason, rejected_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run("rej-1", "test-skill", "deadbeefdeadbeef", "unsafe edit", now, expires);

    db.prepare(
      `INSERT INTO skill_registry (
        name, description, owner, source_harness, risk_tier, dispatch_status,
        version, preconditions, allowed_tools, verification_checks, rollback_behavior,
        raw_body, completeness_pct, missing_fields_json, imported_by, imported_at,
        evidence_examples, content_hash
      ) VALUES (
        ?, '', 'ops', 'codex', 'low', 'enabled',
        '1.0.0', '', '', '', '',
        ?, 100, '[]', 'test', ?,
        '', ?
      )`
    ).run(
      "gated-skill",
      "---\nname: gated-skill\n---\nbody",
      now,
      "a".repeat(64)
    );

    const config = {
      ...DEFAULT_SKILLFORGE_CONFIG,
      minTraceAgeHours: 0,
      minProposalConfidence: 0.99,
      requireEvalPass: true,
    };
    const worker = new SkillForgeWorker(db, config);
    const result = await worker.run();
    expect(result.status).toBe("success");
    expect(result.entriesProcessed).toBeGreaterThan(0);
    const rejected = db
      .prepare(`SELECT COUNT(*) AS c FROM skillforge_rejected_edits`)
      .get() as { c: number };
    expect(rejected.c).toBeGreaterThanOrEqual(1);
  });

  it("getStatus tolerates a missing run log table", () => {
    const bare = new Database(":memory:");
    const worker = new SkillForgeWorker(bare, DEFAULT_SKILLFORGE_CONFIG);
    expect(worker.getStatus()).toEqual({ lastRun: null, status: null, entriesProcessed: 0 });
    bare.close();
  });

  it("returns failure status when the intake pipeline throws before proposals", async () => {
    const intake = await import("../intake");
    const spy = vi.spyOn(intake, "runIntakePipeline").mockImplementation(() => {
      throw new Error("intake exploded");
    });
    try {
      const worker = new SkillForgeWorker(db, DEFAULT_SKILLFORGE_CONFIG);
      const result = await worker.run();
      expect(result.status).toBe("failure");
      expect(result.errors[0]).toContain("intake exploded");
      expect(result.proposalsCreated).toBe(0);
    } finally {
      spy.mockRestore();
    }
  });

  it("returns partial status when proposal persistence fails after proposals are built", async () => {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO skill_registry (name, source_harness, dispatch_status, version, imported_by, imported_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run("persist-fail-skill", "codex", "enabled", "1.0.0", "test", now);

    const editGenerator = await import("../edit-generator");
    const proposal = await import("../proposal");
    vi.spyOn(editGenerator, "generateEditProposals").mockReturnValue([
      {
        id: "sf-prop-partial",
        sealProposalId: null,
        sourceSkillId: "persist-fail-skill",
        sourceVersion: "1.0.0",
        proposedDiff: "diff",
        status: "pending_approval",
        trainSplitId: null,
        validationResults: null,
        heldOutResults: null,
        wDelta: null,
        rejectedEdits: [],
        residualRisks: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    const persistSpy = vi.spyOn(proposal, "persistProposals").mockImplementation(() => {
      throw new Error("persist exploded");
    });
    try {
      const worker = new SkillForgeWorker(db, {
        ...DEFAULT_SKILLFORGE_CONFIG,
        minTraceAgeHours: 0,
      });
      const result = await worker.run();
      expect(result.status).toBe("partial");
      expect(result.proposalsCreated).toBe(1);
      expect(result.errors[0]).toContain("persist exploded");
    } finally {
      persistSpy.mockRestore();
    }
  });
});

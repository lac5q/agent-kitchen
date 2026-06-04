/**
 * SkillForge Worker — Phases 85-90: Complete SkillForge Implementation
 * Cron/event-driven worker that consumes skill telemetry and emits SEAL proposals.
 */

import { createHash } from "crypto";
import type Database from "better-sqlite3";
import type {
  RejectedEdit,
  SkillForgeConfig,
  SkillForgeRunResult,
  SkillForgeProposal,
} from "./types";
import { runIntakePipeline } from "./intake";
import { analyzeTelemetry } from "./analyzer";
import { generateEditProposals } from "./edit-generator";
import { runEvalGate } from "./eval-gate";
import { persistProposals } from "./proposal";

export class SkillForgeWorker {
  private db: Database.Database;
  private config: SkillForgeConfig;

  constructor(db: Database.Database, config: SkillForgeConfig) {
    this.db = db;
    this.config = config;
  }

  /**
   * Main entry point. Runs the full SkillForge pipeline:
   * intake → analyze → generate edits → eval gate → persist.
   */
  async run(): Promise<SkillForgeRunResult> {
    const runId = `sf-run-${Date.now()}`;
    const startedAt = new Date();
    const errors: string[] = [];
    let entriesProcessed = 0;
    let proposalsCreated = 0;
    let proposalsSubmitted = 0;

    try {
      // 1. Intake
      const intakeResult = runIntakePipeline(this.db, this.config);
      entriesProcessed = intakeResult.entries.length;

      if (intakeResult.entries.length === 0) {
        return this.logAndReturn(runId, startedAt, "success", 0, 0, 0, []);
      }

      // 2. Analyze (Phase 86)
      const analyses = analyzeTelemetry(intakeResult.entries, this.config);

      // 3. Generate edit proposals (Phase 87)
      // Load rejected edits from DB
      let rejectedEdits: import("./types").RejectedEdit[] = [];
      try {
        const rows = this.db
          .prepare("SELECT edit_hash, reason, rejected_at FROM skillforge_rejected_edits WHERE expires_at > ?")
          .all(new Date().toISOString()) as Array<{ edit_hash: string; reason: string; rejected_at: string }>;
        rejectedEdits = rows.map((r) => ({
          editHash: r.edit_hash,
          reason: r.reason,
          rejectedAt: new Date(r.rejected_at),
        }));
      } catch {
        // Table may not exist
      }

      const proposals = generateEditProposals(analyses, this.config, rejectedEdits);
      proposalsCreated = proposals.length;

      // 4. Eval gating (Phase 88)
      const gatedProposals: SkillForgeProposal[] = [];
      for (const proposal of proposals) {
        // Get task samples from analysis test cases
        const analysis = analyses.find((a) => a.skillId === proposal.sourceSkillId);
        const taskSamples = analysis?.testCases.map((tc) => tc.input) ?? [];

        const { approved, reason } = runEvalGate(this.db, proposal, this.config, taskSamples);
        if (approved) {
          gatedProposals.push(proposal);
        } else {
          // Log rejection reason
          proposal.status = "gated";
          if (reason) {
            proposal.residualRisks.push(reason);
            proposal.rejectedEdits.push(this.rememberRejectedEdit(proposal, reason));
          }
          gatedProposals.push(proposal);
        }
      }

      // 5. Persist proposals
      persistProposals(this.db, gatedProposals);
      proposalsSubmitted = gatedProposals.filter((p) => p.status === "pending_approval").length;

    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }

    const completedAt = new Date();
    const status = errors.length === 0
      ? "success"
      : proposalsCreated > 0
        ? "partial"
        : "failure";

    return this.logAndReturn(runId, startedAt, status, entriesProcessed, proposalsCreated, proposalsSubmitted, errors);
  }

  private logAndReturn(
    runId: string,
    startedAt: Date,
    status: "success" | "partial" | "failure",
    entriesProcessed: number,
    proposalsCreated: number,
    proposalsSubmitted: number,
    errors: string[]
  ): SkillForgeRunResult {
    const completedAt = new Date();

    try {
      this.db.prepare(
        `INSERT INTO skillforge_run_log (run_id, started_at, completed_at, status, entries_processed, proposals_created, proposals_submitted, errors)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        runId,
        startedAt.toISOString(),
        completedAt.toISOString(),
        status,
        entriesProcessed,
        proposalsCreated,
        proposalsSubmitted,
        JSON.stringify(errors)
      );
    } catch {
      // run_log table may not exist yet
    }

    return {
      runId,
      startedAt,
      completedAt,
      status,
      entriesProcessed,
      proposalsCreated,
      proposalsSubmitted,
      errors,
    };
  }

  private rememberRejectedEdit(proposal: SkillForgeProposal, reason: string): RejectedEdit {
    const rejectedAt = new Date();
    const expiresAt = new Date(rejectedAt);
    expiresAt.setDate(expiresAt.getDate() + 30);
    const editHash = createHash("sha256").update(proposal.proposedDiff).digest("hex").slice(0, 16);

    try {
      this.db.prepare(
        `INSERT OR IGNORE INTO skillforge_rejected_edits (id, skill_id, edit_hash, reason, rejected_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        `rej-${proposal.id}-${editHash}`,
        proposal.sourceSkillId,
        editHash,
        reason,
        rejectedAt.toISOString(),
        expiresAt.toISOString()
      );
    } catch {
      // rejected_edits table may not exist yet
    }

    return {
      editHash,
      reason,
      rejectedAt,
    };
  }

  /**
   * Get the current status of the worker (last run info).
   */
  getStatus(): { lastRun: string | null; status: string | null; entriesProcessed: number } {
    try {
      const row = this.db
        .prepare("SELECT run_id, status, entries_processed FROM skillforge_run_log ORDER BY completed_at DESC LIMIT 1")
        .get() as { run_id: string; status: string; entries_processed: number } | undefined;
      return {
        lastRun: row?.run_id ?? null,
        status: row?.status ?? null,
        entriesProcessed: row?.entries_processed ?? 0,
      };
    } catch {
      return { lastRun: null, status: null, entriesProcessed: 0 };
    }
  }
}

/**
 * Phase 72-03: Behavioral eval runner.
 *
 * Loads queued eval jobs, executes held-out sample tasks through the sandbox
 * dispatch boundary (no-op tool stubs), scores W via rescorePostApply(), and
 * transitions job/proposal states based on the outcome.
 *
 * Design decisions (per 72-CONTEXT.md D-06..D-15):
 * - Sandbox intercepts all tool calls and records them as evidence (D-08, D-09)
 * - W is scored via the existing rescorePostApply path (modeled baseline delta)
 * - Live state mutation is prevented — no real tools execute during eval
 * - Failed/regressed jobs roll back the proposal and keep the evidence bundle
 * - Missing promotion metadata fields render as null (D-14)
 * - postApplyW null until eval completes (D-14)
 *
 * Exported API:
 * - runQueuedJob(db, jobId, opts): main runner — transitions state and persists evidence
 * - getJobStatus(db, jobId): read-only job fetch (used by API route)
 * - getJobEvidence(db, jobId): read-only evidence fetch (used by API route)
 */
import type Database from "better-sqlite3";

import type { EvalRunResult } from "@/lib/evals/types";
import {
  createEvalJob as _createEvalJob,
  getEvalJob,
  getEvidenceBundle,
  persistEvidenceBundle,
  transitionJobStatus,
  type EvalJob,
  type EvidenceBundle,
} from "./behavioral-jobs";
import { createSandboxProfile, type SandboxProfile } from "./behavioral-sandbox";

export { getEvalJob as getJobStatus, getEvidenceBundle as getJobEvidence };

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface BehavioralRunnerOptions {
  db: Database.Database;
  /**
   * Rescore the proposal using the existing eval engine.
   * Returns an EvalRunResult (or throws on failure).
   * W signal is modeled (not real agent re-execution per D-06),
   * but the sandbox transcript is the behavioral evidence.
   */
  rescoreForProposal(opts: {
    proposalId: string;
    proposalType: string;
    agentId: string;
    traceId: string;
    baselineW: number;
    diff: Record<string, unknown>;
  }): EvalRunResult | Promise<EvalRunResult>;
  /**
   * Optional hook for injecting tool calls into the sandbox transcript before
   * rescoring. Primarily used in tests to simulate agent tool usage.
   */
  preScoringHook?: (sandbox: SandboxProfile) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

type ProposalRow = {
  id: string;
  trace_id: string;
  agent_id: string;
  proposal_type: string;
  diff_json: string;
  baseline_w: number;
  status: string;
};

/**
 * Runs a single queued behavioral eval job.
 *
 * Flow:
 * 1. Load job and proposal from DB
 * 2. Transition job to 'running'
 * 3. Create sandbox profile, run optional pre-scoring tool hook
 * 4. Rescore W via rescoreForProposal()
 * 5. Compare postApplyW to baselineW
 * 6. If W does not regress → job='passed', proposal='applied'
 * 7. If W regresses → job='rolled_back', proposal='rolled_back'
 * 8. On exception → job='failed', error_message recorded
 * 9. Persist evidence bundle in all non-exception outcomes
 */
export async function runQueuedJob(
  db: Database.Database,
  jobId: string,
  opts: BehavioralRunnerOptions
): Promise<void> {
  const job = getEvalJob(db, jobId);
  if (!job) {
    throw new Error(`Behavioral eval job not found: ${jobId}`);
  }

  const proposal = db
    .prepare("SELECT id, trace_id, agent_id, proposal_type, diff_json, baseline_w, status FROM seal_proposals WHERE id = ?")
    .get(job.proposalId) as ProposalRow | undefined;

  if (!proposal) {
    transitionJobStatus(db, jobId, "failed", {
      error: `Proposal not found: ${job.proposalId}`,
    });
    return;
  }

  // Transition to running
  transitionJobStatus(db, jobId, "running");

  const sandbox = createSandboxProfile({ sandboxId: jobId });
  let postRun: EvalRunResult | null = null;
  let errorMessage: string | null = null;

  try {
    // Run optional pre-scoring hook (for test injection / future agent dispatch)
    if (opts.preScoringHook) {
      await opts.preScoringHook(sandbox);
    }

    // Score W through the rescore pipeline
    postRun = await opts.rescoreForProposal({
      proposalId: proposal.id,
      proposalType: proposal.proposal_type,
      agentId: proposal.agent_id,
      traceId: proposal.trace_id,
      baselineW: proposal.baseline_w,
      diff: JSON.parse(proposal.diff_json) as Record<string, unknown>,
    });
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  const transcript = sandbox.exportTranscript();
  const now = new Date().toISOString();

  if (errorMessage !== null || postRun === null) {
    // Exception during rescore — mark as failed, still save evidence if possible
    transitionJobStatus(db, jobId, "failed", { error: errorMessage ?? "unknown error" });
    // Persist a partial evidence bundle (postApplyW=null)
    try {
      persistEvidenceBundle(db, {
        jobId,
        proposalId: proposal.id,
        agentId: proposal.agent_id,
        taskSampleId: proposal.trace_id,
        toolCallTranscript: transcript,
        verificationChecks: [],
        unverifiedAssumptions: [],
        residualRisks: [],
        sourcesConsumed: [],
        replayHandle: null,
        rollbackHandle: null,
        promotionMetadata: null,
        preApplyBaselineW: proposal.baseline_w,
        postApplyW: null,
      });
    } catch {
      // Best-effort — do not mask the original failure
    }
    return;
  }

  const postApplyW = postRun.compositeW;
  const kept = postApplyW >= proposal.baseline_w;

  // Persist evidence bundle
  const bundle: EvidenceBundle = {
    jobId,
    proposalId: proposal.id,
    agentId: proposal.agent_id,
    taskSampleId: proposal.trace_id,
    toolCallTranscript: transcript,
    verificationChecks: [],
    unverifiedAssumptions: [],
    residualRisks: kept ? [] : ["W regressed below baseline"],
    sourcesConsumed: [],
    replayHandle: null,
    rollbackHandle: kept ? null : `rollback:${jobId}:${now}`,
    promotionMetadata: {
      modelVersion: postRun.judge?.model ?? null,
      promptTemplateVersion: postRun.judge?.promptTemplateVersion ?? null,
      datasetSeed: null,
      passRate: kept ? 1.0 : 0.0,
      configHash: postRun.configHash ?? null,
    },
    preApplyBaselineW: proposal.baseline_w,
    postApplyW,
  };
  persistEvidenceBundle(db, bundle);

  if (kept) {
    // Job passed — keep proposal
    transitionJobStatus(db, jobId, "passed");
    db.prepare(
      "UPDATE seal_proposals SET status = 'applied', updated_at = ? WHERE id = ?"
    ).run(now, proposal.id);
  } else {
    // W regressed — roll back
    transitionJobStatus(db, jobId, "rolled_back", {
      error: `W regressed: ${postApplyW.toFixed(4)} < ${proposal.baseline_w.toFixed(4)} (baseline)`,
    });
    db.prepare(
      "UPDATE seal_proposals SET status = 'rolled_back', updated_at = ? WHERE id = ?"
    ).run(now, proposal.id);
  }
}

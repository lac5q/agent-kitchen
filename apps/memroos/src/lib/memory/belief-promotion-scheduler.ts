import type Database from "better-sqlite3";

import { getDb } from "@/lib/db";
import {
  enqueueForReview,
  evaluatePromotionChecks,
  promoteCandidate,
} from "@/lib/belief/promotion";

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_BATCH_SIZE = 25;
const DEFAULT_MIN_AGE_MS = 60 * 1000;

export interface BeliefPromotionRunSummary {
  status: "completed" | "failed";
  considered: number;
  promoted: number;
  queuedForReview: number;
  denied: number;
  leftSilver: number;
  errors: string[];
}

interface CandidateQueueRow {
  id: string;
  tenant_id: string;
  metadata_json: string;
  created_at: string;
}

function parseRecord(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function numericEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name] ?? fallback);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : fallback;
}

export function runBeliefPromotion(options: {
  db?: Database.Database;
  now?: Date;
  maxBatch?: number;
  minAgeMs?: number;
} = {}): BeliefPromotionRunSummary {
  const db = options.db ?? getDb();
  const now = options.now ?? new Date();
  const minAgeMs = options.minAgeMs ?? numericEnv("MEMROOS_BELIEF_PROMOTION_MIN_AGE_MS", DEFAULT_MIN_AGE_MS);
  const batchSize = options.maxBatch ?? numericEnv("MEMROOS_BELIEF_PROMOTION_BATCH_SIZE", DEFAULT_BATCH_SIZE);
  const cutoff = new Date(now.getTime() - minAgeMs).toISOString();
  const rows = db.prepare(
    `SELECT id, tenant_id, metadata_json, created_at
       FROM agent_memory_candidates
      WHERE belief_stage = 'silver_candidate_claim'
        AND status = 'candidate'
        AND created_at <= ?
      ORDER BY created_at ASC, id ASC
      LIMIT ?`
  ).all(cutoff, Math.max(1, Math.min(100, batchSize))) as CandidateQueueRow[];

  const summary: BeliefPromotionRunSummary = {
    status: "completed",
    considered: 0,
    promoted: 0,
    queuedForReview: 0,
    denied: 0,
    leftSilver: 0,
    errors: [],
  };

  for (const row of rows) {
    summary.considered += 1;
    const metadata = parseRecord(row.metadata_json);
    const category = typeof metadata.category === "string"
      ? metadata.category
      : typeof metadata.claimCategory === "string"
        ? metadata.claimCategory
        : "unclassified";
    try {
      const checks = evaluatePromotionChecks(db, row.tenant_id, row.id, {
        now,
        actor: { id: "system:belief-promotion", role: "system", tenantId: row.tenant_id },
      });
      const failed = checks.find((check) => !check.pass);
      if (!failed) {
        const decision = promoteCandidate(db, {
          candidateId: row.id,
          tenantId: row.tenant_id,
          actor: { id: "system:belief-promotion", role: "system", tenantId: row.tenant_id },
          category,
        });
        if (decision.kind === "admitted") summary.promoted += 1;
        else if (decision.kind === "queued_for_review") summary.queuedForReview += 1;
        else {
          summary.denied += 1;
          summary.leftSilver += 1;
        }
        continue;
      }

      if (failed.name === "conflict") {
        try {
          enqueueForReview(db, {
            candidateId: row.id,
            tenantId: row.tenant_id,
            category,
            actor: { id: "system:belief-promotion", role: "system", tenantId: row.tenant_id },
          });
          summary.queuedForReview += 1;
        } catch (error) {
          summary.leftSilver += 1;
          summary.errors.push(`${row.id}:conflict_review:${error instanceof Error ? error.message : String(error)}`);
        }
      } else {
        summary.leftSilver += 1;
      }
    } catch (error) {
      summary.leftSilver += 1;
      summary.errors.push(`${row.id}:${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return summary;
}

let promotionInterval: ReturnType<typeof setInterval> | null = null;

export function startBeliefPromotionScheduler(): void {
  if (promotionInterval) return;
  const intervalMs = numericEnv("MEMROOS_BELIEF_PROMOTION_INTERVAL_MS", DEFAULT_INTERVAL_MS);
  promotionInterval = setInterval(() => {
    try {
      runBeliefPromotion();
    } catch (error) {
      console.warn("[belief-promotion] scheduled run failed", error);
    }
  }, intervalMs || DEFAULT_INTERVAL_MS);
  try {
    runBeliefPromotion();
  } catch (error) {
    console.warn("[belief-promotion] initial run failed", error);
  }
  console.log(`[belief-promotion] scheduler started (interval: ${intervalMs}ms)`);
}

export function stopBeliefPromotionSchedulerForTest(): void {
  if (promotionInterval) clearInterval(promotionInterval);
  promotionInterval = null;
}


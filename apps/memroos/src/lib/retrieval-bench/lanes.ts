/**
 * Benchmark lane separation (VAL-RETR-008).
 *
 * The MemroOS benchmark architecture enforces three distinct lanes:
 *   - architecture_evidence: public-evidence governance/architecture scoring
 *     (Lane 1 in evals/comparative-retrieval/README.md)
 *   - external_retrieval: LoCoMo, LongMemEval, LongMemEval-V2, synthetic
 *     retrieval quality (Lane 2)
 *   - operational_workflow: home-field operational cases (Lane 3)
 *
 * Lanes must NOT cross-average. This module:
 *   - Defines the lane registry and per-lane metadata
 *   - Verifies that a dataset belongs to exactly one lane
 *   - Provides lane-isolated aggregation IDs and the canonical lane
 *     constants used by the runner
 */

import type { BenchmarkLane, DatasetId, TaskScore } from "./schema";
import { BENCHMARK_LANES, DATASET_TO_LANE } from "./schema";

export interface LaneMetadata {
  id: BenchmarkLane;
  description: string;
  datasets: DatasetId[];
  scoringMethodology: string;
  aggregateId: string;
}

export const LANE_METADATA: Record<BenchmarkLane, LaneMetadata> = {
  architecture_evidence: {
    id: "architecture_evidence",
    description: "Public-evidence governance/architecture scoring (Lane 1).",
    datasets: [],
    scoringMethodology: "public_evidence_review",
    aggregateId: "lane_architecture_evidence_v1",
  },
  external_retrieval: {
    id: "external_retrieval",
    description:
      "External retrieval task benchmark across LoCoMo, LongMemEval, LongMemEval-V2, synthetic (Lane 2).",
    datasets: ["locomo", "longmemeval", "longmemeval_v2", "memroos_public_synthetic"],
    scoringMethodology: "ranked_id_metrics",
    aggregateId: "lane_external_retrieval_v1",
  },
  operational_workflow: {
    id: "operational_workflow",
    description: "Operational workflow benchmark (Lane 3).",
    datasets: [],
    scoringMethodology: "workflow_resume_with_proof",
    aggregateId: "lane_operational_workflow_v1",
  },
};

export interface LaneMembership {
  ok: boolean;
  reason?: string;
  lane?: BenchmarkLane;
}

/**
 * Resolve which lane a dataset belongs to. Returns a typed error if the
 * dataset is registered for no lane or for multiple lanes.
 */
export function resolveLaneForDataset(dataset: DatasetId): LaneMembership {
  let matched: BenchmarkLane | null = null;
  for (const lane of BENCHMARK_LANES) {
    if (LANE_METADATA[lane].datasets.includes(dataset)) {
      if (matched !== null) {
        return { ok: false, reason: "dataset_belongs_to_multiple_lanes:" + dataset };
      }
      matched = lane;
    }
  }
  if (matched === null) {
    return { ok: false, reason: "dataset_not_assigned_to_lane:" + dataset };
  }
  return { ok: true, lane: matched };
}

/**
 * Verify that the lane assignments in DATASET_TO_LANE match LANE_METADATA.
 * Invoked by the runner at startup so configuration drift is detected.
 */
export function verifyLaneAssignments(): { ok: boolean; mismatches: string[] } {
  const mismatches: string[] = [];
  for (const [dataset, lane] of Object.entries(DATASET_TO_LANE) as [DatasetId, BenchmarkLane][]) {
    const meta = LANE_METADATA[lane];
    if (!meta) {
      mismatches.push("dataset_" + dataset + "_lane_unknown:" + lane);
      continue;
    }
    if (!meta.datasets.includes(dataset)) {
      mismatches.push("dataset_" + dataset + "_missing_from_lane:" + lane);
    }
  }
  return { ok: mismatches.length === 0, mismatches };
}

/**
 * Partition TaskScores by lane. Used by the runner to produce per-lane
 * sub-reports without cross-lane averaging (VAL-RETR-008).
 */
export function partitionScoresByLane(scores: TaskScore[]): Record<BenchmarkLane, TaskScore[]> {
  const out: Record<BenchmarkLane, TaskScore[]> = {
    architecture_evidence: [],
    external_retrieval: [],
    operational_workflow: [],
  };
  for (const s of scores) {
    out[s.lane].push(s);
  }
  return out;
}

void DATASET_TO_LANE;

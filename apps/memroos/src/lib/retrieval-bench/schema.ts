/**
 * Comparative retrieval benchmark — schema contracts.
 *
 * Implements BENCH-01 (BENCH-RETRIEVAL-01) and RETRIEVAL-01 (core):
 *   - Normalized task schema (mirrors evals/comparative-retrieval/schema.json)
 *   - Dataset adapter provenance metadata
 *   - Shared result contract across all adapters (lexical, no-memory,
 *     local-vector, mem0/Qdrant, live)
 *   - Lane separation fields (architecture / external-retrieval / workflow)
 *
 * All schemas are intentionally narrow so that the runner can validate
 * fixtures before scoring and so that adapters cannot silently widen the
 * contract. Sensitive payloads (raw licensed content, secrets) NEVER
 * appear in these types — only IDs, hashes, classifications, and metadata.
 */

import type { ScopeIdentityInput } from "@/lib/msiq/scope-identity";

// ============================================================================
// Task types (normalized, JSON-Schema compatible with schema.json)
// ============================================================================

export const SUPPORTED_TASK_TYPES = [
  "single_hop",
  "multi_hop",
  "temporal_reasoning",
  "event_summary",
  "entity_state",
  "open_domain_qa",
  "abstention",
] as const;
export type TaskType = (typeof SUPPORTED_TASK_TYPES)[number];

export const SUPPORTED_DATASETS = [
  "locomo",
  "longmemeval",
  "longmemeval_v2",
  "memroos_public_synthetic",
] as const;
export type DatasetId = (typeof SUPPORTED_DATASETS)[number];

export const SUPPORTED_ADAPTERS = [
  "lexical",
  "no-memory",
  "vector-local",
  "mem0",
  "qdrant",
  "live",
] as const;
export type AdapterId = (typeof SUPPORTED_ADAPTERS)[number];

/**
 * Benchmark lane identifier. Distinct IDs, fixtures, methodologies,
 * aggregates per VAL-RETR-008.
 */
export const BENCHMARK_LANES = [
  "architecture_evidence",
  "external_retrieval",
  "operational_workflow",
] as const;
export type BenchmarkLane = (typeof BENCHMARK_LANES)[number];

export interface CorpusEntry {
  id: string;
  text: string;
  source?: string;
  timestamp_iso?: string;
  session_id?: string;
  speaker?: string;
  entity_refs?: string[];
  /**
   * Candidate authorization identity. It is optional for generic benchmark
   * fixtures, but the live adapter requires it to be complete and identical
   * to the requester scope before a candidate can be retrieved.
   */
  scope?: ScopeIdentityInput;
}

export interface SessionTurn {
  role: "user" | "assistant" | "system";
  text: string;
  timestamp_iso?: string;
}

export interface SessionRecord {
  session_id: string;
  turns: SessionTurn[];
}

export interface TemporalMetadata {
  reference_time_iso?: string;
  fact_valid_until_iso?: string;
  temporal_direction?: "before" | "after" | "between" | "latest";
}

/**
 * Dataset provenance metadata. Required for VAL-RETR-003 — every adapter
 * must preserve source IDs, session/turn order, evidence spans, license,
 * citation, and availability through conversion.
 */
export interface DatasetProvenance {
  dataset: DatasetId;
  sourceCitation: string;
  sourceLicense: string;
  sourceAvailability: "available" | "unavailable" | "synthetic";
  conversionScript?: string;
  sourceHashAlgorithm?: "sha256";
  sourceHash?: string;
  sessionOrderPreserved?: boolean;
  evidenceSpanPreserved?: boolean;
}

export interface NormalizedTask {
  id: string;
  dataset: DatasetId;
  task_type: TaskType;
  corpus: CorpusEntry[];
  sessions?: SessionRecord[];
  question: string;
  expected_answer: string;
  evidence_spans?: string[];
  temporal_metadata?: TemporalMetadata;
  abstention_correct?: boolean;
  license: string;
  citation: string;
  provenance: DatasetProvenance;
}

// ============================================================================
// Authorization context (VAL-RETR-007 live retrieval authorization gating)
// ============================================================================

export interface AdapterScope extends ScopeIdentityInput {
  maxFreshnessSeconds: number | null;
}

// ============================================================================
// Shared result contract (VAL-RETR-005)
// ============================================================================

export interface RetrievedItem {
  id: string;
  score: number;
  text: string;
  tier: "lexical" | "no-memory" | "vector-local" | "mem0" | "qdrant" | "live";
  source: string;
  authorizationResult: "allowed" | "denied" | "ignored" | "stale" | "omitted";
  whyEntered: string;
  timestamp_iso?: string;
  scopeHash?: string;
  rankPosition: number;
}

export interface IgnoredItem {
  id: string;
  whyMissed: string;
  reasonCode: string;
}

export type AdapterStatus =
  | "ok"
  | "unavailable"
  | "configuration_error"
  | "credential_missing"
  | "provider_timeout"
  | "provider_failed"
  | "malformed_response"
  | "scorer_failure";

export interface AdapterReceipt {
  adapterName: AdapterId;
  adapterVersion: string;
  status: AdapterStatus;
  statusDetail?: string;
  latencyMs: number;
  authorization: {
    evaluated: boolean;
    allowed: boolean;
    denialReason?: string;
    scopeHash?: string;
  };
  provenance: {
    provider: string | null;
    providerVersion: string | null;
    retrievalPolicyVersion: string;
    configHash: string;
    fixtureHash: string;
  };
  metrics: {
    tokensRetrieval: number | null;
    tokensRerank: number | null;
    tokensPack: number | null;
    tokensJudge: number | null;
    contextPackBytes: number | null;
    contextPackHash: string | null;
  };
}

/**
 * Shared result shape returned by every adapter. Adapters MUST populate
 * `status`, `retrieved`, `injected`, `ignored`, `latencyMs`, and `receipt`
 * even when they fail — partial outputs with full receipts are preferable
 * to fake successes.
 */
export interface AdapterResult {
  taskId: string;
  adapterName: AdapterId;
  status: AdapterStatus;
  statusDetail?: string;
  retrieved: RetrievedItem[];
  injected: string[];
  ignored: IgnoredItem[];
  latencyMs: number;
  receipt: AdapterReceipt;
}

// ============================================================================
// Aggregate report types (VAL-RETR-013)
// ============================================================================

export interface AggregateMetrics {
  taskCount: number;
  completedTaskCount: number;
  failedTaskCount: number;
  incompleteTaskCount: number;
  precisionAtK: number;
  recallAtK: number;
  mrr: number;
  falsePositiveRate: number;
  answerSupportedRate: number;
  p95LatencyMs: number;
  abstentionAccuracy: number | null;
  abstentionDenominator: number | null;
  abstentionLabeledCount: number;
  abstentionAnswerableFailureCount: number | null;
  contextPackBytes: number | null;
  contextPackHash: string | null;
  tokensRetrieval: number | null;
  tokensRerank: number | null;
  tokensPack: number | null;
  tokensJudge: number | null;
  components: {
    retrieval: number | null;
    rerank: number | null;
    pack: number | null;
    judge: number | null;
  };
  laneMetrics: Record<string, AggregateMetrics | null>;
}

export interface TaskScore {
  taskId: string;
  taskType: TaskType;
  lane: BenchmarkLane;
  adapterName: AdapterId;
  status: AdapterStatus;
  precisionAtK: number;
  recallAtK: number;
  mrr: number;
  falsePositiveRate: number;
  latencyMs: number;
  injectedCount: number;
  evidenceSpanCount: number;
  answerSupportedByRetrievedSource: boolean;
  abstentionCorrect: boolean | null;
  receipt: AdapterReceipt;
  // Source provenance used during scoring (non-sensitive IDs only)
  corpusHash: string;
  taskHash: string;
}

export interface AggregateReport {
  runId: string;
  runDate: string;
  dataset: DatasetId;
  adapter: AdapterId;
  lane: BenchmarkLane;
  configHash: string;
  fixtureHash: string;
  seed: number;
  k: number;
  rerankEnabled: boolean;
  judgeEnabled: boolean;
  providerFlags: Record<string, boolean>;
  aggregate: AggregateMetrics;
  taskCount: number;
  tasks: TaskScore[];
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Canonical dataset provenance templates. Used by adapters to ensure
 * VAL-RETR-003 metadata is consistent and non-redistributing.
 */
export const DATASET_PROVENANCE: Record<DatasetId, DatasetProvenance> = {
  locomo: {
    dataset: "locomo",
    sourceCitation: "LoCoMo: Long Conversation Memory (snap-research/locomo, CC BY 4.0).",
    sourceLicense: "CC BY 4.0",
    sourceAvailability: "available",
    conversionScript: "scripts/adapters/locomo-adapter.mjs",
    sourceHashAlgorithm: "sha256",
    sessionOrderPreserved: true,
    evidenceSpanPreserved: true,
  },
  longmemeval: {
    dataset: "longmemeval",
    sourceCitation:
      "LongMemEval: Long-Term Memory Benchmark (xiaowu0162/longmemeval, Research Use).",
    sourceLicense: "Research Use",
    sourceAvailability: "available",
    conversionScript: "scripts/adapters/longmemeval-adapter.mjs",
    sourceHashAlgorithm: "sha256",
    sessionOrderPreserved: true,
    evidenceSpanPreserved: true,
  },
  longmemeval_v2: {
    dataset: "longmemeval_v2",
    sourceCitation: "LongMemEval-V2: Agent Environment Memory Benchmark.",
    sourceLicense: "TBD",
    sourceAvailability: "unavailable",
    conversionScript: "scripts/adapters/longmemeval-v2-adapter.mjs",
    sourceHashAlgorithm: "sha256",
    sessionOrderPreserved: true,
    evidenceSpanPreserved: true,
  },
  memroos_public_synthetic: {
    dataset: "memroos_public_synthetic",
    sourceCitation: "MemroOS internal synthetic benchmark.",
    sourceLicense: "MIT",
    sourceAvailability: "synthetic",
    conversionScript: "scripts/adapters/synthetic-adapter.mjs",
    sourceHashAlgorithm: "sha256",
    sessionOrderPreserved: true,
    evidenceSpanPreserved: true,
  },
};

/** Map dataset -> benchmark lane. Distinct fixtures per lane. */
export const DATASET_TO_LANE: Record<DatasetId, BenchmarkLane> = {
  locomo: "external_retrieval",
  longmemeval: "external_retrieval",
  longmemeval_v2: "external_retrieval",
  memroos_public_synthetic: "external_retrieval",
};

export const PROVIDER_FLAGS = [
  "embedding",
  "vector_backend",
  "rerank",
  "judge",
  "external_mcp",
] as const;
export type ProviderFlag = (typeof PROVIDER_FLAGS)[number];

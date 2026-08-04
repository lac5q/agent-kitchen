import type { MemoryRecallTier, MemoryRecallTiming } from "../recall-evals";

export type BeliefStage =
  | "bronze_raw_source"
  | "silver_candidate_claim"
  | "gold_operational_truth";

export type RecollectionTiming =
  | "before_plan"
  | "before_dispatch"
  | "before_tool_use"
  | "before_final";

/** The qmd_source spelling is retained for the GSD planner; qmd is the legacy tier spelling. */
export type RecollectionTier = MemoryRecallTier | "qmd_source";
export type RecollectionAuthorization =
  | "allowed"
  | "redacted"
  | "allowlisted_cross_project"
  | "denied";
export type RecollectionPolicyRisk = "low" | "medium" | "high";
export type RecollectionSourceHealth = "ok" | "stale" | "missing" | "degraded" | "disabled";
export type RecollectionReliance = "direct_truth" | "caveated_claim" | "source_evidence_only";

export type RecollectionDecisionKind = "search_required" | "search_skipped" | "search_failed";
export type RecollectionReason =
  | "task_has_recency_ref"
  | "task_has_project_ref"
  | "task_has_source_ref"
  | "task_has_stable_entities"
  | "project_has_recent_handoff"
  | "rediscovery_risk"
  | "explicit_memory_request"
  | "low_memory_need"
  | "no_stable_entities"
  | "tier_degraded"
  | "all_tiers_unavailable";

export interface RecollectionScope {
  project?: string;
  sources?: string[];
  timeWindowDays?: number;
}

export interface RecollectionQuery {
  text: string;
  tiers: MemoryRecallTier[];
  scope: RecollectionScope;
  limit: number;
}

export interface RecollectionSourceRef {
  id: string;
  kind?: "file" | "url" | "qmd" | "ticket" | "memory" | "other";
  projectId?: string;
  changed?: boolean;
  stale?: boolean;
  healthy?: boolean;
}

export interface RecollectionHandoffState {
  unresolved?: boolean;
  blockerCount?: number;
  lastUpdatedAt?: Date | string | number;
  summary?: string;
}

/**
 * Merged input contract for the legacy deterministic policy and the richer
 * proactive policy. Keeping this shape in one module prevents the two kernels
 * from drifting again while allowing their callers to remain source-compatible.
 */
export interface RecollectionTriggerInput {
  taskText: string;
  timing?: RecollectionTiming | MemoryRecallTiming;
  project?: string;
  projectId?: string;
  sourceRefs?: string[] | RecollectionSourceRef[];
  entities?: string[];
  handoffState?: "none" | "active" | "stale" | { hasPendingHandoff?: boolean };
  handoff?: RecollectionHandoffState;
  rediscoveryRisk?: boolean;
  operatorReaskCount?: number;
  rediscoveredFactCount?: number;
  recentHighSalienceFacts?: number;
  alreadyHasCitations?: boolean;
  candidateProjectIds?: string[];
  crossProjectAllowlist?: string[];
  enabled?: boolean;
  minTriggerScore?: number;
  requestedLimit?: number;
  now?: Date;
}

export interface RecollectionDecision {
  decision: RecollectionDecisionKind;
  timing: MemoryRecallTiming;
  reasons: RecollectionReason[];
  queries: RecollectionQuery[];
  skipReason: string | null;
}

/** A candidate accepts both kernel field names; adapters normalize text at the seam. */
export interface RecollectionCandidate {
  id: string;
  tier: RecollectionTier;
  content?: string;
  text?: string;
  beliefStage?: BeliefStage;
  capturedAt?: string | null;
  sourceHealth?: RecollectionSourceHealth;
  importance?: number;
  priorUsefulness?: number;
  authorization?: RecollectionAuthorization;
  policyRisk?: RecollectionPolicyRisk | number;
  provenance?: string;
  projectId?: string;
  relevance?: number;
  salience?: number;
  observedAt?: Date | string | number;
  updatedAt?: Date | string | number;
  sourceUpdatedAt?: Date | string | number;
  sourceStale?: boolean;
  citation?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface RecollectionScoreComponents {
  relevance: number;
  recency: number;
  importance: number;
  freshness: number;
  usefulness: number;
  policy: number;
  riskPenalty: number;
}

export interface ScoredRecollectionCandidate {
  candidate: RecollectionCandidate;
  components: RecollectionScoreComponents;
  total: number;
}

export interface RecollectionContextItem {
  id: string;
  tier: MemoryRecallTier;
  content: string;
  beliefStage: BeliefStage;
  provenance: string;
  score: number;
  components: RecollectionScoreComponents;
  reliance: RecollectionReliance;
  promotionReason: string | null;
  caveatReason: string | null;
}

export interface IgnoredRecollectionCandidate {
  id: string;
  reason: "policy_denied" | "below_threshold";
  score: number;
  components: RecollectionScoreComponents;
}

export interface RecollectionSourceReceipt {
  status: "ok" | "empty" | "degraded" | "unavailable" | "blocked";
  error?: string;
  count?: number;
}

export interface RecollectionContextPack {
  /** Legacy Phase 118 context fields. */
  injected: RecollectionContextItem[];
  ignored: IgnoredRecollectionCandidate[];
  /** Proactive Phase 118 context fields. */
  entries: RecollectionContextEntry[];
  context: string;
  receipt: RecollectionContextReceipt;
}

export type RecollectionSkipReason =
  | "disabled"
  | "blank_task"
  | "low_signal"
  | "policy_denied"
  | "missing_project_scope";

export interface RecollectionTriggerReceipt {
  action: "search" | "skip";
  timing: RecollectionTiming;
  required: boolean;
  score: number;
  threshold: number;
  triggers: RecollectionTrigger[];
  skipReason: RecollectionSkipReason | null;
  authorization: RecollectionAuthorization;
  allowedProjectIds: string[];
  deniedProjectIds: string[];
  reason: string;
}

export type RecollectionTrigger =
  | "explicit_memory_request"
  | "entity_rich_task"
  | "source_reference"
  | "source_changed"
  | "unresolved_handoff"
  | "operator_reask"
  | "rediscovered_fact_risk"
  | "high_salience_recent_fact"
  | "final_answer_citation_gap";

export interface RecollectionQueryPlanInput {
  taskText: string;
  projectId?: string;
  sourceRefs?: RecollectionSourceRef[];
  decision: RecollectionTriggerReceipt;
  maxQueries?: number;
  maxTermsPerQuery?: number;
  tiers?: RecollectionTier[];
  recencyDays?: number;
}

export interface RecollectionQueryPlan {
  id: string;
  query: string;
  tiers: RecollectionTier[];
  projectIds: string[];
  sourceRefIds: string[];
  recencyDays: number;
  reasons: RecollectionTrigger[];
}

export interface RankedRecollectionCandidate extends RecollectionCandidate {
  score: number;
  components: RecollectionRankingComponents;
  ignoredReason?: string;
}

export interface RecollectionRankingComponents {
  relevance: number;
  recency: number;
  importance: number;
  freshness: number;
  priorUsefulness: number;
  policySafety: number;
  total: number;
}

export interface RecollectionRankingOptions {
  now?: Date | string | number;
  recencyHalfLifeDays?: number;
}

export interface RecollectionContextPackInput {
  decision: RecollectionTriggerReceipt;
  plans: RecollectionQueryPlan[];
  rankedCandidates: RankedRecollectionCandidate[];
  maxItems?: number;
  maxChars?: number;
  scoreThreshold?: number;
}

export interface RecollectionContextEntry {
  id: string;
  tier: RecollectionTier;
  projectId?: string;
  score: number;
  text: string;
  citation?: string;
}

export interface RecollectionContextReceipt {
  action: "search" | "skip";
  timing: RecollectionTiming;
  triggerScore: number;
  triggers: RecollectionTrigger[];
  authorization: RecollectionAuthorization;
  reason: string;
  retrievedCount: number;
  injectedCount: number;
  ignoredCount: number;
  queryIds: string[];
  injectedIds: string[];
  ignored: Array<{
    id: string;
    reason: string;
    score: number;
    components: RecollectionRankingComponents;
  }>;
  telemetry: {
    efftel01RetrievalBeforeWork: boolean;
    efftel04RediscoveredFactGuard: boolean;
    efftel05OperatorReaskGuard: boolean;
  };
}

export const MAX_RECOLLECTION_QUERY_LIMIT = 8;
export const DEFAULT_RECOLLECTION_THRESHOLD = 0.62;
export const DEFAULT_RECOLLECTION_MAX_ITEMS = 5;

export function candidateText(candidate: RecollectionCandidate): string {
  return candidate.content ?? candidate.text ?? "";
}

export function legacyTier(tier: RecollectionTier): MemoryRecallTier {
  return tier === "qmd_source" ? "qmd" : tier;
}

export function recollectionTiming(value: RecollectionTiming | MemoryRecallTiming | undefined): MemoryRecallTiming {
  return value === "before_dispatch" ? "before_tool_use" : (value ?? "before_plan") as MemoryRecallTiming;
}

export function proactiveTiming(value: RecollectionTiming | MemoryRecallTiming | undefined): RecollectionTiming {
  return (value ?? "before_plan") as RecollectionTiming;
}


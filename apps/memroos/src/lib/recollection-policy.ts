import type { MemoryRecallTier, MemoryRecallTiming } from "./memory-recall-evals";

export type BeliefStage =
  | "bronze_raw_source"
  | "silver_candidate_claim"
  | "gold_operational_truth";

export type RecollectionDecisionKind = "search_required" | "search_skipped";
export type RecollectionReason =
  | "task_has_recency_ref"
  | "task_has_project_ref"
  | "task_has_source_ref"
  | "task_has_stable_entities"
  | "project_has_recent_handoff"
  | "rediscovery_risk"
  | "explicit_memory_request"
  | "low_memory_need"
  | "no_stable_entities";

export type RecollectionAuthorization = "allowed" | "redacted" | "denied";
export type RecollectionPolicyRisk = "low" | "medium" | "high";
export type RecollectionSourceHealth = "ok" | "stale" | "missing" | "degraded" | "disabled";
export type RecollectionReliance = "direct_truth" | "caveated_claim" | "source_evidence_only";

export interface RecollectionScope {
  project?: string;
  sources?: string[];
}

export interface RecollectionQuery {
  text: string;
  tiers: MemoryRecallTier[];
  scope: RecollectionScope;
  limit: number;
}

export interface RecollectionTriggerInput {
  taskText: string;
  timing?: MemoryRecallTiming;
  project?: string;
  sourceRefs?: string[];
  entities?: string[];
  handoffState?: "none" | "active" | "stale" | { hasPendingHandoff?: boolean };
  rediscoveryRisk?: boolean;
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

export interface RecollectionCandidate {
  id: string;
  tier: MemoryRecallTier;
  content: string;
  beliefStage: BeliefStage;
  capturedAt?: string | null;
  sourceHealth?: RecollectionSourceHealth;
  importance?: number;
  priorUsefulness?: number;
  authorization?: RecollectionAuthorization;
  policyRisk?: RecollectionPolicyRisk;
  provenance: string;
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

export interface RecollectionContextPack {
  injected: RecollectionContextItem[];
  ignored: IgnoredRecollectionCandidate[];
}

export const MAX_RECOLLECTION_QUERY_LIMIT = 8;
export const DEFAULT_RECOLLECTION_THRESHOLD = 0.62;
export const DEFAULT_RECOLLECTION_MAX_ITEMS = 5;

const SCORE_WEIGHTS = {
  relevance: 0.35,
  importance: 0.25,
  recency: 0.12,
  freshness: 0.13,
  usefulness: 0.1,
  policy: 0.1,
  riskPenalty: -0.2,
} as const;

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "any",
  "are",
  "as",
  "at",
  "be",
  "before",
  "by",
  "for",
  "from",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "what",
  "when",
  "with",
]);

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function normalizeSpace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function capitalize(value: string): string {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

function tokenize(value: string): string[] {
  return unique(
    value
      .toLowerCase()
      .replace(/[^a-z0-9_./-]+/g, " ")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3 && !STOPWORDS.has(token))
  );
}

function hasRecencyLanguage(text: string): boolean {
  return /\b(today|yesterday|recent|recently|latest|last\s+(week|month|night)|this\s+(week|month)|follow-?up|handoff)\b/i.test(text);
}

function hasExplicitMemoryRequest(text: string): boolean {
  return /\b(search|check|recall|remember|look up|look for|find)\b/i.test(text);
}

function isMechanicalTask(text: string): boolean {
  return /\b(format|sort|alphabeti[sz]e|translate|rewrite|lint|prettify)\b/i.test(text);
}

function hasActiveHandoff(value: RecollectionTriggerInput["handoffState"]): boolean {
  if (!value || value === "none" || value === "stale") return false;
  if (value === "active") return true;
  return value.hasPendingHandoff === true;
}

function normalizedProject(input: RecollectionTriggerInput): string | undefined {
  const project = input.project?.trim();
  if (project) return project.toLowerCase();
  return undefined;
}

function displayProject(project: string | undefined): string | undefined {
  return project ? capitalize(project) : undefined;
}

function recencyWindowDays(taskText: string): number | undefined {
  if (/\btoday|yesterday|last\s+night\b/i.test(taskText)) return 2;
  if (/\blast\s+week|this\s+week|recent|recently|latest\b/i.test(taskText)) return 14;
  if (/\blast\s+month|this\s+month\b/i.test(taskText)) return 45;
  return undefined;
}

export function planRecollectionQueries(input: RecollectionTriggerInput): RecollectionQuery[] {
  const taskText = normalizeSpace(input.taskText);
  if (!taskText) return [];

  const project = normalizedProject(input);
  const entities = unique((input.entities ?? []).map((entity) => normalizeSpace(entity)).filter(Boolean));
  const sourceRefs = unique((input.sourceRefs ?? []).map((source) => normalizeSpace(source)).filter(Boolean));
  const tiers: MemoryRecallTier[] = ["episodic", "vector", "qmd"];
  if (entities.length > 0) tiers.push("graph");

  const queryParts = [
    displayProject(project),
    ...entities,
    taskText,
  ].filter(Boolean) as string[];
  const text = normalizeSpace(queryParts.join(" "));
  const limit = Math.min(MAX_RECOLLECTION_QUERY_LIMIT, Math.max(1, Math.trunc(input.requestedLimit ?? MAX_RECOLLECTION_QUERY_LIMIT)));

  return [{
    text,
    tiers: unique(tiers),
    scope: {
      ...(project ? { project } : {}),
      ...(sourceRefs.length > 0 ? { sources: sourceRefs } : {}),
      ...(recencyWindowDays(taskText) ? { timeWindowDays: recencyWindowDays(taskText) } : {}),
    },
    limit,
  }];
}

export function decideRecollection(input: RecollectionTriggerInput): RecollectionDecision {
  const taskText = normalizeSpace(input.taskText);
  const timing = input.timing ?? "before_plan";
  const project = normalizedProject(input);
  const entities = unique((input.entities ?? []).map((entity) => normalizeSpace(entity)).filter(Boolean));
  const sourceRefs = unique((input.sourceRefs ?? []).map((source) => normalizeSpace(source)).filter(Boolean));
  const reasons: RecollectionReason[] = [];

  if (hasRecencyLanguage(taskText)) reasons.push("task_has_recency_ref");
  if (project) reasons.push("task_has_project_ref");
  if (sourceRefs.length > 0) reasons.push("task_has_source_ref");
  if (entities.length > 0) reasons.push("task_has_stable_entities");
  if (hasActiveHandoff(input.handoffState)) reasons.push("project_has_recent_handoff");
  if (input.rediscoveryRisk) reasons.push("rediscovery_risk");
  if (hasExplicitMemoryRequest(taskText)) reasons.push("explicit_memory_request");

  const searchReasons = reasons.filter((reason) => reason !== "explicit_memory_request" || reasons.length > 1);
  const shouldSearch = taskText.length > 0 && (searchReasons.length > 0 || (hasExplicitMemoryRequest(taskText) && !isMechanicalTask(taskText)));

  if (!shouldSearch) {
    return {
      decision: "search_skipped",
      timing,
      reasons: ["low_memory_need", "no_stable_entities"],
      queries: [],
      skipReason: "Task is local or mechanical with no stable recall dependency.",
    };
  }

  return {
    decision: "search_required",
    timing,
    reasons: unique(reasons),
    queries: planRecollectionQueries(input),
    skipReason: null,
  };
}

function lexicalRelevance(taskText: string, content: string): number {
  const taskTokens = tokenize(taskText);
  if (taskTokens.length === 0) return 0;
  const contentTokens = new Set(tokenize(content));
  const overlap = taskTokens.filter((token) => contentTokens.has(token)).length;
  return clamp01(overlap / taskTokens.length);
}

function recencyScore(capturedAt: string | null | undefined, now: Date): number {
  if (!capturedAt) return 0.5;
  const timestamp = Date.parse(capturedAt);
  if (!Number.isFinite(timestamp)) return 0.5;
  const ageHours = Math.max(0, (now.getTime() - timestamp) / 3_600_000);
  if (ageHours <= 1) return 1;
  if (ageHours <= 24) return 0.9;
  if (ageHours <= 24 * 7) return 0.75;
  if (ageHours <= 24 * 30) return 0.6;
  if (ageHours <= 24 * 365) return 0.35;
  return 0.2;
}

function freshnessScore(sourceHealth: RecollectionSourceHealth | undefined): number {
  switch (sourceHealth ?? "ok") {
    case "ok":
      return 1;
    case "stale":
      return 0.35;
    case "degraded":
      return 0.25;
    case "missing":
    case "disabled":
      return 0;
  }
}

function policyScore(authorization: RecollectionAuthorization | undefined): number {
  switch (authorization ?? "allowed") {
    case "allowed":
      return 1;
    case "redacted":
      return 0.55;
    case "denied":
      return 0;
  }
}

function riskPenalty(policyRisk: RecollectionPolicyRisk | undefined): number {
  switch (policyRisk ?? "low") {
    case "low":
      return 0;
    case "medium":
      return 0.5;
    case "high":
      return 1;
  }
}

function roundScore(value: number): number {
  return Number(value.toFixed(4));
}

export function scoreRecollectionCandidate(
  candidate: RecollectionCandidate,
  options: { taskText: string; now?: Date }
): ScoredRecollectionCandidate {
  const now = options.now ?? new Date();
  const components: RecollectionScoreComponents = {
    relevance: roundScore(lexicalRelevance(options.taskText, candidate.content)),
    recency: roundScore(recencyScore(candidate.capturedAt, now)),
    importance: roundScore(clamp01(candidate.importance ?? 0.5)),
    freshness: roundScore(freshnessScore(candidate.sourceHealth)),
    usefulness: roundScore(clamp01(candidate.priorUsefulness ?? 0)),
    policy: roundScore(policyScore(candidate.authorization)),
    riskPenalty: roundScore(riskPenalty(candidate.policyRisk)),
  };

  const total = clamp01(
    components.relevance * SCORE_WEIGHTS.relevance +
    components.importance * SCORE_WEIGHTS.importance +
    components.recency * SCORE_WEIGHTS.recency +
    components.freshness * SCORE_WEIGHTS.freshness +
    components.usefulness * SCORE_WEIGHTS.usefulness +
    components.policy * SCORE_WEIGHTS.policy +
    components.riskPenalty * SCORE_WEIGHTS.riskPenalty
  );

  return { candidate, components, total: roundScore(total) };
}

function relianceFor(stage: BeliefStage): Pick<RecollectionContextItem, "reliance" | "promotionReason" | "caveatReason"> {
  switch (stage) {
    case "gold_operational_truth":
      return {
        reliance: "direct_truth",
        promotionReason: "Admitted operational memory with provenance, freshness, conflict, and dedupe checks.",
        caveatReason: null,
      };
    case "silver_candidate_claim":
      return {
        reliance: "caveated_claim",
        promotionReason: null,
        caveatReason: "Silver candidate claim requires caveat until promotion policy admits it as gold.",
      };
    case "bronze_raw_source":
      return {
        reliance: "source_evidence_only",
        promotionReason: null,
        caveatReason: "Bronze raw source can support evidence review but is not operational truth.",
      };
  }
}

export function assembleRecollectionContextPack(
  candidates: RecollectionCandidate[],
  options: {
    taskText: string;
    now?: Date;
    threshold?: number;
    maxItems?: number;
  }
): RecollectionContextPack {
  const threshold = options.threshold ?? DEFAULT_RECOLLECTION_THRESHOLD;
  const maxItems = Math.max(1, Math.trunc(options.maxItems ?? DEFAULT_RECOLLECTION_MAX_ITEMS));
  const scored = candidates
    .map((candidate) => scoreRecollectionCandidate(candidate, { taskText: options.taskText, now: options.now }))
    .sort((a, b) => b.total - a.total || a.candidate.id.localeCompare(b.candidate.id));

  const injected: RecollectionContextItem[] = [];
  const ignored: IgnoredRecollectionCandidate[] = [];

  for (const item of scored) {
    if (item.candidate.authorization === "denied") {
      ignored.push({
        id: item.candidate.id,
        reason: "policy_denied",
        score: item.total,
        components: item.components,
      });
      continue;
    }

    if (item.total < threshold || injected.length >= maxItems) {
      ignored.push({
        id: item.candidate.id,
        reason: "below_threshold",
        score: item.total,
        components: item.components,
      });
      continue;
    }

    injected.push({
      id: item.candidate.id,
      tier: item.candidate.tier,
      content: item.candidate.content,
      beliefStage: item.candidate.beliefStage,
      provenance: item.candidate.provenance,
      score: item.total,
      components: item.components,
      ...relianceFor(item.candidate.beliefStage),
    });
  }

  return { injected, ignored };
}

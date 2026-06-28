export type RecollectionTiming =
  | "before_plan"
  | "before_dispatch"
  | "before_tool_use"
  | "before_final";

export type RecollectionTier = "episodic" | "vector" | "graph" | "qmd_source";

export type RecollectionAuthorization = "allowed" | "allowlisted_cross_project" | "denied";

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

export type RecollectionSkipReason =
  | "disabled"
  | "blank_task"
  | "low_signal"
  | "policy_denied"
  | "missing_project_scope";

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

export interface RecollectionTriggerInput {
  timing: RecollectionTiming;
  taskText: string;
  projectId?: string;
  sourceRefs?: RecollectionSourceRef[];
  handoff?: RecollectionHandoffState;
  operatorReaskCount?: number;
  rediscoveredFactCount?: number;
  recentHighSalienceFacts?: number;
  alreadyHasCitations?: boolean;
  candidateProjectIds?: string[];
  crossProjectAllowlist?: string[];
  enabled?: boolean;
  minTriggerScore?: number;
}

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

export interface RecollectionCandidate {
  id: string;
  text: string;
  tier: RecollectionTier;
  projectId?: string;
  relevance?: number;
  importance?: number;
  salience?: number;
  priorUsefulness?: number;
  policyRisk?: number;
  observedAt?: Date | string | number;
  updatedAt?: Date | string | number;
  sourceUpdatedAt?: Date | string | number;
  sourceStale?: boolean;
  authorization?: RecollectionAuthorization;
  citation?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface RecollectionScoreComponents {
  relevance: number;
  recency: number;
  importance: number;
  freshness: number;
  priorUsefulness: number;
  policySafety: number;
  total: number;
}

export interface RankedRecollectionCandidate extends RecollectionCandidate {
  score: number;
  components: RecollectionScoreComponents;
  ignoredReason?: string;
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
    components: RecollectionScoreComponents;
  }>;
  telemetry: {
    efftel01RetrievalBeforeWork: boolean;
    efftel04RediscoveredFactGuard: boolean;
    efftel05OperatorReaskGuard: boolean;
  };
}

export interface RecollectionContextPack {
  entries: RecollectionContextEntry[];
  context: string;
  receipt: RecollectionContextReceipt;
}

const DEFAULT_TRIGGER_THRESHOLD = 0.55;
const DEFAULT_RECENCY_DAYS = 30;
const DEFAULT_MAX_QUERIES = 3;
const DEFAULT_MAX_TERMS = 8;
const DEFAULT_TIERS: RecollectionTier[] = ["episodic", "vector", "graph", "qmd_source"];
const DEFAULT_SCORE_THRESHOLD = 0.62;
const DEFAULT_MAX_ITEMS = 4;
const DEFAULT_MAX_CHARS = 2400;

const MEMORY_TERMS = new Set([
  "remember",
  "recall",
  "memory",
  "previous",
  "before",
  "again",
  "earlier",
  "recent",
  "context",
  "handoff",
  "decision",
  "requirement",
]);

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "how",
  "i",
  "in",
  "into",
  "is",
  "it",
  "of",
  "on",
  "or",
  "our",
  "that",
  "the",
  "this",
  "to",
  "was",
  "we",
  "what",
  "when",
  "where",
  "with",
  "you",
]);

const clamp01 = (value: number): number => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

const coerceDateMs = (value: Date | string | number | undefined): number | null => {
  if (value === undefined) {
    return null;
  }
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
};

const unique = <T>(values: T[]): T[] => Array.from(new Set(values));

const tokenize = (text: string): string[] => {
  const words = text
    .toLowerCase()
    .match(/[a-z0-9][a-z0-9_-]{1,}/g);

  return words?.filter((word) => !STOP_WORDS.has(word)) ?? [];
};

const entityTokens = (text: string): string[] => {
  const matches = text.match(/\b[A-Z][A-Za-z0-9_-]{2,}\b|`([^`]+)`|[A-Z]{2,}-\d+/g) ?? [];
  return unique(matches.map((match) => match.replaceAll("`", "")));
};

const normalizeProjectList = (
  projectId: string | undefined,
  candidateProjectIds: string[] | undefined,
  crossProjectAllowlist: string[] | undefined,
): { allowedProjectIds: string[]; deniedProjectIds: string[]; authorization: RecollectionAuthorization } => {
  const primary = projectId ? [projectId] : [];
  const candidates = unique([...(candidateProjectIds ?? []), ...primary]);
  const allowlist = new Set(crossProjectAllowlist ?? []);
  const allowedProjectIds = candidates.filter((candidate) => candidate === projectId || allowlist.has(candidate));
  const deniedProjectIds = candidates.filter((candidate) => !allowedProjectIds.includes(candidate));

  if (deniedProjectIds.length > 0 && allowedProjectIds.length === 0) {
    return { allowedProjectIds, deniedProjectIds, authorization: "denied" };
  }

  if (allowedProjectIds.some((candidate) => candidate !== projectId)) {
    return { allowedProjectIds, deniedProjectIds, authorization: "allowlisted_cross_project" };
  }

  return { allowedProjectIds, deniedProjectIds, authorization: "allowed" };
};

export function evaluateRecollectionTrigger(input: RecollectionTriggerInput): RecollectionTriggerReceipt {
  const threshold = input.minTriggerScore ?? DEFAULT_TRIGGER_THRESHOLD;
  const taskText = input.taskText.trim();
  const triggers: RecollectionTrigger[] = [];
  let score = 0;

  const projectScope = normalizeProjectList(input.projectId, input.candidateProjectIds, input.crossProjectAllowlist);

  if (input.enabled === false) {
    return {
      action: "skip",
      timing: input.timing,
      required: false,
      score: 0,
      threshold,
      triggers,
      skipReason: "disabled",
      authorization: projectScope.authorization,
      allowedProjectIds: projectScope.allowedProjectIds,
      deniedProjectIds: projectScope.deniedProjectIds,
      reason: "Proactive recollection is disabled for this decision point.",
    };
  }

  if (!taskText) {
    return {
      action: "skip",
      timing: input.timing,
      required: false,
      score: 0,
      threshold,
      triggers,
      skipReason: "blank_task",
      authorization: projectScope.authorization,
      allowedProjectIds: projectScope.allowedProjectIds,
      deniedProjectIds: projectScope.deniedProjectIds,
      reason: "No task text was available to ground bounded recollection.",
    };
  }

  const taskTokens = tokenize(taskText);
  const explicitMemory = taskTokens.some((token) => MEMORY_TERMS.has(token));
  if (explicitMemory) {
    triggers.push("explicit_memory_request");
    score += 0.35;
  }

  if (entityTokens(taskText).length >= 2 || taskTokens.length >= 12) {
    triggers.push("entity_rich_task");
    score += 0.18;
  }

  const sourceRefs = input.sourceRefs ?? [];
  if (sourceRefs.length > 0) {
    triggers.push("source_reference");
    score += 0.18;
  }

  if (sourceRefs.some((source) => source.changed || source.stale === true || source.healthy === false)) {
    triggers.push("source_changed");
    score += 0.24;
  }

  if (input.handoff?.unresolved || (input.handoff?.blockerCount ?? 0) > 0) {
    triggers.push("unresolved_handoff");
    score += 0.28;
  }

  if ((input.operatorReaskCount ?? 0) > 0) {
    triggers.push("operator_reask");
    score += Math.min(0.22, (input.operatorReaskCount ?? 0) * 0.11);
  }

  if ((input.rediscoveredFactCount ?? 0) > 0) {
    triggers.push("rediscovered_fact_risk");
    score += Math.min(0.22, (input.rediscoveredFactCount ?? 0) * 0.11);
  }

  if ((input.recentHighSalienceFacts ?? 0) > 0) {
    triggers.push("high_salience_recent_fact");
    score += Math.min(0.2, (input.recentHighSalienceFacts ?? 0) * 0.1);
  }

  if (input.timing === "before_final" && input.alreadyHasCitations === false && (sourceRefs.length > 0 || explicitMemory)) {
    triggers.push("final_answer_citation_gap");
    score += 0.2;
  }

  const boundedScore = clamp01(score);
  const missingProjectScope = !input.projectId && projectScope.allowedProjectIds.length === 0;
  const denied = projectScope.authorization === "denied";
  const required = boundedScore >= threshold && !denied && !missingProjectScope;
  const skipReason: RecollectionSkipReason | null = required
    ? null
    : denied
      ? "policy_denied"
      : missingProjectScope
        ? "missing_project_scope"
        : "low_signal";

  return {
    action: required ? "search" : "skip",
    timing: input.timing,
    required,
    score: boundedScore,
    threshold,
    triggers: unique(triggers),
    skipReason,
    authorization: projectScope.authorization,
    allowedProjectIds: projectScope.allowedProjectIds,
    deniedProjectIds: projectScope.deniedProjectIds,
    reason: required
      ? `Recollection required before ${input.timing.replaceAll("_", " ")} because ${unique(triggers).join(", ")} cleared threshold.`
      : `Recollection skipped before ${input.timing.replaceAll("_", " ")}: ${skipReason}.`,
  };
}

export function planRecollectionQueries(input: RecollectionQueryPlanInput): RecollectionQueryPlan[] {
  if (input.decision.action === "skip") {
    return [];
  }

  const maxQueries = Math.max(1, input.maxQueries ?? DEFAULT_MAX_QUERIES);
  const maxTerms = Math.max(2, input.maxTermsPerQuery ?? DEFAULT_MAX_TERMS);
  const tiers = input.tiers ?? DEFAULT_TIERS;
  const recencyDays = input.recencyDays ?? DEFAULT_RECENCY_DAYS;
  const sourceRefs = input.sourceRefs ?? [];
  const taskTerms = unique([...entityTokens(input.taskText), ...tokenize(input.taskText)]).slice(0, maxTerms);
  const sourceTerms = sourceRefs.map((source) => source.id).slice(0, Math.max(1, Math.floor(maxTerms / 2)));
  const handoffTerms = input.decision.triggers.includes("unresolved_handoff") ? ["handoff", "blocker", "next-step"] : [];
  const freshnessTerms = input.decision.triggers.includes("source_changed") ? ["freshness", "changed-source"] : [];

  const querySeeds = [
    taskTerms,
    unique([...taskTerms.slice(0, Math.ceil(maxTerms / 2)), ...sourceTerms, ...freshnessTerms]),
    unique([...taskTerms.slice(0, Math.ceil(maxTerms / 2)), ...handoffTerms]),
  ].filter((terms) => terms.length > 0);

  return querySeeds.slice(0, maxQueries).map((terms, index) => ({
    id: `recollect-q${index + 1}`,
    query: terms.slice(0, maxTerms).join(" "),
    tiers: tiers.filter((tier) => tier !== "qmd_source" || sourceRefs.every((source) => source.healthy !== false)),
    projectIds: input.decision.allowedProjectIds.length > 0
      ? input.decision.allowedProjectIds
      : input.projectId
        ? [input.projectId]
        : [],
    sourceRefIds: sourceRefs.map((source) => source.id),
    recencyDays,
    reasons: input.decision.triggers,
  }));
}

export function rankRecollectionCandidates(
  candidates: RecollectionCandidate[],
  options: RecollectionRankingOptions = {},
): RankedRecollectionCandidate[] {
  const nowMs = coerceDateMs(options.now) ?? Date.now();
  const halfLifeDays = Math.max(1, options.recencyHalfLifeDays ?? 14);

  return candidates
    .map((candidate) => {
      const observedMs = coerceDateMs(candidate.observedAt ?? candidate.updatedAt);
      const sourceUpdatedMs = coerceDateMs(candidate.sourceUpdatedAt);
      const ageDays = observedMs === null ? halfLifeDays : Math.max(0, (nowMs - observedMs) / 86_400_000);
      const recency = clamp01(0.5 ** (ageDays / halfLifeDays));
      const importance = clamp01(Math.max(candidate.importance ?? 0, candidate.salience ?? 0));
      const staleSource = candidate.sourceStale === true || (sourceUpdatedMs !== null && observedMs !== null && sourceUpdatedMs > observedMs);
      const freshness = staleSource ? 0.2 : 1;
      const policyRisk = clamp01(candidate.policyRisk ?? (candidate.authorization === "denied" ? 1 : 0));
      const policySafety = clamp01(1 - policyRisk);
      const relevance = clamp01(candidate.relevance ?? 0);
      const priorUsefulness = clamp01(candidate.priorUsefulness ?? 0);
      const total = clamp01(
        relevance * 0.34
        + recency * 0.16
        + importance * 0.24
        + freshness * 0.1
        + priorUsefulness * 0.1
        + policySafety * 0.06,
      );

      return {
        ...candidate,
        score: total,
        components: {
          relevance,
          recency,
          importance,
          freshness,
          priorUsefulness,
          policySafety,
          total,
        },
        ignoredReason: candidate.authorization === "denied" ? "policy_denied" : undefined,
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.id.localeCompare(right.id);
    });
}

export function assembleRecollectionContextPack(input: RecollectionContextPackInput): RecollectionContextPack {
  const maxItems = Math.max(1, input.maxItems ?? DEFAULT_MAX_ITEMS);
  const maxChars = Math.max(1, input.maxChars ?? DEFAULT_MAX_CHARS);
  const scoreThreshold = input.scoreThreshold ?? DEFAULT_SCORE_THRESHOLD;

  if (input.decision.action === "skip") {
    return {
      entries: [],
      context: "",
      receipt: {
        action: "skip",
        timing: input.decision.timing,
        triggerScore: input.decision.score,
        triggers: input.decision.triggers,
        authorization: input.decision.authorization,
        reason: input.decision.reason,
        retrievedCount: 0,
        injectedCount: 0,
        ignoredCount: 0,
        queryIds: [],
        injectedIds: [],
        ignored: [],
        telemetry: telemetryFor(input.decision, []),
      },
    };
  }

  const entries: RecollectionContextEntry[] = [];
  const ignored: RecollectionContextReceipt["ignored"] = [];
  let usedChars = 0;

  for (const candidate of input.rankedCandidates) {
    const explicitIgnore = candidate.ignoredReason;
    const thresholdIgnore = candidate.score < scoreThreshold ? "below_threshold" : null;
    const budgetIgnore = entries.length >= maxItems || usedChars >= maxChars ? "pack_budget_exhausted" : null;
    const reason = explicitIgnore ?? thresholdIgnore ?? budgetIgnore;

    if (reason) {
      ignored.push({
        id: candidate.id,
        reason,
        score: candidate.score,
        components: candidate.components,
      });
      continue;
    }

    const remainingChars = maxChars - usedChars;
    const text = candidate.text.length > remainingChars
      ? candidate.text.slice(0, Math.max(0, remainingChars - 1)).trimEnd()
      : candidate.text;

    if (!text) {
      ignored.push({
        id: candidate.id,
        reason: "pack_budget_exhausted",
        score: candidate.score,
        components: candidate.components,
      });
      continue;
    }

    entries.push({
      id: candidate.id,
      tier: candidate.tier,
      projectId: candidate.projectId,
      score: candidate.score,
      text,
      citation: candidate.citation,
    });
    usedChars += text.length;
  }

  const context = entries
    .map((entry, index) => {
      const citation = entry.citation ? ` citation=${entry.citation}` : "";
      return `[${index + 1}] id=${entry.id} tier=${entry.tier} score=${entry.score.toFixed(3)}${citation}\n${entry.text}`;
    })
    .join("\n\n");

  return {
    entries,
    context,
    receipt: {
      action: "search",
      timing: input.decision.timing,
      triggerScore: input.decision.score,
      triggers: input.decision.triggers,
      authorization: input.decision.authorization,
      reason: input.decision.reason,
      retrievedCount: input.rankedCandidates.length,
      injectedCount: entries.length,
      ignoredCount: ignored.length,
      queryIds: input.plans.map((plan) => plan.id),
      injectedIds: entries.map((entry) => entry.id),
      ignored,
      telemetry: telemetryFor(input.decision, entries),
    },
  };
}

function telemetryFor(
  decision: RecollectionTriggerReceipt,
  entries: RecollectionContextEntry[],
): RecollectionContextReceipt["telemetry"] {
  return {
    efftel01RetrievalBeforeWork:
      decision.action === "search"
      && entries.length > 0
      && (decision.timing === "before_plan"
        || decision.timing === "before_dispatch"
        || decision.timing === "before_tool_use"),
    efftel04RediscoveredFactGuard: decision.triggers.includes("rediscovered_fact_risk") && entries.length > 0,
    efftel05OperatorReaskGuard: decision.triggers.includes("operator_reask") && entries.length > 0,
  };
}

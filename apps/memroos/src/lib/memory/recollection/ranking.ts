import {
  candidateText,
  legacyTier,
  type RecollectionCandidate,
  type RecollectionPolicyRisk,
  type RecollectionRankingOptions,
  type RecollectionScoreComponents,
  type RankedRecollectionCandidate,
  type ScoredRecollectionCandidate,
} from "./types";

const LEGACY_WEIGHTS = {
  relevance: 0.35,
  importance: 0.25,
  recency: 0.12,
  freshness: 0.13,
  usefulness: 0.1,
  policy: 0.1,
  riskPenalty: -0.2,
} as const;

const STOPWORDS = new Set([
  "a", "an", "and", "any", "are", "as", "at", "be", "before", "by", "for", "from", "in", "is", "it",
  "of", "on", "or", "that", "the", "this", "to", "what", "when", "with",
]);

const unique = <T>(values: T[]): T[] => Array.from(new Set(values));
const clamp01 = (value: number): number => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
const roundScore = (value: number): number => Number(value.toFixed(4));

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

function lexicalRelevance(taskText: string, content: string): number {
  const taskTokens = tokenize(taskText);
  if (taskTokens.length === 0) return 0;
  const contentTokens = new Set(tokenize(content));
  return clamp01(taskTokens.filter((token) => contentTokens.has(token)).length / taskTokens.length);
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

function freshnessScore(sourceHealth: RecollectionCandidate["sourceHealth"]): number {
  switch (sourceHealth ?? "ok") {
    case "ok": return 1;
    case "stale": return 0.35;
    case "degraded": return 0.25;
    case "missing":
    case "disabled": return 0;
  }
}

function policyScore(authorization: RecollectionCandidate["authorization"]): number {
  switch (authorization ?? "allowed") {
    case "allowed": return 1;
    case "redacted":
    case "allowlisted_cross_project": return 0.55;
    case "denied": return 0;
  }
}

function riskPenalty(policyRisk: RecollectionPolicyRisk | number | undefined): number {
  if (typeof policyRisk === "number") return clamp01(policyRisk);
  switch (policyRisk ?? "low") {
    case "low": return 0;
    case "medium": return 0.5;
    case "high": return 1;
  }
}

export function scoreRecollectionCandidate(
  candidate: RecollectionCandidate,
  options: { taskText: string; now?: Date },
): ScoredRecollectionCandidate {
  const now = options.now ?? new Date();
  const components: RecollectionScoreComponents = {
    relevance: roundScore(lexicalRelevance(options.taskText, candidateText(candidate))),
    recency: roundScore(recencyScore(candidate.capturedAt ?? (typeof candidate.observedAt === "string" ? candidate.observedAt : undefined), now)),
    importance: roundScore(clamp01(candidate.importance ?? candidate.salience ?? 0.5)),
    freshness: roundScore(freshnessScore(candidate.sourceHealth)),
    usefulness: roundScore(clamp01(candidate.priorUsefulness ?? 0)),
    policy: roundScore(policyScore(candidate.authorization)),
    riskPenalty: roundScore(riskPenalty(candidate.policyRisk)),
  };
  const total = clamp01(
    components.relevance * LEGACY_WEIGHTS.relevance
    + components.importance * LEGACY_WEIGHTS.importance
    + components.recency * LEGACY_WEIGHTS.recency
    + components.freshness * LEGACY_WEIGHTS.freshness
    + components.usefulness * LEGACY_WEIGHTS.usefulness
    + components.policy * LEGACY_WEIGHTS.policy
    + components.riskPenalty * LEGACY_WEIGHTS.riskPenalty,
  );
  return { candidate, components, total: roundScore(total) };
}

function coerceDateMs(value: Date | string | number | undefined): number | null {
  if (value === undefined) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function rankRecollectionCandidates(
  candidates: RecollectionCandidate[],
  options: RecollectionRankingOptions = {},
): RankedRecollectionCandidate[] {
  const nowMs = coerceDateMs(options.now) ?? Date.now();
  const halfLifeDays = Math.max(1, options.recencyHalfLifeDays ?? 14);

  return candidates
    .map((candidate) => {
      const observedMs = coerceDateMs(candidate.observedAt ?? candidate.updatedAt ?? candidate.capturedAt ?? undefined);
      const sourceUpdatedMs = coerceDateMs(candidate.sourceUpdatedAt);
      const ageDays = observedMs === null ? halfLifeDays : Math.max(0, (nowMs - observedMs) / 86_400_000);
      const recency = clamp01(0.5 ** (ageDays / halfLifeDays));
      const importance = clamp01(Math.max(candidate.importance ?? 0, candidate.salience ?? 0));
      const staleSource = candidate.sourceStale === true || (sourceUpdatedMs !== null && observedMs !== null && sourceUpdatedMs > observedMs);
      const freshness = staleSource ? 0.2 : 1;
      const policyRisk = typeof candidate.policyRisk === "number"
        ? clamp01(candidate.policyRisk)
        : candidate.policyRisk === "high" ? 1 : candidate.policyRisk === "medium" ? 0.5 : candidate.authorization === "denied" ? 1 : 0;
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
        text: candidate.text ?? candidate.content ?? "",
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
    .sort((left, right) => right.score !== left.score ? right.score - left.score : left.id.localeCompare(right.id));
}

export function legacyTierForContext(candidate: RecollectionCandidate) {
  return legacyTier(candidate.tier);
}


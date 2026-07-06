/**
 * Phase 122: belief promotion configuration (BELIEF-PROMO-04).
 *
 * Hard rules encoded here:
 *   1. High-stakes categories ALWAYS route through human review. An LLM
 *      check is not a substitute for an operator.
 *   2. Unlisted sensitive labels FAIL CLOSED: an unclassified sensitive
 *      label is queued for review rather than auto-admitted.
 *   3. All knobs are env-overridable so deployments can tighten or loosen
 *      without a code change, but defaults are conservative.
 */
import type { ClaimCategory } from "./types";

const DEFAULT_HIGH_STAKES_CATEGORIES: ReadonlyArray<ClaimCategory> = [
  "pricing",
  "product_capability",
  "legal_compliance",
  "personal_data",
];

const DEFAULT_SENSITIVE_LABELS: ReadonlyArray<string> = [
  "pii",
  "secret",
  "credential",
  "privileged",
  "contract",
  "payment",
  "health",
];

const DEFAULT_FRESHNESS_DAYS = 180;

const ENV_HIGH_STAKES = "MEMROOS_BELIEF_HIGH_STAKES_CATEGORIES";
const ENV_SENSITIVE = "MEMROOS_BELIEF_SENSITIVE_LABELS";
const ENV_FRESHNESS_DAYS = "MEMROOS_BELIEF_FRESHNESS_DAYS";

function parseCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function parseFiniteInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isClaimCategory(value: string): value is ClaimCategory {
  return (
    value === "pricing" ||
    value === "product_capability" ||
    value === "legal_compliance" ||
    value === "personal_data" ||
    value === "operational" ||
    value === "engineering" ||
    value === "unclassified"
  );
}

export interface BeliefPromotionConfig {
  highStakesCategories: ReadonlySet<ClaimCategory>;
  sensitiveLabels: ReadonlySet<string>;
  freshnessWindowDays: number;
}

/**
 * Resolve the runtime config. Reads from process.env so deployments can
 * tune high-stakes categories, sensitive labels, and the freshness window
 * without a redeploy. Unknown tokens are dropped silently -- a closed
 * validation happens at the call site (fail closed).
 */
export function loadBeliefPromotionConfig(
  env: NodeJS.ProcessEnv = process.env
): BeliefPromotionConfig {
  const highStakesRaw = parseCsv(env[ENV_HIGH_STAKES]);
  const highStakes: ClaimCategory[] = highStakesRaw.length === 0
    ? [...DEFAULT_HIGH_STAKES_CATEGORIES]
    : highStakesRaw.filter(isClaimCategory);

  const sensitiveRaw = parseCsv(env[ENV_SENSITIVE]);
  const sensitive = sensitiveRaw.length === 0
    ? [...DEFAULT_SENSITIVE_LABELS]
    : sensitiveRaw;

  const freshness = parseFiniteInt(env[ENV_FRESHNESS_DAYS], DEFAULT_FRESHNESS_DAYS);

  return {
    highStakesCategories: new Set(highStakes),
    sensitiveLabels: new Set(sensitive.map((label) => label.toLowerCase())),
    freshnessWindowDays: freshness,
  };
}

export const DEFAULT_BELIEF_PROMOTION_CONFIG: BeliefPromotionConfig = Object.freeze({
  highStakesCategories: new Set(DEFAULT_HIGH_STAKES_CATEGORIES),
  sensitiveLabels: new Set(DEFAULT_SENSITIVE_LABELS.map((label) => label.toLowerCase())),
  freshnessWindowDays: DEFAULT_FRESHNESS_DAYS,
}) as BeliefPromotionConfig;

export const BELIEF_CONFIG_ENV_KEYS = {
  highStakes: ENV_HIGH_STAKES,
  sensitive: ENV_SENSITIVE,
  freshnessDays: ENV_FRESHNESS_DAYS,
} as const;

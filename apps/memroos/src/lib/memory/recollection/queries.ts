import type { MemoryRecallTier } from "../recall-evals";
import {
  MAX_RECOLLECTION_QUERY_LIMIT,
  type RecollectionQuery,
  type RecollectionQueryPlan,
  type RecollectionQueryPlanInput,
  type RecollectionSourceRef,
  type RecollectionTriggerInput,
} from "./types";

const unique = <T>(values: T[]): T[] => Array.from(new Set(values));
const normalizeSpace = (value: string): string => value.replace(/\s+/g, " ").trim();

function normalizeSources(input: RecollectionTriggerInput): RecollectionSourceRef[] {
  return (input.sourceRefs ?? []).flatMap((source) => {
    if (typeof source === "string") return source.trim() ? [{ id: source.trim() }] : [];
    return source.id.trim() ? [source] : [];
  });
}

function tokenize(value: string): string[] {
  return unique(
    value
      .toLowerCase()
      .replace(/[^a-z0-9_./-]+/g, " ")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3)
  );
}

function entityTokens(text: string): string[] {
  const matches = text.match(/\b[A-Z][A-Za-z0-9_-]{2,}\b|`([^`]+)`|[A-Z]{2,}-\d+/g) ?? [];
  return unique(matches.map((match) => match.replaceAll("`", "")));
}

function recencyWindowDays(taskText: string): number | undefined {
  if (/\btoday|yesterday|last\s+night\b/i.test(taskText)) return 2;
  if (/\blast\s+week|this\s+week|recent|recently|latest\b/i.test(taskText)) return 14;
  if (/\blast\s+month|this\s+month\b/i.test(taskText)) return 45;
  return undefined;
}

export function planLegacyRecollectionQueries(input: RecollectionTriggerInput): RecollectionQuery[] {
  const taskText = normalizeSpace(input.taskText);
  if (!taskText) return [];

  const project = (input.project ?? input.projectId)?.trim().toLowerCase();
  const entities = unique((input.entities ?? []).map(normalizeSpace).filter(Boolean));
  const sourceRefs = unique(normalizeSources(input).map((source) => normalizeSpace(source.id)).filter(Boolean));
  const tiers: MemoryRecallTier[] = ["episodic", "vector", "qmd"];
  if (entities.length > 0) tiers.push("graph");
  const queryParts = [project ? project[0].toUpperCase() + project.slice(1) : undefined, ...entities, taskText].filter(Boolean) as string[];
  const timeWindowDays = recencyWindowDays(taskText);
  return [{
    text: normalizeSpace(queryParts.join(" ")),
    tiers: unique(tiers),
    scope: {
      ...(project ? { project } : {}),
      ...(sourceRefs.length > 0 ? { sources: sourceRefs } : {}),
      ...(timeWindowDays ? { timeWindowDays } : {}),
    },
    limit: Math.min(MAX_RECOLLECTION_QUERY_LIMIT, Math.max(1, Math.trunc(input.requestedLimit ?? MAX_RECOLLECTION_QUERY_LIMIT))),
  }];
}

const DEFAULT_RECENCY_DAYS = 30;
const DEFAULT_MAX_QUERIES = 3;
const DEFAULT_MAX_TERMS = 8;
const DEFAULT_TIERS: RecollectionQueryPlan["tiers"] = ["episodic", "vector", "graph", "qmd_source"];

function proactivePlan(input: RecollectionQueryPlanInput): RecollectionQueryPlan[] {
  if (input.decision.action === "skip") return [];

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

export function planRecollectionQueries(input: RecollectionTriggerInput): RecollectionQuery[];
export function planRecollectionQueries(input: RecollectionQueryPlanInput): RecollectionQueryPlan[];
export function planRecollectionQueries(input: RecollectionTriggerInput | RecollectionQueryPlanInput): RecollectionQuery[] | RecollectionQueryPlan[] {
  if ("decision" in input) return proactivePlan(input);
  return planLegacyRecollectionQueries(input);
}


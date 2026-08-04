import type {
  RecollectionAuthorization,
  RecollectionDecision,
  RecollectionReason,
  RecollectionSkipReason,
  RecollectionSourceRef,
  RecollectionTrigger,
  RecollectionTriggerInput,
  RecollectionTriggerReceipt,
} from "./types";
import { recollectionTiming, proactiveTiming } from "./types";
import { planLegacyRecollectionQueries } from "./queries";

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

const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from", "how", "i", "in",
  "into", "is", "it", "of", "on", "or", "our", "that", "the", "this", "to", "was", "we", "what",
  "when", "where", "with", "you",
]);

const unique = <T>(values: T[]): T[] => Array.from(new Set(values));

const normalizeSpace = (value: string): string => value.replace(/\s+/g, " ").trim();

const tokenize = (text: string): string[] => {
  const words = text.toLowerCase().match(/[a-z0-9][a-z0-9_-]{1,}/g) ?? [];
  return words.filter((word) => !STOPWORDS.has(word));
};

const entityTokens = (text: string): string[] => {
  const matches = text.match(/\b[A-Z][A-Za-z0-9_-]{2,}\b|`([^`]+)`|[A-Z]{2,}-\d+/g) ?? [];
  return unique(matches.map((match) => match.replaceAll("`", "")));
};

export function normalizeSourceRefs(input: RecollectionTriggerInput): RecollectionSourceRef[] {
  return (input.sourceRefs ?? []).flatMap((source) => {
    if (typeof source === "string") {
      return source.trim() ? [{ id: source.trim() }] : [];
    }
    return source.id.trim() ? [source] : [];
  });
}

function normalizeProjectList(
  projectId: string | undefined,
  candidateProjectIds: string[] | undefined,
  crossProjectAllowlist: string[] | undefined,
): { allowedProjectIds: string[]; deniedProjectIds: string[]; authorization: RecollectionAuthorization } {
  const primary = projectId?.trim() ? [projectId.trim()] : [];
  const candidates = unique([...(candidateProjectIds ?? []).filter(Boolean), ...primary]);
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
}

function hasRecencyLanguage(text: string): boolean {
  return /\b(today|yesterday|recent|recently|latest|last\s+(week|month|night)|this\s+(week|month)|follow-?up|handoff)\b/i.test(text);
}

function hasExplicitMemoryRequest(text: string): boolean {
  return /\b(search|check|recall|remember|look up|look for|find|prior work|have we done this)\b/i.test(text);
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
  const project = (input.project ?? input.projectId)?.trim();
  return project ? project.toLowerCase() : undefined;
}

/** Legacy Phase 118 trigger policy retained verbatim at the canonical seam. */
export function decideRecollection(input: RecollectionTriggerInput): RecollectionDecision {
  const taskText = normalizeSpace(input.taskText);
  const timing = recollectionTiming(input.timing);
  const project = normalizedProject(input);
  const entities = unique((input.entities ?? []).map(normalizeSpace).filter(Boolean));
  const sourceRefs = unique(normalizeSourceRefs(input).map((source) => normalizeSpace(source.id)).filter(Boolean));
  const reasons: RecollectionReason[] = [];

  if (hasRecencyLanguage(taskText)) reasons.push("task_has_recency_ref");
  if (project) reasons.push("task_has_project_ref");
  if (sourceRefs.length > 0) reasons.push("task_has_source_ref");
  if (entities.length > 0) reasons.push("task_has_stable_entities");
  if (hasActiveHandoff(input.handoffState)) reasons.push("project_has_recent_handoff");
  if (input.rediscoveryRisk) reasons.push("rediscovery_risk");
  if (hasExplicitMemoryRequest(taskText)) reasons.push("explicit_memory_request");

  const searchReasons = reasons.filter((reason) => reason !== "explicit_memory_request" || reasons.length > 1);
  const shouldSearch = taskText.length > 0
    && (searchReasons.length > 0 || (hasExplicitMemoryRequest(taskText) && !isMechanicalTask(taskText)));

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
    queries: planLegacyRecollectionQueries(input),
    skipReason: null,
  };
}

/**
 * Rich proactive trigger policy. The four audited vocabulary additions are
 * deliberately kept here: source_changed, operator_reask,
 * rediscovered_fact_risk, and final_answer_citation_gap.
 */
export function evaluateRecollectionTrigger(input: RecollectionTriggerInput): RecollectionTriggerReceipt {
  const threshold = input.minTriggerScore ?? 0.55;
  const taskText = input.taskText.trim();
  const timing = proactiveTiming(input.timing);
  const projectId = input.projectId?.trim() || input.project?.trim() || undefined;
  const triggers: RecollectionTrigger[] = [];
  let score = 0;
  const projectScope = normalizeProjectList(projectId, input.candidateProjectIds, input.crossProjectAllowlist);

  const skip = (skipReason: RecollectionSkipReason, reason: string): RecollectionTriggerReceipt => ({
    action: "skip",
    timing,
    required: false,
    score: 0,
    threshold,
    triggers,
    skipReason,
    authorization: projectScope.authorization,
    allowedProjectIds: projectScope.allowedProjectIds,
    deniedProjectIds: projectScope.deniedProjectIds,
    reason,
  });

  if (input.enabled === false) return skip("disabled", "Proactive recollection is disabled for this decision point.");
  if (!taskText) return skip("blank_task", "No task text was available to ground bounded recollection.");

  const taskTokens = tokenize(taskText);
  const explicitMemory = taskTokens.some((token) => MEMORY_TERMS.has(token)) || hasExplicitMemoryRequest(taskText);
  if (explicitMemory) {
    triggers.push("explicit_memory_request");
    // A direct "have we done this before?" request is itself sufficient signal.
    score += hasExplicitMemoryRequest(taskText) ? 0.55 : 0.35;
  }
  if (entityTokens(taskText).length >= 2 || taskTokens.length >= 12) {
    triggers.push("entity_rich_task");
    score += 0.18;
  }

  const sourceRefs = normalizeSourceRefs(input);
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
  if ((input.rediscoveredFactCount ?? 0) > 0 || input.rediscoveryRisk) {
    triggers.push("rediscovered_fact_risk");
    score += Math.min(0.22, Math.max(1, input.rediscoveredFactCount ?? 0) * 0.11);
  }
  if ((input.recentHighSalienceFacts ?? 0) > 0) {
    triggers.push("high_salience_recent_fact");
    score += Math.min(0.2, (input.recentHighSalienceFacts ?? 0) * 0.1);
  }
  if (timing === "before_final" && input.alreadyHasCitations === false && (sourceRefs.length > 0 || explicitMemory)) {
    triggers.push("final_answer_citation_gap");
    score += 0.2;
  }

  const boundedScore = Math.min(1, Math.max(0, Number.isFinite(score) ? score : 0));
  // A missing project is allowed for same-tenant topic probes. A supplied
  // candidate project list still requires the explicit allowlist behavior.
  const missingProjectScope = !projectId && (input.candidateProjectIds?.length ?? 0) > 0 && projectScope.allowedProjectIds.length === 0;
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
    timing,
    required,
    score: boundedScore,
    threshold,
    triggers: unique(triggers),
    skipReason,
    authorization: projectScope.authorization,
    allowedProjectIds: projectScope.allowedProjectIds,
    deniedProjectIds: projectScope.deniedProjectIds,
    reason: required
      ? `Recollection required before ${timing.replaceAll("_", " ")} because ${unique(triggers).join(", ")} cleared threshold.`
      : `Recollection skipped before ${timing.replaceAll("_", " ")}: ${skipReason}.`,
  };
}

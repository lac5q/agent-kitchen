import {
  DEFAULT_RECOLLECTION_MAX_ITEMS,
  DEFAULT_RECOLLECTION_THRESHOLD,
  candidateText,
  legacyTier,
  type IgnoredRecollectionCandidate,
  type RecollectionCandidate,
  type RecollectionContextItem,
  type RecollectionContextPack,
  type RecollectionContextPackInput,
  type RecollectionContextReceipt,
  type RecollectionTriggerReceipt,
} from "./types";
import { scoreRecollectionCandidate } from "./ranking";

function relianceFor(stage: RecollectionContextItem["beliefStage"]): Pick<RecollectionContextItem, "reliance" | "promotionReason" | "caveatReason"> {
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

function legacyPack(
  candidates: RecollectionCandidate[],
  options: { taskText: string; now?: Date; threshold?: number; maxItems?: number },
): RecollectionContextPack {
  const threshold = options.threshold ?? DEFAULT_RECOLLECTION_THRESHOLD;
  const maxItems = Math.max(1, Math.trunc(options.maxItems ?? DEFAULT_RECOLLECTION_MAX_ITEMS));
  const scored = candidates
    .map((candidate) => scoreRecollectionCandidate(candidate, { taskText: options.taskText, now: options.now }))
    .sort((left, right) => right.total - left.total || left.candidate.id.localeCompare(right.candidate.id));
  const injected: RecollectionContextItem[] = [];
  const ignored: IgnoredRecollectionCandidate[] = [];

  for (const item of scored) {
    if (item.candidate.authorization === "denied") {
      ignored.push({ id: item.candidate.id, reason: "policy_denied", score: item.total, components: item.components });
      continue;
    }
    if (item.total < threshold || injected.length >= maxItems) {
      ignored.push({ id: item.candidate.id, reason: "below_threshold", score: item.total, components: item.components });
      continue;
    }
    const beliefStage = item.candidate.beliefStage ?? "silver_candidate_claim";
    injected.push({
      id: item.candidate.id,
      tier: legacyTier(item.candidate.tier),
      content: candidateText(item.candidate),
      beliefStage,
      provenance: item.candidate.provenance ?? "recollection",
      score: item.total,
      components: item.components,
      ...relianceFor(beliefStage),
    });
  }

  const receipt: RecollectionContextReceipt = {
    action: "search",
    timing: "before_plan",
    triggerScore: 1,
    triggers: [],
    authorization: "allowed",
    reason: "Legacy Phase 118 context pack",
    retrievedCount: candidates.length,
    injectedCount: injected.length,
    ignoredCount: ignored.length,
    queryIds: [],
    injectedIds: injected.map((item) => item.id),
    ignored: ignored.map((item) => ({ id: item.id, reason: item.reason, score: item.score, components: {
      relevance: item.components.relevance,
      recency: item.components.recency,
      importance: item.components.importance,
      freshness: item.components.freshness,
      priorUsefulness: item.components.usefulness,
      policySafety: item.components.policy,
      total: item.score,
    }})),
    telemetry: {
      efftel01RetrievalBeforeWork: injected.length > 0,
      efftel04RediscoveredFactGuard: false,
      efftel05OperatorReaskGuard: false,
    },
  };
  return { injected, ignored, entries: [], context: "", receipt };
}

function proactivePack(input: RecollectionContextPackInput): RecollectionContextPack {
  const maxItems = Math.max(1, input.maxItems ?? 4);
  const maxChars = Math.max(1, input.maxChars ?? 2400);
  const scoreThreshold = input.scoreThreshold ?? DEFAULT_RECOLLECTION_THRESHOLD;
  const decision = input.decision;

  if (decision.action === "skip") {
    return {
      injected: [],
      ignored: [],
      entries: [],
      context: "",
      receipt: {
        action: "skip",
        timing: decision.timing,
        triggerScore: decision.score,
        triggers: decision.triggers,
        authorization: decision.authorization,
        reason: decision.reason,
        retrievedCount: 0,
        injectedCount: 0,
        ignoredCount: 0,
        queryIds: [],
        injectedIds: [],
        ignored: [],
        telemetry: telemetryFor(decision, []),
      },
    };
  }

  const entries: RecollectionContextPack["entries"] = [];
  const ignored: RecollectionContextReceipt["ignored"] = [];
  let usedChars = 0;
  for (const candidate of input.rankedCandidates) {
    const explicitIgnore = candidate.ignoredReason;
    const thresholdIgnore = candidate.score < scoreThreshold ? "below_threshold" : null;
    const budgetIgnore = entries.length >= maxItems || usedChars >= maxChars ? "pack_budget_exhausted" : null;
    const reason = explicitIgnore ?? thresholdIgnore ?? budgetIgnore;
    if (reason) {
      ignored.push({ id: candidate.id, reason, score: candidate.score, components: candidate.components });
      continue;
    }
    const rawText = candidateText(candidate);
    const remainingChars = maxChars - usedChars;
    const text = rawText.length > remainingChars ? rawText.slice(0, Math.max(0, remainingChars - 1)).trimEnd() : rawText;
    if (!text) {
      ignored.push({ id: candidate.id, reason: "pack_budget_exhausted", score: candidate.score, components: candidate.components });
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

  const context = entries.map((entry, index) => {
    const citation = entry.citation ? ` citation=${entry.citation}` : "";
    return `[${index + 1}] id=${entry.id} tier=${entry.tier} score=${entry.score.toFixed(3)}${citation}\n${entry.text}`;
  }).join("\n\n");
  const receipt: RecollectionContextReceipt = {
    action: "search",
    timing: decision.timing,
    triggerScore: decision.score,
    triggers: decision.triggers,
    authorization: decision.authorization,
    reason: decision.reason,
    retrievedCount: input.rankedCandidates.length,
    injectedCount: entries.length,
    ignoredCount: ignored.length,
    queryIds: input.plans.map((plan) => plan.id),
    injectedIds: entries.map((entry) => entry.id),
    ignored,
    telemetry: telemetryFor(decision, entries),
  };
  return { injected: [], ignored: [], entries, context, receipt };
}

function telemetryFor(decision: RecollectionTriggerReceipt, entries: RecollectionContextPack["entries"]): RecollectionContextReceipt["telemetry"] {
  return {
    efftel01RetrievalBeforeWork:
      decision.action === "search"
      && entries.length > 0
      && (decision.timing === "before_plan" || decision.timing === "before_dispatch" || decision.timing === "before_tool_use"),
    // EFFTEL-04: retain the rediscovered-fact guard at the canonical seam.
    efftel04RediscoveredFactGuard: decision.triggers.includes("rediscovered_fact_risk") && entries.length > 0,
    efftel05OperatorReaskGuard: decision.triggers.includes("operator_reask") && entries.length > 0,
  };
}

export function assembleRecollectionContextPack(
  candidates: RecollectionCandidate[],
  options: { taskText: string; now?: Date; threshold?: number; maxItems?: number },
): RecollectionContextPack;
export function assembleRecollectionContextPack(input: RecollectionContextPackInput): RecollectionContextPack;
export function assembleRecollectionContextPack(
  input: RecollectionCandidate[] | RecollectionContextPackInput,
  options?: { taskText: string; now?: Date; threshold?: number; maxItems?: number },
): RecollectionContextPack {
  return Array.isArray(input) ? legacyPack(input, options ?? { taskText: "" }) : proactivePack(input);
}

/**
 * SAVEQ-01/02: deterministic quality scoring for governed memory writes.
 *
 * This module deliberately has no database or model dependency.  The route
 * supplies the already-computed dedupe and policy facts; keeping the rubric
 * pure makes the coach-back contract easy to test and prevents an LLM from
 * becoming an admission oracle.
 */

export const SAVE_QUALITY_THRESHOLD = 0.6;

export type SaveQualityVerdict = "accepted" | "accepted_with_coaching" | "rejected";

export interface SaveQualityPromotionCheck {
  name: string;
  pass: boolean;
}

export interface SaveQualityInput {
  memoryType?: string | null;
  content?: string | null;
  metadata?: Record<string, unknown>;
  duplicateOf?: string | null;
  policyAllowed?: boolean;
  promotionChecks?: SaveQualityPromotionCheck[];
  firstSeenAt?: string;
}

export interface SaveQualityReport {
  score: number;
  threshold: number;
  components: {
    type_fit: number;
    provenance: number;
    dedupe: number;
    specificity: number;
    promotion_readiness: number;
  };
  flags: string[];
  guidance: string[];
  verdict: SaveQualityVerdict;
}

const GUIDANCE: Record<string, string> = {
  no_outcome_stated:
    "Add what happened as a result — a decision without its outcome can't be relied on later.",
  procedure_belongs_in_skill:
    "This is a repeatable procedure. Propose a skill (SkillForge) — memory is for decisions, outcomes, and facts.",
  no_provenance:
    "Add source ref and derived-from; unsourced claims cannot be promoted past silver.",
};

function bounded(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function metadataText(metadata: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    if (hasText(metadata[key])) return metadata[key].trim();
  }
  return null;
}

function metadataList(metadata: Record<string, unknown>, keys: string[]): unknown[] {
  for (const key of keys) {
    if (Array.isArray(metadata[key])) return metadata[key];
  }
  return [];
}

function hasOutcome(content: string): boolean {
  return /\b(?:outcome|result|resolved|fixed|shipped|completed|passed|failed|increased|decreased|reduced|decided|chose|led to|because)\b/i.test(
    content
  );
}

function hasProjectScope(content: string, metadata: Record<string, unknown>): boolean {
  return Boolean(
    metadataText(metadata, ["project", "repo", "projectId", "project_id", "taskId", "task_id"]) ||
      /\b(?:project|repo|repository|workspace|issue|ticket)\b\s*[:#-]?\s*[A-Za-z0-9_.-]+/i.test(content)
  );
}

function hasNamedEntity(content: string, metadata: Record<string, unknown>): boolean {
  if (metadataList(metadata, ["entities", "entityIds", "entity_ids"]).length > 0) return true;
  if (/https?:\/\/|\b[A-Z]{2,}-\d+\b/.test(content)) return true;
  const ignored = new Set(["Remember", "Add", "This", "The", "Procedure", "Decision", "Task", "Follow"]);
  return Array.from(content.matchAll(/\b[A-Z][A-Za-z0-9_-]{2,}\b/g)).some((match) => {
    const index = match.index ?? 0;
    return index > 0 && !ignored.has(match[0]);
  });
}

function looksLikeProcedure(content: string, memoryType: string | null | undefined): boolean {
  if (memoryType?.toLowerCase() === "runbook") return true;
  return /\b(?:procedure|runbook|workflow|how to|steps?|always do)\b/i.test(content) ||
    /(?:^|\n)\s*\d+[.)]\s+/.test(content);
}

function typeFit(content: string, memoryType: string | null | undefined): number {
  const type = memoryType?.toLowerCase();
  if (!type) return 0.5;
  if (!["vector", "episodic", "graph", "semantic", "event", "relationship", "entity", "note"].includes(type)) {
    return 0.5;
  }
  if (type === "graph" || type === "relationship" || type === "entity") {
    return /\b(?:relates? to|depends on|belongs to|connected|owns?|uses?)\b/i.test(content) || hasNamedEntity(content, {}) ? 1 : 0.5;
  }
  if (type === "vector" || type === "semantic") {
    return content.trim().split(/\s+/).length >= 4 ? 1 : 0.5;
  }
  return hasOutcome(content) || /\b(?:on|at|after|during|when)\b/i.test(content) ? 1 : 0.5;
}

function promotionReadiness(
  input: SaveQualityInput,
  provenance: number,
  dedupe: number
): number {
  if (input.promotionChecks && input.promotionChecks.length > 0) {
    return bounded(
      input.promotionChecks.filter((check) => check.pass).length / input.promotionChecks.length
    );
  }
  // A bronze write has not become a candidate yet, so freshness/conflict are
  // intentionally deferred to the silver scheduler.  Capture the facts that
  // are knowable at write time without pretending the five-check gate passed.
  return bounded((provenance + dedupe + (input.policyAllowed === false ? 0 : 1)) / 3);
}

export function scoreMemoryWrite(input: SaveQualityInput): SaveQualityReport {
  const content = input.content?.trim() ?? "";
  const metadata = input.metadata ?? {};
  const outcome = hasOutcome(content);
  const project = hasProjectScope(content, metadata);
  const entity = hasNamedEntity(content, metadata);

  const hasSource = Boolean(
    metadataText(metadata, [
      "source",
      "sourceRef",
      "source_ref",
      "sourceId",
      "source_id",
      "sourceUrl",
      "source_url",
      "sourcePath",
      "source_path",
    ])
  );
  const hasDerivedFrom = Boolean(metadataText(metadata, ["derivedFrom", "derived_from"]));
  const provenance = bounded((Number(hasSource) + Number(hasDerivedFrom) + Number(Boolean(input.firstSeenAt))) / 3);
  const dedupe = input.duplicateOf ? 0 : 1;
  const specificity = (Number(outcome) + Number(project) + Number(entity)) / 3;
  const readiness = promotionReadiness(input, provenance, dedupe);
  const components = {
    type_fit: bounded(typeFit(content, input.memoryType)),
    provenance,
    dedupe,
    specificity: bounded(specificity),
    promotion_readiness: readiness,
  };
  const score = bounded(
    components.type_fit * 0.15 +
      components.provenance * 0.2 +
      components.dedupe * 0.2 +
      components.specificity * 0.35 +
      components.promotion_readiness * 0.1
  );

  const flags: string[] = [];
  if (!outcome) flags.push("no_outcome_stated");
  if (input.duplicateOf) flags.push(`duplicate_of:${input.duplicateOf}`);
  if (looksLikeProcedure(content, input.memoryType)) flags.push("procedure_belongs_in_skill");
  if (provenance < 1) flags.push("no_provenance");
  if (input.policyAllowed === false) flags.push("policy_violation");

  const guidance = flags.flatMap((flag) => {
    if (flag.startsWith("duplicate_of:")) {
      return [
        `This already exists as \`${flag.slice("duplicate_of:".length)}\`; flagged as rediscovery. Update that memory instead of adding a second copy.`,
      ];
    }
    return GUIDANCE[flag] ? [GUIDANCE[flag]] : [];
  });
  const verdict: SaveQualityVerdict =
    input.policyAllowed === false
      ? "rejected"
      : score >= SAVE_QUALITY_THRESHOLD
        ? "accepted"
        : "accepted_with_coaching";

  return {
    score: Number(score.toFixed(4)),
    threshold: SAVE_QUALITY_THRESHOLD,
    components: {
      type_fit: Number(components.type_fit.toFixed(4)),
      provenance: Number(components.provenance.toFixed(4)),
      dedupe: Number(components.dedupe.toFixed(4)),
      specificity: Number(components.specificity.toFixed(4)),
      promotion_readiness: Number(components.promotion_readiness.toFixed(4)),
    },
    flags,
    guidance,
    verdict,
  };
}

/**
 * ONTO-06: shared ontology type references for policy / belief / retrieval receipts.
 *
 * Shape supports phrases like "gold Claim about an Account" without embedding
 * raw content. These fields are descriptive coordinates for rules and audit —
 * never sole authorization evidence by themselves.
 */

import type { BeliefStage } from "@/lib/memory/recollection";

export interface OntologyTypeReceiptRef {
  /** Ontology type of the record (e.g. "claim"). */
  ontologyType: string;
  /** Optional subject type the record is about (e.g. "organization" / Account). */
  aboutType?: string;
  /** Belief stage when the receipt is belief- or retrieval-scoped. */
  beliefStage?: BeliefStage | string;
  /** Stable canonical id when known (e.g. "claim" or "gtm.account"). */
  canonicalId?: string;
}

/**
 * Build a compact typed receipt ref. Accepts Account as an alias of organization.
 */
export function buildOntologyTypeReceiptRef(input: {
  ontologyType: string;
  aboutType?: string;
  beliefStage?: BeliefStage | string;
  canonicalId?: string;
}): OntologyTypeReceiptRef {
  const ontologyType = normalizeTypeToken(input.ontologyType);
  if (!ontologyType) {
    throw new Error("ontologyType is required for ontology type receipt refs");
  }
  const aboutType = input.aboutType ? normalizeTypeToken(input.aboutType) : undefined;
  const ref: OntologyTypeReceiptRef = {
    ontologyType,
    ...(aboutType ? { aboutType } : {}),
    ...(input.beliefStage ? { beliefStage: input.beliefStage } : {}),
    ...(input.canonicalId?.trim()
      ? { canonicalId: input.canonicalId.trim() }
      : { canonicalId: ontologyType }),
  };
  return ref;
}

/** Leaf token from a dotted canonical id ("memroos.claim" → "claim"). */
export function ontologyTypeFromCanonicalId(canonicalId: string): string {
  const cleaned = canonicalId?.trim();
  if (!cleaned) return "";
  const parts = cleaned.split(".");
  return parts[parts.length - 1] ?? cleaned;
}

/**
 * Enrich an existing ontology receipt block with typed ontologyType / aboutType /
 * beliefStage fields without dropping prior coordinates.
 */
export function withOntologyTypeRef<T extends Record<string, unknown>>(
  ontology: T,
  opts: { aboutType?: string; beliefStage?: BeliefStage | string; ontologyType?: string } = {},
): T & OntologyTypeReceiptRef {
  const canonicalId =
    typeof ontology.canonicalId === "string" ? ontology.canonicalId : opts.ontologyType ?? "";
  const derivedType = ontologyTypeFromCanonicalId(canonicalId);
  const typeRef = buildOntologyTypeReceiptRef({
    ontologyType: opts.ontologyType ?? (derivedType || "entity"),
    aboutType: opts.aboutType,
    beliefStage: opts.beliefStage,
    canonicalId: canonicalId || undefined,
  });
  return { ...ontology, ...typeRef };
}

function normalizeTypeToken(value: string): string {
  const cleaned = value.trim().toLowerCase();
  if (!cleaned) return "";
  // Cordant / GTM alias: Account → organization (upper ontology).
  if (cleaned === "account") return "organization";
  const leaf = cleaned.includes(".") ? cleaned.split(".").pop() ?? cleaned : cleaned;
  return leaf;
}

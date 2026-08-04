/**
 * Phase 123: thin wiring helper that wraps the policy filter for callers
 * that have memory-bucket-shaped items (objects with a beliefStage field).
 *
 * Outbound-facing call sites pass their `memories`/`sources` arrays through
 * this helper rather than calling filterOutboundClaims directly. The helper
 *   - tolerates non-object entries (pass through unchanged for backward compat)
 *   - tolerates items missing beliefStage (pass through unchanged)
 *   - tags each emitted item with { beliefStage, caveat? } so downstream
 *     renderers can render the right affordance without re-inspecting
 *   - returns the receipts array so callers can hand them to telemetry
 *
 * This module deliberately does NOT write to memory or send anything. It is
 * the single chokepoint the rest of the codebase should funnel through when
 * a bundle/list is about to leave the trust boundary.
 */
import type { BeliefStage } from "../memory/recollection-policy";

import {
  type FilteredClaim,
  type OutboundFilterResult,
  type OutboundPolicy,
  type OutboundReceipt,
  filterOutboundClaims,
} from "./outbound-policy";

export interface OutboundMemoryItem {
  /** Any object; downstream callers stay opaque to internal schema. */
  [key: string]: unknown;
  /** Optional in items not yet promoted. Presence wires the policy filter. */
  beliefStage?: BeliefStage;
}

/** A memory item with the policy filter applied. */
export type FilteredOutboundItem = OutboundMemoryItem & {
  beliefStage: BeliefStage;
  /** Mirrors the caveat string OR citationOnly flag from the FilteredClaim. */
  caveat?: string | null;
};

export interface ApplyOutboundPolicyResult {
  emitted: FilteredOutboundItem[];
  dropped: OutboundMemoryItem[];
  receipts: OutboundReceipt[];
}

const STAGE_VALUES: ReadonlySet<BeliefStage> = new Set<BeliefStage>([
  "gold_operational_truth",
  "silver_candidate_claim",
  "bronze_raw_source",
]);

function asStringContent(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.content === "string") return obj.content;
    if (typeof obj.text === "string") return obj.text;
  }
  return null;
}

function extractBeliefStage(item: OutboundMemoryItem): BeliefStage | null {
  if (item.beliefStage && STAGE_VALUES.has(item.beliefStage)) return item.beliefStage;
  const nested = item.stage;
  if (STAGE_VALUES.has(nested as BeliefStage)) return nested as BeliefStage;
  const typeLike = item.belief_stage;
  if (STAGE_VALUES.has(typeLike as BeliefStage)) return typeLike as BeliefStage;
  return null;
}

function buildTaggedItem(
  claim: OutboundMemoryItem,
  stage: BeliefStage,
  filtered: FilteredClaim
): FilteredOutboundItem {
  const base: FilteredOutboundItem = { ...claim, beliefStage: stage };
  switch (filtered.stage) {
    case "gold_operational_truth":
      base.caveat = null;
      return base;
    case "silver_candidate_claim":
      base.caveat = filtered.caveat;
      return base;
    case "bronze_raw_source":
      // The shape carries `citationOnly` already; surface it as a caveat slot
      // so downstream renderers have one consistent field name.
      base.caveat = `[citation only]`;
      (base as Record<string, unknown>).citationOnly = true;
      return base;
  }
}

export function applyOutboundPolicyToMemoryItems(
  items: ReadonlyArray<OutboundMemoryItem>,
  policy: OutboundPolicy,
  options: { citationMode?: boolean } = {}
): ApplyOutboundPolicyResult {
  // Walk items inline so emitted/dropped/receipts align 1:1 with the source.
  const emitted: FilteredOutboundItem[] = [];
  const dropped: OutboundMemoryItem[] = [];
  const receipts: OutboundReceipt[] = [];
  const emitList: FilteredClaim[] = [];

  for (let i = 0; i < items.length; i += 1) {
    const source = items[i];
    const stage = extractBeliefStage(source);
    const content = asStringContent(source.content ?? source.text ?? source);

    // Items missing a belief stage are emitted verbatim for backward compat;
    // they carry no claim so they also produce no outbound receipt.
    if (!stage || content === null) {
      if (!stage) {
        // Backward compatible: still produced an entry in emitted via the
        // pre-filter path so callers see the same shape. We deliberately
        // don't write a receipt for these because they were never claims.
        const passthrough = { ...source } as unknown as FilteredOutboundItem;
        emitted.push(passthrough);
        continue;
      }
      // No string content -- treat as non-claim; pass through.
      const passthrough = { ...source, beliefStage: stage } as FilteredOutboundItem;
      emitted.push(passthrough);
      continue;
    }

    // We have a stage + content: route through the policy filter.
    const result = filterOutboundClaims(
      [{ id: `${i}`, stage, content }],
      policy,
      { citationMode: options.citationMode === true }
    );

    if (result.emitted.length > 0) {
      emitted.push(buildTaggedItem(source, stage, result.emitted[0]));
      emitList.push(result.emitted[0]);
    } else if (result.dropped.length > 0) {
      dropped.push(source);
    }

    if (result.receipts.length > 0) receipts.push(result.receipts[0]);
  }

  return { emitted, dropped, receipts };
}

// Re-export the underlying filter result type for callers who want to assert
// on the receipts shape without importing the original module.
export type { OutboundFilterResult, OutboundPolicy, OutboundReceipt };

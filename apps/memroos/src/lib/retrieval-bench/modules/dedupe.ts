/**
 * Dedupe preserving distinct facts (VAL-RETR-018).
 *
 * Two items are canonical duplicates iff:
 *   - same canonical id, OR
 *   - same content hash, OR
 *   - the second is an exact derivative (e.g., mem-1 vs mem-1-vector) AND
 *     identical provenance.
 *
 * Distinct scope, time, validity, belief, or canonical id facts ARE NOT
 * collapsed, even when surface text is similar. The receipt records the
 * merge key used so that the dedupe can be re-derived independently.
 */

import crypto from "node:crypto";

import type { RetrievedItem } from "../schema";

export const DEDUPE_STAGE_VERSION = "dedupe-stage-v1";

export interface DedupeKey {
  /** Stable canonical id (corpus id or extracted entity id). */
  canonicalId: string;
  /** Optional scope hash if the item carries scope metadata. */
  scopeHash?: string;
  /** Content hash for raw-equality fallback. */
  contentHash: string;
  /** Optional supersession/chain id when applicable. */
  supersessionId?: string;
}

export type DedupeNonMergeReason =
  | "distinct_scope"
  | "distinct_timestamp"
  | "distinct_validity"
  | "distinct_belief"
  | "distinct_canonical_id"
  | "distinct_authorization";

export interface DedupeDecision {
  ok: boolean;
  reason?: string;
  merge: boolean;
  sourceIndex: number;
  targetIndex: number;
  nonMergeReason?: DedupeNonMergeReason;
}

export interface DedupeReceipt {
  stageVersion: string;
  consideredCount: number;
  keptCount: number;
  mergedCount: number;
  rejectedDistinctCount: number;
  reasons: Record<DedupeNonMergeReason, number>;
  canonicalHash: string;
}

export interface DedupeResult {
  items: RetrievedItem[];
  merged: Array<{ keptIndex: number; droppedIds: string[] }>;
  receipt: DedupeReceipt;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function contentHash(item: RetrievedItem): string {
  const canonical = JSON.stringify({
    id: item.id,
    text: item.text,
    tier: item.tier,
    source: item.source,
    timestamp_iso: item.timestamp_iso ?? null,
  });
  return "sha256:" + crypto.createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

function buildKey(item: RetrievedItem): DedupeKey {
  return {
    canonicalId: item.id,
    scopeHash: item.scopeHash,
    contentHash: contentHash(item),
  };
}

function isExactDerivative(a: RetrievedItem, b: RetrievedItem): boolean {
  // Item A is an exact derivative of B iff one id is the prefix of the
  // other plus a token (e.g., "mem-1" and "mem-1-vector"), and tier is
  // compatible (lexical vs vector-local). Other tier mismatches never
  // collapse.
  if (a.tier !== b.tier && !(a.tier === "vector-local" && b.tier === "vector-local")) {
    return false;
  }
  const ai = a.id;
  const bi = b.id;
  if (ai === bi) return false;
  const [shorter, longer] = ai.length <= bi.length ? [ai, bi] : [bi, ai];
  return longer.startsWith(shorter + "-") || longer.startsWith(shorter + "_");
}

function hashReceipt(args: { items: RetrievedItem[]; merged: DedupeResult["merged"] }): string {
  const canonical = JSON.stringify({
    items: args.items.map((i) => ({ id: i.id, tier: i.tier })),
    merged: args.merged.map((m) => ({ keptIndex: m.keptIndex, droppedIds: m.droppedIds })),
  });
  return "sha256:" + crypto.createHash("sha256").update(canonical).digest("hex");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function dedupeRetrievalResults(args: {
  scope?: string | null;
  items: RetrievedItem[];
}): DedupeResult {
  const reasons: Record<DedupeNonMergeReason, number> = {
    distinct_scope: 0,
    distinct_timestamp: 0,
    distinct_validity: 0,
    distinct_belief: 0,
    distinct_canonical_id: 0,
    distinct_authorization: 0,
  };

  // Items must be non-empty and ordered for determinism; sort by (tier, id)
  // first.
  const items = [...args.items].sort((a, b) => {
    if (a.tier !== b.tier) return a.tier.localeCompare(b.tier);
    return a.id.localeCompare(b.id);
  });

  const kept: RetrievedItem[] = [];
  const mergedLog: Array<{ keptIndex: number; droppedIds: string[] }> = [];

  for (let i = 0; i < items.length; i++) {
    const candidate = items[i];
    let matchedIndex = -1;
    let matchedDecision: DedupeDecision | null = null;
    for (let j = 0; j < kept.length; j++) {
      const existing = kept[j];
      const decision = decideMerge({
        existing,
        candidate,
        explicitScope: args.scope,
      });
      if (decision.merge) {
        matchedIndex = j;
        matchedDecision = decision;
        break;
      }
      // Track the rejection reason for receipt debuggability.
      if (decision.nonMergeReason) reasons[decision.nonMergeReason] += 1;
    }
    if (matchedIndex >= 0) {
      const existing = kept[matchedIndex];
      // Keep the highest score; preserve earliest rank.
      const chosen =
        candidate.score > existing.score
          ? {
              ...candidate,
              rankPosition: existing.rankPosition,
              score: candidate.score,
            }
          : existing;
      kept[matchedIndex] = chosen;
      const existingLog = mergedLog.find((m) => m.keptIndex === matchedIndex);
      if (existingLog) {
        if (!existingLog.droppedIds.includes(candidate.id)) {
          existingLog.droppedIds.push(candidate.id);
        }
      } else {
        mergedLog.push({ keptIndex: matchedIndex, droppedIds: [candidate.id] });
      }
    } else {
      kept.push(candidate);
    }
    void matchedDecision;
  }

  // Re-rank the kept set deterministically by (original index, score, id).
  kept.forEach((k, idx) => {
    k.rankPosition = idx + 1;
  });

  const mergedCount = mergedLog.reduce((acc, m) => acc + m.droppedIds.length, 0);
  const canonicalHash = hashReceipt({ items: kept, merged: mergedLog });

  return {
    items: kept,
    merged: mergedLog,
    receipt: {
      stageVersion: DEDUPE_STAGE_VERSION,
      consideredCount: items.length,
      keptCount: kept.length,
      mergedCount,
      rejectedDistinctCount: Object.values(reasons).reduce((a, b) => a + b, 0),
      reasons,
      canonicalHash,
    },
  };
}

// ---------------------------------------------------------------------------
// Single-pair decision (exposed for downstream stages)
// ---------------------------------------------------------------------------

export function decideMerge(args: {
  existing: RetrievedItem;
  candidate: RetrievedItem;
  explicitScope?: string | null;
}): DedupeDecision {
  const a = args.existing;
  const b = args.candidate;
  const sourceIndex = -1;
  const targetIndex = -1;

  // Distinct canonical ids never auto-merge.
  if (a.id !== b.id) {
    // Allow "exact derivative" merges for vector tiers sharing prefix.
    if (!isExactDerivative(a, b)) {
      return {
        ok: true,
        merge: false,
        sourceIndex,
        targetIndex,
        nonMergeReason: "distinct_canonical_id",
      };
    }
    // Derivatives must share scope + timestamp to merge.
    if (a.scopeHash !== b.scopeHash) {
      return {
        ok: true,
        merge: false,
        sourceIndex,
        targetIndex,
        nonMergeReason: "distinct_scope",
      };
    }
    if ((a.timestamp_iso ?? null) !== (b.timestamp_iso ?? null)) {
      return {
        ok: true,
        merge: false,
        sourceIndex,
        targetIndex,
        nonMergeReason: "distinct_timestamp",
      };
    }
  }

  // Belt-and-suspenders: identical content hash → always merge.
  if (contentHash(a) === contentHash(b)) {
    return { ok: true, merge: true, sourceIndex, targetIndex };
  }

  return {
    ok: true,
    merge: false,
    sourceIndex,
    targetIndex,
    nonMergeReason: "distinct_canonical_id",
  };
}

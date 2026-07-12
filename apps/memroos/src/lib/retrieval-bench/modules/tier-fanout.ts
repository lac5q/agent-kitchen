/**
 * Tier fanout with strict budgets and per-source receipts (VAL-RETR-016).
 *
 * Retrieval considers every configured tier (lexical, vector-local,
 * mem0, qdrant, live) for each task within strict per-source and
 * global budgets. Unauthorized / unregistered / disabled / expired
 * sources are explicit `omitted` outcomes — they never silently score
 * zero and never inflate the result set.
 *
 * Source categorization follows existing federation conventions:
 *   - "registered" -> OK to call
 *   - "unregistered" / "disabled" / "expired" / "revoked" / "malformed"
 *     -> omitted (no call)
 */

import crypto from "node:crypto";

import type { RetrievedItem } from "../schema";

export const FANOUT_STAGE_VERSION = "tier-fanout-v1";

export type FanoutTier = "lexical" | "vector-local" | "mem0" | "qdrant" | "live";
export type SourceState =
  | "registered"
  | "unregistered"
  | "disabled"
  | "expired"
  | "revoked"
  | "malformed";

export interface RegisteredSource {
  tier: FanoutTier;
  state: SourceState;
  trust?: number;
  /** ISO timestamp of when this source expires. */
  expiresAtIso?: string | null;
  /** Per-source allowed operations. */
  allowedOperations?: ReadonlyArray<string>;
}

export interface FanoutBudget {
  /** Maximum sources the fanout stage may call. */
  maxSources: number;
  /** Maximum items per source. */
  maxItemsPerSource: number;
  /** Hard deadline in ms. */
  deadlineMs: number;
}

export type FanoutOutcomeStatus =
  | "success"
  | "empty"
  | "denied"
  | "omitted"
  | "stale"
  | "injection"
  | "timeout"
  | "malformed"
  | "failed";

export interface FanoutSourceReceipt {
  tier: FanoutTier;
  state: SourceState;
  status: FanoutOutcomeStatus;
  reasonCode: string;
  itemCount: number;
  durationMs: number;
  trustAtCall: number | null;
}

export interface FanoutResult {
  items: RetrievedItem[];
  perSource: FanoutSourceReceipt[];
  receipt: {
    stageVersion: string;
    consideredCount: number;
    calledCount: number;
    successCount: number;
    budget: FanoutBudget;
    packHash: string;
  };
}

export type SourceCaller = (args: {
  tier: FanoutTier;
  query: string;
  scope?: string;
  maxItems: number;
}) => Promise<{ items: RetrievedItem[]; trustAtCall?: number; durationMs?: number }>;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface FanoutInput {
  query: string;
  sources: RegisteredSource[];
  scope?: string;
  budget: FanoutBudget;
  caller?: SourceCaller;
  now?: () => number;
  auth?: { trust: (tier: FanoutTier, scope?: string) => number };
  /** Hard-gate to which sources are allowed to actually be called. */
  allowedTiers?: ReadonlyArray<FanoutTier>;
}

export async function performTierFanout(input: FanoutInput): Promise<FanoutResult> {
  const now = input.now ?? Date.now;
  const perSource: FanoutSourceReceipt[] = [];
  const items: RetrievedItem[] = [];
  const allowedSet = new Set(input.allowedTiers ?? ["lexical", "vector-local", "mem0", "qdrant", "live"]);

  // Deterministic ordering of sources: by tier label asc.
  const sources = [...input.sources].sort((a, b) => a.tier.localeCompare(b.tier));

  let calledCount = 0;
  let successCount = 0;

  for (const source of sources) {
    if (!allowedSet.has(source.tier)) {
      perSource.push({
        tier: source.tier,
        state: source.state,
        status: "denied",
        reasonCode: "tier_not_allowed",
        itemCount: 0,
        durationMs: 0,
        trustAtCall: null,
      });
      continue;
    }
    if (calledCount >= input.budget.maxSources) {
      perSource.push({
        tier: source.tier,
        state: source.state,
        status: "omitted",
        reasonCode: "budget_exhausted",
        itemCount: 0,
        durationMs: 0,
        trustAtCall: null,
      });
      continue;
    }

    if (source.state !== "registered") {
      const status: FanoutOutcomeStatus = source.state === "expired" ? "stale" : "omitted";
      perSource.push({
        tier: source.tier,
        state: source.state,
        status,
        reasonCode: "source_state:" + source.state,
        itemCount: 0,
        durationMs: 0,
        trustAtCall: null,
      });
      continue;
    }

    if (source.expiresAtIso) {
      const expiresMs = Date.parse(source.expiresAtIso);
      if (Number.isFinite(expiresMs) && expiresMs <= now()) {
        perSource.push({
          tier: source.tier,
          state: "expired",
          status: "stale",
          reasonCode: "source_expired",
          itemCount: 0,
          durationMs: 0,
          trustAtCall: source.trust ?? null,
        });
        continue;
      }
    }

    calledCount += 1;
    const startedAt = now();
    try {
      const result = input.caller
        ? await input.caller({
            tier: source.tier,
            query: input.query,
            scope: input.scope,
            maxItems: input.budget.maxItemsPerSource,
          })
        : { items: [], durationMs: 0 };
      const durationMs = now() - startedAt;
      if (durationMs > input.budget.deadlineMs) {
        perSource.push({
          tier: source.tier,
          state: source.state,
          status: "timeout",
          reasonCode: "deadline_exceeded",
          itemCount: 0,
          durationMs,
          trustAtCall: source.trust ?? null,
        });
        continue;
      }
      const trustAtCall = result.trustAtCall ?? source.trust ?? 1;
      if (trustAtCall <= 0) {
        perSource.push({
          tier: source.tier,
          state: source.state,
          status: "denied",
          reasonCode: "zero_trust",
          itemCount: 0,
          durationMs,
          trustAtCall: 0,
        });
        continue;
      }
      const sourceItems = (result.items ?? []).slice(0, input.budget.maxItemsPerSource);
      // Mark tier on every retrieved item.
      for (const it of sourceItems) {
        it.tier = source.tier;
        if (!it.source) it.source = source.tier;
        items.push(it);
      }
      successCount += sourceItems.length > 0 ? 1 : 0;
      perSource.push({
        tier: source.tier,
        state: source.state,
        status: sourceItems.length > 0 ? "success" : "empty",
        reasonCode: sourceItems.length > 0 ? "ok" : "no_results",
        itemCount: sourceItems.length,
        durationMs,
        trustAtCall,
      });
    } catch (err) {
      perSource.push({
        tier: source.tier,
        state: source.state,
        status: "failed",
        reasonCode: err instanceof Error ? err.message.slice(0, 64) : "unknown_failure",
        itemCount: 0,
        durationMs: now() - startedAt,
        trustAtCall: source.trust ?? null,
      });
    }
  }

  // Deterministic pack hash.
  const canonical = JSON.stringify(
    perSource.map((s) => ({
      tier: s.tier,
      state: s.state,
      status: s.status,
      itemCount: s.itemCount,
    })),
  );
  const packHash =
    "sha256:" + crypto.createHash("sha256").update(canonical).digest("hex");

  return {
    items: items.sort((a, b) => (a.score === b.score ? a.id.localeCompare(b.id) : b.score - a.score)),
    perSource,
    receipt: {
      stageVersion: FANOUT_STAGE_VERSION,
      consideredCount: input.sources.length,
      calledCount,
      successCount,
      budget: input.budget,
      packHash,
    },
  };
}

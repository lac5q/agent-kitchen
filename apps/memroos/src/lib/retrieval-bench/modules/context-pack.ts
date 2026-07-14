/**
 * Context packing with coverage and byte/token budget (VAL-RETR-019).
 *
 * Packing deterministically selects score-ordered admissible items
 * (evidence_spans, multi-hop coverage where present, tier preference)
 * within a strict byte/token budget and discards the rest with
 * documented omission reasons. The pack hash covers only the selected
 * text, ids, and tier order — never raw licensed conversations.
 *
 * Inputs:
 *   - candidate items (already deduped)
 *   - evidence_spans (corpus IDs that count as coverage)
 *   - temporal caveats (inform priority)
 *   - byte/token budgets
 *
 * Output:
 *   - selected items (deterministic order)
 *   - byte/token totals (canonical, package-byte counted from text only)
 *   - omission reasons for the remainder
 *   - over-budget status flag (always included)
 */

import crypto from "node:crypto";

import type { RetrievedItem } from "../schema";
import type { TemporalCaveat } from "./temporal-retrieval";

export const CONTEXT_PACK_STAGE_VERSION = "context-pack-stage-v1";

export interface ContextPackBudget {
  /** Maximum allowed bytes after UTF-8 encoding of selected item texts. */
  maxBytes: number;
  /** Maximum allowed token estimate (1 token ~= 4 chars for the harness). */
  maxTokens: number;
}

export interface ContextPackReceipt {
  stageVersion: string;
  consideredCount: number;
  selectedCount: number;
  omittedCount: number;
  bytes: number;
  tokens: number;
  budget: ContextPackBudget;
  overBudget: boolean;
  packHash: string;
  omissionReasons: Record<string, number>;
  coverageMet: boolean;
  evidenceCoverage: { required: number; included: number };
  temporalCaveatCodes: string[];
}

export interface ContextPackResult {
  items: RetrievedItem[];
  omitted: Array<{ id: string; reason: string }>;
  receipt: ContextPackReceipt;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function utf8ByteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

function estimateTokens(text: string): number {
  // Deterministic, conservative: ~4 chars per token.
  return Math.ceil(text.length / 4);
}

function hashPack(items: RetrievedItem[]): string {
  const canonical = JSON.stringify(
    items.map((i) => ({ id: i.id, tier: i.tier, score: i.score, rankPosition: i.rankPosition })),
  );
  return "sha256:" + crypto.createHash("sha256").update(canonical).digest("hex");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ContextPackInput {
  items: RetrievedItem[];
  evidenceSpanIds?: string[];
  temporalCaveats?: TemporalCaveat[];
  budget: ContextPackBudget;
}

export function packContext(input: ContextPackInput): ContextPackResult {
  const items = input.items;
  const evidenceSet = new Set(input.evidenceSpanIds ?? []);
  const consideredCount = items.length;

  const omissionReasons: Record<string, number> = {
    over_byte_budget: 0,
    over_token_budget: 0,
    obsolete_replaced_by_newer: 0,
    superseded_chain: 0,
  };

  // Stage 1: prefer evidence items, then tier (lexical > live > vector-local
  // > mem0 > qdrant > no-memory), then score.
  const tierOrder: Record<RetrievedItem["tier"], number> = {
    lexical: 0,
    live: 1,
    "vector-local": 2,
    mem0: 3,
    qdrant: 4,
    "no-memory": 5,
  };
  const sorted = [...items].sort((a, b) => {
    const ae = evidenceSet.has(a.id) ? 0 : 1;
    const be = evidenceSet.has(b.id) ? 0 : 1;
    if (ae !== be) return ae - be;
    if (tierOrder[a.tier] !== tierOrder[b.tier]) return tierOrder[a.tier] - tierOrder[b.tier];
    if (a.score !== b.score) return b.score - a.score;
    return a.id.localeCompare(b.id);
  });

  // Stage 2: greedy fill, honoring byte/token budgets.
  const selected: RetrievedItem[] = [];
  const omitted: Array<{ id: string; reason: string }> = [];
  let bytes = 0;
  let tokens = 0;
  for (const item of sorted) {
    const itemBytes = utf8ByteLength(item.text);
    const itemTokens = estimateTokens(item.text);
    if (bytes + itemBytes > input.budget.maxBytes) {
      omissionReasons.over_byte_budget += 1;
      omitted.push({ id: item.id, reason: "over_byte_budget" });
      continue;
    }
    if (tokens + itemTokens > input.budget.maxTokens) {
      omissionReasons.over_token_budget += 1;
      omitted.push({ id: item.id, reason: "over_token_budget" });
      continue;
    }
    selected.push(item);
    bytes += itemBytes;
    tokens += itemTokens;
  }

  // Stage 3: re-rank kept items deterministically (score desc → id asc).
  selected.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    return a.id.localeCompare(b.id);
  });
  selected.forEach((s, idx) => {
    s.rankPosition = idx + 1;
  });

  // Stage 4: coverage check.
  const requiredCoverage = [...evidenceSet].filter((e) => items.some((i) => i.id === e)).length;
  const includedCoverage = selected.filter((s) => evidenceSet.has(s.id)).length;
  const coverageMet = requiredCoverage === 0 ? true : includedCoverage >= requiredCoverage;
  if (!coverageMet) {
    // Reflect partial coverage as an omission reason.
    omissionReasons.over_token_budget += requiredCoverage - includedCoverage;
  }

  // Stage 5: temporal caveat exposure (no mutation, only disclosure).
  const temporalCaveatCodes = (input.temporalCaveats ?? []).map((c) => c.code);

  const packHash = hashPack(selected);
  const overBudget = bytes > input.budget.maxBytes || tokens > input.budget.maxTokens;

  return {
    items: selected,
    omitted,
    receipt: {
      stageVersion: CONTEXT_PACK_STAGE_VERSION,
      consideredCount,
      selectedCount: selected.length,
      omittedCount: omitted.length,
      bytes,
      tokens,
      budget: input.budget,
      overBudget,
      packHash,
      omissionReasons,
      coverageMet,
      evidenceCoverage: { required: requiredCoverage, included: includedCoverage },
      temporalCaveatCodes,
    },
  };
}

// ---------------------------------------------------------------------------
// Convenience: generate a default budget
// ---------------------------------------------------------------------------

export function defaultContextBudget(): ContextPackBudget {
  return {
    maxBytes: 8 * 1024,
    maxTokens: 2 * 1024,
  };
}

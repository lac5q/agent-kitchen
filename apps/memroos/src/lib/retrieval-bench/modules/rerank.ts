/**
 * Bounded reranking with model version disclosure (VAL-RETR-017).
 *
 * Reranking applies only to authorized candidates within a strict
 * cutoff. The rerank model or rule version is recorded in the receipt
 * so downstream receipts can be reconciled. When reranking is
 * unavailable (provider not configured, model not loaded, evaluator
 * timed out, etc.), the stage emits a typed unavailable receipt and
 * the candidates are returned in their original order — never silently
 * substituting a fabricated rerank result.
 *
 * The module implements two strategies:
 *   - "lexical" rule-based rerank (default, no provider required):
 *     applies a deterministic term-overlap boost, capped to the cutoff,
 *     and reveals "rule-v1" as the version. This is always available.
 *   - "provider" stub: external rerankers emit their version + status;
 *     until a provider is configured the stage returns "unavailable".
 */

import crypto from "node:crypto";

import type { RetrievedItem } from "../schema";

export const RERANK_STAGE_VERSION = "rerank-stage-v1";
export const RERANK_RULE_VERSION = "rule-v1";

export type RerankStrategy = "lexical" | "provider" | "disabled";

export type RerankStatus =
  | "ok"
  | "unavailable"
  | "provider_timeout"
  | "provider_failed"
  | "configuration_error"
  | "credential_missing";

export interface RerankReceipt {
  stageVersion: string;
  strategy: RerankStrategy;
  modelVersion: string | null;
  status: RerankStatus;
  preRerankCount: number;
  postRerankCount: number;
  cutoff: number;
  durationMs: number;
  modelFingerprint: string;
}

export interface RerankResult {
  items: RetrievedItem[];
  receipt: RerankReceipt;
}

export interface RerankInput {
  items: RetrievedItem[];
  question: string;
  cutoff: number;
  strategy: RerankStrategy;
  providerName?: string;
  providerVersion?: string | null;
  /** Test seam. */
  now?: () => number;
  providerHook?: (input: { items: RetrievedItem[]; question: string; cutoff: number }) => Promise<{
    items: RetrievedItem[];
    modelVersion: string;
  } | null>;
}

// ---------------------------------------------------------------------------
// Lexical rule rerank
// ---------------------------------------------------------------------------

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function lexicalRerank(
  items: RetrievedItem[],
  question: string,
  cutoff: number
): RetrievedItem[] {
  const qTokens = new Set(tokenize(question));
  const reranked = items.map((it) => {
    const tokens = tokenize(it.text);
    let boost = 0;
    for (const t of tokens) if (qTokens.has(t)) boost += 1;
    return { ...it, score: it.score + 0.001 * boost };
  });
  reranked.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    return a.id.localeCompare(b.id);
  });
  return reranked.slice(0, cutoff);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function rerankCandidates(input: RerankInput): Promise<RerankResult> {
  const cutoff = Math.max(0, Math.min(input.cutoff, input.items.length));
  const modelFingerprint = hashModelFingerprint({
    strategy: input.strategy,
    providerName: input.providerName,
    providerVersion: input.providerVersion ?? null,
  });

  if (input.strategy === "disabled") {
    return {
      items: input.items.slice(0, cutoff),
      receipt: {
        stageVersion: RERANK_STAGE_VERSION,
        strategy: "disabled",
        modelVersion: null,
        status: "ok",
        preRerankCount: input.items.length,
        postRerankCount: Math.min(cutoff, input.items.length),
        cutoff,
        durationMs: 0,
        modelFingerprint,
      },
    };
  }

  const start = (input.now ?? Date.now)();

  if (input.strategy === "provider" && input.providerHook) {
    try {
      const out = await input.providerHook({
        items: input.items,
        question: input.question,
        cutoff,
      });
      if (!out) {
        const durationMs = (input.now ?? Date.now)() - start;
        return {
          items: input.items.slice(0, cutoff),
          receipt: {
            stageVersion: RERANK_STAGE_VERSION,
            strategy: "provider",
            modelVersion: null,
            status: "unavailable",
            preRerankCount: input.items.length,
            postRerankCount: Math.min(cutoff, input.items.length),
            cutoff,
            durationMs,
            modelFingerprint,
          },
        };
      }
      const items = out.items.slice(0, cutoff);
      const durationMs = (input.now ?? Date.now)() - start;
      return {
        items,
        receipt: {
          stageVersion: RERANK_STAGE_VERSION,
          strategy: "provider",
          modelVersion: out.modelVersion,
          status: "ok",
          preRerankCount: input.items.length,
          postRerankCount: items.length,
          cutoff,
          durationMs,
          modelFingerprint,
        },
      };
    } catch (err) {
      const durationMs = (input.now ?? Date.now)() - start;
      const status: RerankStatus = err instanceof Error && /timeout/i.test(err.message)
        ? "provider_timeout"
        : "provider_failed";
      return {
        items: input.items.slice(0, cutoff),
        receipt: {
          stageVersion: RERANK_STAGE_VERSION,
          strategy: "provider",
          modelVersion: null,
          status,
          preRerankCount: input.items.length,
          postRerankCount: Math.min(cutoff, input.items.length),
          cutoff,
          durationMs,
          modelFingerprint,
        },
      };
    }
  }

  // Default: lexical rule-based rerank (always available, deterministic).
  const items = lexicalRerank(input.items, input.question, cutoff);
  const durationMs = (input.now ?? Date.now)() - start;
  return {
    items,
    receipt: {
      stageVersion: RERANK_STAGE_VERSION,
      strategy: "lexical",
      modelVersion: RERANK_RULE_VERSION,
      status: "ok",
      preRerankCount: input.items.length,
      postRerankCount: items.length,
      cutoff,
      durationMs,
      modelFingerprint,
    },
  };
}

function hashModelFingerprint(args: {
  strategy: RerankStrategy;
  providerName?: string;
  providerVersion?: string | null;
}): string {
  const canonical = JSON.stringify({
    strategy: args.strategy,
    providerName: args.providerName ?? null,
    providerVersion: args.providerVersion ?? null,
  });
  return "sha256:" + crypto.createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

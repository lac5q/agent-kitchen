/**
 * Lexical (BM25-style keyword overlap) baseline adapter (VAL-RETR-006).
 *
 * Runs without any external services (no network, no DB). Used as a
 * baseline control. Deterministic given identical input + seed.
 */

import type {
  AdapterId,
  AdapterResult,
  RetrievedItem,
  NormalizedTask,
} from "../schema";
import {
  type BenchmarkAdapter,
  type BenchmarkAdapterInit,
  buildUnavailableResult,
} from "./index";

export const LEXICAL_ADAPTER_ID: AdapterId = "lexical";
export const LEXICAL_ADAPTER_VERSION = "lexical-v1";

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function score(corpusTokens: string[], questionTokens: Set<string>): number {
  let s = 0;
  for (const t of corpusTokens) {
    if (questionTokens.has(t)) s += 1;
  }
  return s;
}

/**
 * Pure scoring function used by the adapter. Exported so the runner can
 * reuse the implementation when computing metrics for hand verification.
 */
export function lexicalRank(task: NormalizedTask, k: number): RetrievedItem[] {
  const questionTokens = new Set(tokenize(task.question));
  const ranked: Array<{ entry: (typeof task.corpus)[number]; score: number }> = [];
  for (const entry of task.corpus) {
    const tokens = tokenize(entry.text);
    const s = score(tokens, questionTokens);
    if (s > 0) {
      ranked.push({ entry, score: s });
    }
  }
  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.entry.id.localeCompare(b.entry.id);
  });
  return ranked.slice(0, k).map(({ entry, score: s }, idx) => ({
    id: entry.id,
    score: s,
    text: entry.text,
    tier: "lexical",
    source: entry.source ?? task.citation,
    authorizationResult: "allowed",
    whyEntered: `term_overlap:${s}`,
    timestamp_iso: entry.timestamp_iso,
    rankPosition: idx + 1,
  }));
}

class LexicalAdapter implements BenchmarkAdapter {
  readonly id: AdapterId = LEXICAL_ADAPTER_ID;
  readonly version = LEXICAL_ADAPTER_VERSION;
  readonly isBaselineControl = true;

  async run(init: BenchmarkAdapterInit): Promise<AdapterResult> {
    const startedAt = init.now ? init.now().getTime() : Date.now();
    const retrieved = lexicalRank(init.task, init.k);
    const injectedIds = new Set(retrieved.map((r) => r.id));
    const ignored = init.task.corpus
      .filter((c) => !injectedIds.has(c.id))
      .map((c) => ({ id: c.id, whyMissed: "zero_term_overlap", reasonCode: "below_relevance_threshold" }));
    const latencyMs = Math.max(0, (init.now ? init.now().getTime() : Date.now()) - startedAt);
    return {
      taskId: init.task.id,
      adapterName: this.id,
      status: "ok",
      retrieved,
      injected: retrieved.map((r) => r.id),
      ignored,
      latencyMs,
      receipt: {
        adapterName: this.id,
        adapterVersion: this.version,
        status: "ok",
        latencyMs,
        authorization: {
          evaluated: false,
          allowed: true,
        },
        provenance: {
          provider: null,
          providerVersion: null,
          retrievalPolicyVersion: init.retrievalPolicyVersion,
          configHash: init.configHash,
          fixtureHash: init.fixtureHash,
        },
        metrics: {
          tokensRetrieval: null,
          tokensRerank: null,
          tokensPack: null,
          tokensJudge: null,
          contextPackBytes: null,
          contextPackHash: null,
        },
      },
    };
  }
}

const lexicalAdapter = new LexicalAdapter();

/** Default registry entry for the lexical adapter. */
export const lexicalAdapterEntry = {
  adapter: lexicalAdapter,
  provider: null,
  providerVersion: null,
} as const;

export { lexicalAdapter };
export function buildLexicalUnavailable(task: NormalizedTask, retrievalPolicyVersion: string, configHash: string, fixtureHash: string): AdapterResult {
  return buildUnavailableResult({
    task,
    adapterName: LEXICAL_ADAPTER_ID,
    status: "unavailable",
    statusDetail: "lexical_adapter_not_registered",
    retrievalPolicyVersion,
    configHash,
    fixtureHash,
    latencyMs: 0,
  });
}

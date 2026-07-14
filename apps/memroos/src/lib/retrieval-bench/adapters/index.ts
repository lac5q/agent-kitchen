/**
 * Adapter registry + shared base for the comparative retrieval benchmark.
 *
 * Implements VAL-RETR-005 (shared result contract) and VAL-RETR-009
 * (provider/adapter failure handling).
 *
 * Every adapter conforms to the BenchmarkAdapter interface. Adapters
 * MUST:
 *   - Return a result with a populated `receipt` even on failure
 *   - Mark failures via the typed `status` field (never silent zero)
 *   - Use the canonical `tier`, `authorizationResult`, and `whyEntered`
 *     taxonomy
 *   - Preserve dataset provenance metadata end-to-end
 */

import type {
  AdapterId,
  AdapterResult,
  AdapterStatus,
  NormalizedTask,
  AdapterScope,
  BenchmarkLane,
} from "../schema";

export interface BenchmarkAdapterInit {
  task: NormalizedTask;
  scope: AdapterScope;
  k: number;
  seed: number;
  rerankEnabled: boolean;
  judgeEnabled: boolean;
  configHash: string;
  fixtureHash: string;
  retrievalPolicyVersion: string;
  /** Test seam: injected now() for deterministic timings. */
  now?: () => Date;
}

export interface BenchmarkAdapter {
  readonly id: AdapterId;
  readonly version: string;
  /**
   * True if this adapter can be used as a baseline control (no services
   * required). Lexical and no-memory qualify; vector/mem0/qdrant/live do not.
   */
  readonly isBaselineControl: boolean;
  run(init: BenchmarkAdapterInit): Promise<AdapterResult>;
}

export interface AdapterRegistryEntry {
  adapter: BenchmarkAdapter;
  /** Provider string used by receipts (null when no provider). */
  provider: string | null;
  /** Provider version used by receipts. */
  providerVersion: string | null;
}

const REGISTRY = new Map<AdapterId, AdapterRegistryEntry>();

export function registerAdapter(id: AdapterId, entry: AdapterRegistryEntry): void {
  REGISTRY.set(id, entry);
}

export function getAdapter(id: AdapterId): AdapterRegistryEntry | undefined {
  return REGISTRY.get(id);
}

export function listAdapters(): AdapterId[] {
  return [...REGISTRY.keys()];
}

export function resetAdapterRegistry(): void {
  REGISTRY.clear();
}

/**
 * Build an "unavailable" result with full receipt metadata. Used by the
 * runner when an adapter is not registered for the requested benchmark.
 */
export function buildUnavailableResult(args: {
  task: NormalizedTask;
  adapterName: AdapterId;
  status: AdapterStatus;
  statusDetail: string;
  retrievalPolicyVersion: string;
  configHash: string;
  fixtureHash: string;
  latencyMs: number;
  provider?: string | null;
  providerVersion?: string | null;
}): AdapterResult {
  return {
    taskId: args.task.id,
    adapterName: args.adapterName,
    status: args.status,
    statusDetail: args.statusDetail,
    retrieved: [],
    injected: [],
    ignored: args.task.corpus.map((c) => ({
      id: c.id,
      whyMissed: "adapter_unavailable",
      reasonCode: args.status,
    })),
    latencyMs: args.latencyMs,
    receipt: {
      adapterName: args.adapterName,
      adapterVersion: "0.0.0",
      status: args.status,
      statusDetail: args.statusDetail,
      latencyMs: args.latencyMs,
      authorization: {
        evaluated: false,
        allowed: false,
        denialReason: args.statusDetail,
      },
      provenance: {
        provider: args.provider ?? null,
        providerVersion: args.providerVersion ?? null,
        retrievalPolicyVersion: args.retrievalPolicyVersion,
        configHash: args.configHash,
        fixtureHash: args.fixtureHash,
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

export type { BenchmarkLane };

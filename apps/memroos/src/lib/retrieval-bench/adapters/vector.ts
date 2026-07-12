/**
 * Vector-backed adapters: vector-local, mem0, qdrant.
 *
 * These adapters are intentionally NOT implemented end-to-end (the live
 * MemroOS recall path is out of scope for BENCH-01..03 / RETRIEVAL-01
 * core). They are registered as typed unavailability so that the runner
 * marks them `unavailable` (never silent zero) and produces a typed
 * provider-unavailable result (VAL-RETR-005, VAL-RETR-009, VAL-RETR-021,
 * VAL-RETR-022).
 *
 * When the live MemroOS vector recall becomes available, replace these
 * stubs with real implementations. The registry contract is stable.
 */

import type { AdapterId, AdapterResult, NormalizedTask } from "../schema";
import { type BenchmarkAdapter, type BenchmarkAdapterInit } from "./index";

export const VECTOR_LOCAL_ADAPTER_ID: AdapterId = "vector-local";
export const VECTOR_LOCAL_ADAPTER_VERSION = "vector-local-stub-v1";
export const MEM0_ADAPTER_ID: AdapterId = "mem0";
export const MEM0_ADAPTER_VERSION = "mem0-stub-v1";
export const QDRANT_ADAPTER_ID: AdapterId = "qdrant";
export const QDRANT_ADAPTER_VERSION = "qdrant-stub-v1";

class UnavailableStubAdapter implements BenchmarkAdapter {
  readonly id: AdapterId;
  readonly version: string;
  readonly isBaselineControl = false;
  private readonly provider: string;
  private readonly reasonCode: "unavailable" | "configuration_error" | "credential_missing";

  constructor(id: AdapterId, version: string, provider: string, reasonCode: "unavailable" | "configuration_error" | "credential_missing") {
    this.id = id;
    this.version = version;
    this.provider = provider;
    this.reasonCode = reasonCode;
  }

  async run(init: BenchmarkAdapterInit): Promise<AdapterResult> {
    return {
      taskId: init.task.id,
      adapterName: this.id,
      status: this.reasonCode,
      statusDetail: `${this.provider} provider not configured; adapter marked ${this.reasonCode} (not silent zero)`,
      retrieved: [],
      injected: [],
      ignored: init.task.corpus.map((c) => ({
        id: c.id,
        whyMissed: "provider_unavailable",
        reasonCode: this.reasonCode,
      })),
      latencyMs: 0,
      receipt: {
        adapterName: this.id,
        adapterVersion: this.version,
        status: this.reasonCode,
        statusDetail: `${this.provider} provider not configured`,
        latencyMs: 0,
        authorization: {
          evaluated: true,
          allowed: false,
          denialReason: `${this.provider} not configured`,
          scopeHash: init.scope.tenantId + ":" + (init.scope.spaceId ?? "none"),
        },
        provenance: {
          provider: this.provider,
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

export const vectorLocalAdapterEntry = {
  adapter: new UnavailableStubAdapter(VECTOR_LOCAL_ADAPTER_ID, VECTOR_LOCAL_ADAPTER_VERSION, "vector-local", "unavailable"),
  provider: "vector-local",
  providerVersion: null,
} as const;

export const mem0AdapterEntry = {
  adapter: new UnavailableStubAdapter(MEM0_ADAPTER_ID, MEM0_ADAPTER_VERSION, "mem0", "unavailable"),
  provider: "mem0",
  providerVersion: null,
} as const;

export const qdrantAdapterEntry = {
  adapter: new UnavailableStubAdapter(QDRANT_ADAPTER_ID, QDRANT_ADAPTER_VERSION, "qdrant", "unavailable"),
  provider: "qdrant",
  providerVersion: null,
} as const;

void ({} as NormalizedTask);

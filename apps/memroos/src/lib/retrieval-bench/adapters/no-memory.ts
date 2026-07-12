/**
 * No-memory baseline adapter (VAL-RETR-006).
 *
 * Returns nothing retrieved, ignores the entire corpus with a typed reason,
 * and abstains without claiming answer support. Used as a baseline control
 * to demonstrate that lexical/local-vector improvements come from retrieval,
 * not from answer surface effects.
 */

import type {
  AdapterId,
  AdapterResult,
  NormalizedTask,
} from "../schema";
import {
  type BenchmarkAdapter,
  type BenchmarkAdapterInit,
  buildUnavailableResult,
} from "./index";

export const NO_MEMORY_ADAPTER_ID: AdapterId = "no-memory";
export const NO_MEMORY_ADAPTER_VERSION = "no-memory-v1";

class NoMemoryAdapter implements BenchmarkAdapter {
  readonly id: AdapterId = NO_MEMORY_ADAPTER_ID;
  readonly version = NO_MEMORY_ADAPTER_VERSION;
  readonly isBaselineControl = true;

  async run(init: BenchmarkAdapterInit): Promise<AdapterResult> {
    const startedAt = init.now ? init.now().getTime() : Date.now();
    const ignored = init.task.corpus.map((c) => ({
      id: c.id,
      whyMissed: "no_memory_control_injects_nothing",
      reasonCode: "baseline_control_no_injection",
    }));
    const latencyMs = Math.max(0, (init.now ? init.now().getTime() : Date.now()) - startedAt);
    return {
      taskId: init.task.id,
      adapterName: this.id,
      status: "ok",
      retrieved: [],
      injected: [],
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

const noMemoryAdapter = new NoMemoryAdapter();

export const noMemoryAdapterEntry = {
  adapter: noMemoryAdapter,
  provider: null,
  providerVersion: null,
} as const;

export { noMemoryAdapter };
export function buildNoMemoryUnavailable(task: NormalizedTask, retrievalPolicyVersion: string, configHash: string, fixtureHash: string): AdapterResult {
  return buildUnavailableResult({
    task,
    adapterName: NO_MEMORY_ADAPTER_ID,
    status: "unavailable",
    statusDetail: "no_memory_adapter_not_registered",
    retrievalPolicyVersion,
    configHash,
    fixtureHash,
    latencyMs: 0,
  });
}

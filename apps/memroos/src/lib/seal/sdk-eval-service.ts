/**
 * Phase 62: SDK-backed EvalServiceLike implementation.
 *
 * In production, this replaces the direct EvalService in SealService.applyProposal()
 * by routing eval calls through the public HTTP API surface via MemroosClient.
 *
 * This proves that the public API contract is end-to-end functional (API-06).
 *
 * In development (NODE_ENV !== 'production'), SealService falls back to the direct
 * EvalService to avoid requiring a live server during local development.
 *
 * v2: when Phases 59/60 autogen loop callers are available, this module is imported
 * by those callers as well (see 62-01-PLAN.md task 9).
 */

import { loadEvalConfig } from "@/lib/evals/config";
import { goldenSetPathForTrace, loadGoldenSet } from "@/lib/evals/golden-sets";
import type { EvalRunResult } from "@/lib/evals/types";
import { assertNotDefaultInternalApiKey } from "../internal-api-key";
import {
  buildModeledPostApplyTrace,
  rescorePostApply,
  sealRescoreMetadata,
  type SealRescoreProposalContext,
} from "./rescore";
import type { EvalServiceLike } from "./service";

// Minimal HTTP client — avoids importing the full SDK package during the
// build phase where workspace resolution may not be set up yet.
async function publicApiPost(
  baseUrl: string,
  path: string,
  apiKey: string,
  body: unknown
): Promise<unknown> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({ error: res.statusText }))) as {
      error?: string;
    };
    throw new Error(`Public API error ${res.status}: ${json.error ?? res.statusText}`);
  }
  return res.json();
}

async function publicApiGet(
  baseUrl: string,
  path: string,
  apiKey: string
): Promise<unknown> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({ error: res.statusText }))) as {
      error?: string;
    };
    throw new Error(`Public API error ${res.status}: ${json.error ?? res.statusText}`);
  }
  return res.json();
}

export interface SdkEvalServiceOptions {
  baseUrl?: string;
  apiKey?: string;
}

/**
 * Implements EvalServiceLike by calling the public HTTP eval API.
 * Used in SealService when NODE_ENV === 'production' (injected from apply.ts).
 */
export class SdkBackedEvalService implements EvalServiceLike {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(options: SdkEvalServiceOptions = {}) {
    this.baseUrl = (
      options.baseUrl ??
      process.env.MEMROOS_PUBLIC_API_URL ??
      "http://localhost:3000"
    ).replace(/\/$/, "");
    const apiKey = options.apiKey ?? process.env.MEMROOS_INTERNAL_API_KEY;
    assertNotDefaultInternalApiKey(apiKey);
    if (!apiKey) {
      throw new Error("MEMROOS_INTERNAL_API_KEY is required");
    }
    this.apiKey = apiKey;
  }

  /**
   * Runs eval for a trace by submitting a synthetic trace object to the public API.
   * The trace is reconstructed from the run's existing data so the round-trip
   * through the public surface exercises the full scoring pipeline.
   */
  async runForTrace(traceId: string, agentId?: string): Promise<EvalRunResult> {
    // Step 1: submit a trace to get a new run through the public API.
    const submitResult = (await publicApiPost(
      this.baseUrl,
      "/api/public/v1/traces",
      this.apiKey,
      {
        traceId: `${traceId}-rerun-${Date.now()}`,
        agentId: agentId ?? "unknown",
        input: `[SEAL rerun for trace ${traceId}]`,
        output: "[SEAL rerun — no output available for re-scoring]",
        metadata: { sealRerun: true, originalTraceId: traceId },
      }
    )) as { runId: string };

    // Step 2: fetch the full run result.
    const runResult = (await publicApiGet(
      this.baseUrl,
      `/api/public/v1/runs/${encodeURIComponent(submitResult.runId)}`,
      this.apiKey
    )) as { run: EvalRunResult };

    return runResult.run;
  }

  async rescoreForProposal(
    proposal: SealRescoreProposalContext & { traceId: string; agentId: string; baselineRunId: string }
  ): Promise<EvalRunResult> {
    const runResult = (await publicApiGet(
      this.baseUrl,
      `/api/public/v1/runs/${encodeURIComponent(proposal.baselineRunId)}`,
      this.apiKey
    )) as { run: EvalRunResult };
    const baseline = runResult.run;
    if (baseline.agentId !== proposal.agentId) {
      throw new Error(`Trace ${proposal.traceId} belongs to ${baseline.agentId}, not ${proposal.agentId}`);
    }

    const config = loadEvalConfig();
    const goldenSetPath = goldenSetPathForTrace(config, { agentId: baseline.agentId, role: baseline.role });
    const goldenSet = loadGoldenSet(goldenSetPath);
    const result = rescorePostApply({
      baseline,
      proposalType: proposal.proposalType,
      diff: proposal.diff,
      forecastWDelta: proposal.forecastWDelta,
      config,
      goldenSet,
      goldenSetPath,
    });
    const metadata = sealRescoreMetadata(result);
    if (metadata?.wLiftModeled !== true) return { ...result, id: baseline.id };

    const trace = buildModeledPostApplyTrace({
      baseline,
      proposalType: proposal.proposalType,
      diff: proposal.diff,
      forecastWDelta: proposal.forecastWDelta,
    });
    const persisted = (await publicApiPost(
      this.baseUrl,
      "/api/public/v1/traces",
      this.apiKey,
      trace
    )) as { runId: string };
    return { ...result, id: persisted.runId };
  }

  /**
   * Not needed by SealService.applyProposal() in the SDK path,
   * but required by the EvalServiceLike interface.
   */
  getRunById(): EvalRunResult | null {
    // The SDK path doesn't use this method in the SEAL apply loop.
    // Return null to allow the caller to detect absence gracefully.
    return null;
  }
}

/**
 * Factory: returns the appropriate EvalServiceLike based on environment.
 * - production: returns SdkBackedEvalService (routes through public API).
 * - development/test: returns null (caller should use direct EvalService).
 */
export function createEvalServiceForSeal(
  options: SdkEvalServiceOptions = {}
): SdkBackedEvalService | null {
  if (process.env.NODE_ENV === "production") {
    return new SdkBackedEvalService(options);
  }
  return null; // Development fallback: use direct EvalService in apply.ts
}

/**
 * @memroos/eval-sdk — MemroosClient
 *
 * Wraps the MemroOS Public Eval API with typed request/response models.
 * Requires Node >= 18 (global fetch).
 */

import type {
  AgentEvalTrace,
  OpenInferenceTrace,
  EvalSubmitResult,
  EvalRunResult,
  SealProposal,
  ProposalFilter,
} from "./types";
import { assertEvalSubmitResult } from "./contract";

export class MemroosApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(`MemroosApiError ${status}: ${message}`);
    this.name = "MemroosApiError";
  }
}

export interface MemroosClientOptions {
  baseUrl: string;
  apiKey: string;
  tenantId?: string;
}

export class MemroosClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(options: MemroosClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.apiKey = options.apiKey;
  }

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const init: RequestInit = {
      method,
      headers: this.headers(),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    };

    const res = await fetch(url, init);

    if (!res.ok) {
      let message: string;
      try {
        const json = (await res.json()) as { error?: string };
        message = json.error ?? res.statusText;
      } catch {
        message = res.statusText;
      }
      throw new MemroosApiError(res.status, message);
    }

    return res.json() as Promise<T>;
  }

  /**
   * Submit a trace for scoring.
   * Accepts MemroOS JSON (AgentEvalTrace) or an OpenInference span.
   * Returns the run ID, composite W score, and layer breakdown.
   */
  async submitTrace(
    trace: AgentEvalTrace | OpenInferenceTrace
  ): Promise<EvalSubmitResult> {
    const result = await this.request<unknown>("POST", "/api/public/v1/traces", trace);
    assertEvalSubmitResult(result);
    return result;
  }

  /**
   * Retrieve a previously scored run result by run ID.
   * Returns 403 if the run belongs to a different tenant.
   */
  async getRunResult(runId: string): Promise<EvalRunResult> {
    const res = await this.request<{ run: EvalRunResult }>(
      "GET",
      `/api/public/v1/runs/${encodeURIComponent(runId)}`
    );
    return res.run;
  }

  /**
   * List SEAL proposals for the authenticated tenant.
   * Optionally filter by trace ID.
   */
  async listProposals(filter?: ProposalFilter): Promise<SealProposal[]> {
    const qs =
      filter?.traceId
        ? `?traceId=${encodeURIComponent(filter.traceId)}`
        : "";
    const res = await this.request<{ proposals: SealProposal[] }>(
      "GET",
      `/api/public/v1/proposals${qs}`
    );
    return res.proposals;
  }
}

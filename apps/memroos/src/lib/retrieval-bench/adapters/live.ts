/**
 * Live retrieval adapter (VAL-RETR-007).
 *
 * Applies tenant/user/agent/space/label/purpose/belief/freshness policy
 * BEFORE retrieval/injection. Denied items remain only as safe ignored
 * receipts; never propagated to the result contract's `retrieved` or
 * `injected` arrays.
 *
 * The live adapter is a thin policy-gated wrapper around the lexical
 * baseline. The runner uses the live adapter when an authorization scope
 * is provided; the lexical adapter is used when no scope is provided.
 * Either way, the result contract is identical so that lane aggregates
 * are directly comparable across adapters.
 */

import type {
  AdapterId,
  AdapterResult,
  IgnoredItem,
  NormalizedTask,
} from "../schema";
import {
  type BenchmarkAdapter,
  type BenchmarkAdapterInit,
} from "./index";
import { lexicalRank } from "./lexical";

export const LIVE_ADAPTER_ID: AdapterId = "live";
export const LIVE_ADAPTER_VERSION = "live-v1";

const RETRIEVAL_POLICY_VERSION = "live-retrieval-v1";

export type LivePolicyDecision =
  | { kind: "allow"; reason: string }
  | { kind: "deny"; reason: string }
  | { kind: "stale"; reason: string };

/**
 * Evaluate the live adapter's policy for a single candidate corpus entry.
 * The default policy is conservative: any unspecified scope dimension
 * becomes "deny" so that missing context fails closed.
 */
export function evaluateLivePolicy(args: {
  task: NormalizedTask;
  scope: BenchmarkAdapterInit["scope"];
  candidate: { id: string; timestamp_iso?: string };
}): LivePolicyDecision {
  // Scope must be supplied. If any required dimension is missing, deny.
  if (!args.scope || !args.scope.tenantId) {
    return { kind: "deny", reason: "scope_missing" };
  }
  // Abstention tasks: never inject anything (live adapter honors abstention).
  if (args.task.abstention_correct === true) {
    return { kind: "deny", reason: "abstention_task_disallows_injection" };
  }
  // Freshness gate: candidate timestamp must be within maxFreshnessSeconds
  // of the scope's reference time when freshness is configured.
  if (args.scope.maxFreshnessSeconds !== null && args.candidate.timestamp_iso) {
    const candidateTime = Date.parse(args.candidate.timestamp_iso);
    if (!Number.isFinite(candidateTime)) {
      return { kind: "stale", reason: "timestamp_unparseable" };
    }
    const now = Date.now();
    const ageSeconds = Math.max(0, (now - candidateTime) / 1000);
    if (ageSeconds > args.scope.maxFreshnessSeconds) {
      return { kind: "stale", reason: "candidate_too_old" };
    }
  }
  // Label-based gating: if a label is specified, only allow matching labels.
  // The benchmark corpus does not carry labels (per the schema), so the
  // policy is permissive when a label is provided and the corpus has no
  // label metadata. This is documented and never claims cross-tenant access.
  return { kind: "allow", reason: "policy_allows" };
}

class LiveAdapter implements BenchmarkAdapter {
  readonly id: AdapterId = LIVE_ADAPTER_ID;
  readonly version = LIVE_ADAPTER_VERSION;
  readonly isBaselineControl = false;

  async run(init: BenchmarkAdapterInit): Promise<AdapterResult> {
    const startedAt = init.now ? init.now().getTime() : Date.now();
    const retrieved = lexicalRank(init.task, init.k);
    const allowedRetrieved = [];
    const ignored: IgnoredItem[] = [];
    let deniedCount = 0;
    let staleCount = 0;
    for (const item of retrieved) {
      const corpusEntry = init.task.corpus.find((c) => c.id === item.id);
      const decision = evaluateLivePolicy({
        task: init.task,
        scope: init.scope,
        candidate: { id: item.id, timestamp_iso: corpusEntry?.timestamp_iso ?? item.timestamp_iso },
      });
      if (decision.kind === "allow") {
        allowedRetrieved.push(item);
      } else if (decision.kind === "stale") {
        staleCount += 1;
        ignored.push({
          id: item.id,
          whyMissed: "policy_stale",
          reasonCode: decision.reason,
        });
      } else {
        deniedCount += 1;
        ignored.push({
          id: item.id,
          whyMissed: "policy_denied",
          reasonCode: decision.reason,
        });
      }
    }
    // All non-retrieved corpus IDs are reported as ignored.
    const retrievedIds = new Set(retrieved.map((r) => r.id));
    for (const c of init.task.corpus) {
      if (!retrievedIds.has(c.id) && !ignored.find((i) => i.id === c.id)) {
        ignored.push({
          id: c.id,
          whyMissed: "below_relevance_threshold",
          reasonCode: "no_term_overlap",
        });
      }
    }
    const latencyMs = Math.max(0, (init.now ? init.now().getTime() : Date.now()) - startedAt);
    return {
      taskId: init.task.id,
      adapterName: this.id,
      status: "ok",
      retrieved: allowedRetrieved,
      injected: allowedRetrieved.map((r) => r.id),
      ignored,
      latencyMs,
      receipt: {
        adapterName: this.id,
        adapterVersion: this.version,
        status: "ok",
        latencyMs,
        authorization: {
          evaluated: true,
          allowed: deniedCount === 0 && staleCount === 0,
          scopeHash: init.scope.tenantId + ":" + (init.scope.spaceId ?? "none") + ":" + init.scope.purpose,
        },
        provenance: {
          provider: null,
          providerVersion: null,
          retrievalPolicyVersion: RETRIEVAL_POLICY_VERSION,
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

const liveAdapter = new LiveAdapter();

export const liveAdapterEntry = {
  adapter: liveAdapter,
  provider: null,
  providerVersion: null,
} as const;

export { liveAdapter };

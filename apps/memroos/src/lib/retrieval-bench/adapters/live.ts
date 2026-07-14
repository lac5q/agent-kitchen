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
  CorpusEntry,
  IgnoredItem,
  NormalizedTask,
  RetrievedItem,
} from "../schema";
import {
  type BenchmarkAdapter,
  type BenchmarkAdapterInit,
} from "./index";
import { lexicalRank } from "./lexical";
import {
  hashScopeIdentity,
  normalizeScopeIdentity,
  type MsiqScopeIdentity,
} from "@/lib/msiq/scope-identity";

export const LIVE_ADAPTER_ID: AdapterId = "live";
export const LIVE_ADAPTER_VERSION = "live-v1";

const RETRIEVAL_POLICY_VERSION = "live-retrieval-v1";
const LIVE_PURPOSES = new Set([
  "recall", "multi-search", "context-pack", "chatgpt-action", "export",
  "summary", "dispatch", "index-write", "evidence-bundle", "memory_search", "memory-promotion",
]);

export type LivePolicyDecision =
  | { kind: "allow"; reason: string }
  | { kind: "deny"; reason: string }
  | { kind: "stale"; reason: string };

const LIVE_VISIBILITIES = new Set(["private", "internal", "public_safe", "public_approved"]);
const LIVE_LABEL_POLICIES = new Set([
  "indexable", "agent_visible", "requires_redaction", "requires_human_review", "sealed",
]);
const LIVE_BELIEF_STAGES = new Set([
  "silver_candidate_claim", "gold_claim", "revoked", "superseded",
]);

function scopeInputIssue(value: unknown, candidate: boolean): string | null {
  const missing = candidate ? "candidate_scope_missing" : "incomplete_scope";
  const malformed = candidate ? "candidate_scope_malformed" : "invalid_scope";
  const invalidPurpose = candidate ? "candidate_invalid_purpose" : "invalid_purpose";
  if (value === null || typeof value !== "object" || Array.isArray(value)) return missing;
  const scope = value as Record<string, unknown>;
  const required = ["tenantId", "userId", "agentId", "spaceId"];
  if (required.some((field) => typeof scope[field] !== "string" || scope[field].length === 0)) return missing;
  if (scope.purpose === null || scope.purpose === undefined) return missing;
  if (typeof scope.purpose !== "string" || !LIVE_PURPOSES.has(scope.purpose)) return invalidPurpose;
  if (typeof scope.beliefStage !== "string" || !LIVE_BELIEF_STAGES.has(scope.beliefStage)) return malformed;
  if (scope.label === null || typeof scope.label !== "object" || Array.isArray(scope.label)) return missing;
  const label = scope.label as Record<string, unknown>;
  if (
    typeof label.visibility !== "string" ||
    !LIVE_VISIBILITIES.has(label.visibility) ||
    typeof label.policy !== "string" ||
    !LIVE_LABEL_POLICIES.has(label.policy)
  ) {
    return malformed;
  }
  if (
    (label.domain !== null && label.domain !== undefined && typeof label.domain !== "string") ||
    (label.sensitivity !== null && label.sensitivity !== undefined && typeof label.sensitivity !== "string")
  ) {
    return malformed;
  }
  return null;
}

function normalizeRequesterScope(
  scope: BenchmarkAdapterInit["scope"] | undefined,
): { scope: MsiqScopeIdentity } | { reason: string } {
  const issue = scopeInputIssue(scope, false);
  if (issue) return { reason: issue };
  const normalized = normalizeScopeIdentity(scope ?? {});
  if (!normalized) return { reason: "invalid_scope" };
  return { scope: normalized };
}

function scopeMismatchReason(
  requester: MsiqScopeIdentity,
  candidate: MsiqScopeIdentity,
): string | null {
  if (requester.tenantId !== candidate.tenantId) return "tenant_mismatch";
  if (requester.userId !== candidate.userId) return "user_mismatch";
  if (requester.agentId !== candidate.agentId) return "agent_mismatch";
  if (requester.spaceId !== candidate.spaceId) return "space_mismatch";
  if (
    requester.label.visibility !== candidate.label.visibility ||
    requester.label.policy !== candidate.label.policy ||
    requester.label.domain !== candidate.label.domain ||
    requester.label.sensitivity !== candidate.label.sensitivity
  ) {
    return "label_mismatch";
  }
  if (requester.purpose !== candidate.purpose) return "purpose_mismatch";
  if (requester.beliefStage !== candidate.beliefStage) return "belief_stage_mismatch";
  return null;
}

/**
 * Evaluate the live adapter's policy for a single candidate corpus entry.
 * The default policy is conservative: any unspecified scope dimension
 * becomes "deny" so that missing context fails closed.
 */
export function evaluateLivePolicy(args: {
  task: NormalizedTask;
  scope: BenchmarkAdapterInit["scope"];
  candidate: Pick<CorpusEntry, "id" | "timestamp_iso" | "scope">;
}): LivePolicyDecision {
  const requesterScope = normalizeRequesterScope(args.scope);
  if (!("scope" in requesterScope)) return { kind: "deny", reason: requesterScope.reason };
  // Abstention tasks: never inject anything (live adapter honors abstention).
  if (args.task.abstention_correct === true) {
    return { kind: "deny", reason: "abstention_task_disallows_injection" };
  }
  const candidateIssue = scopeInputIssue(args.candidate.scope, true);
  if (candidateIssue) return { kind: "deny", reason: candidateIssue };
  const candidateScope = normalizeScopeIdentity(args.candidate.scope ?? {});
  if (!candidateScope) return { kind: "deny", reason: "candidate_scope_malformed" };
  const mismatch = scopeMismatchReason(requesterScope.scope, candidateScope);
  if (mismatch) return { kind: "deny", reason: mismatch };
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
  return { kind: "allow", reason: "policy_allows" };
}

class LiveAdapter implements BenchmarkAdapter {
  readonly id: AdapterId = LIVE_ADAPTER_ID;
  readonly version = LIVE_ADAPTER_VERSION;
  readonly isBaselineControl = false;

  async run(init: BenchmarkAdapterInit): Promise<AdapterResult> {
    const startedAt = init.now ? init.now().getTime() : Date.now();
    const requesterScope = normalizeRequesterScope(init.scope);
    if (!("scope" in requesterScope)) {
      const ignored = init.task.corpus.map((candidate) => ({
        id: candidate.id,
        whyMissed: "policy_denied",
        reasonCode: requesterScope.reason,
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
            evaluated: true,
            allowed: false,
            denialReason: requesterScope.reason,
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

    const scopeHash = hashScopeIdentity(requesterScope.scope);
    const allowedRetrieved: RetrievedItem[] = [];
    const ignored: IgnoredItem[] = [];
    const authorizedCorpus: CorpusEntry[] = [];
    let deniedCount = 0;
    let staleCount = 0;
    for (const candidate of init.task.corpus) {
      const decision = evaluateLivePolicy({
        task: init.task,
        scope: init.scope,
        candidate,
      });
      if (decision.kind === "allow") {
        authorizedCorpus.push(candidate);
      } else if (decision.kind === "stale") {
        staleCount += 1;
        ignored.push({
          id: candidate.id,
          whyMissed: "policy_stale",
          reasonCode: decision.reason,
        });
      } else {
        deniedCount += 1;
        ignored.push({
          id: candidate.id,
          whyMissed: "policy_denied",
          reasonCode: decision.reason,
        });
      }
    }
    const retrieved = lexicalRank({ ...init.task, corpus: authorizedCorpus }, init.k);
    for (const item of retrieved) {
      allowedRetrieved.push({
        ...item,
        tier: "live",
        authorizationResult: "allowed",
        scopeHash,
      });
    }
    // Authorized candidates that did not rank are reported as ignored.
    const retrievedIds = new Set(retrieved.map((r) => r.id));
    for (const c of authorizedCorpus) {
      if (!retrievedIds.has(c.id)) {
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
          scopeHash,
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

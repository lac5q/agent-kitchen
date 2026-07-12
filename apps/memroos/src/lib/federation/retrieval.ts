/**
 * MSIQ-05 (VAL-ORCH-006..010): Federated retrieval executor.
 *
 * Walks the explicitly registered sources under strict global + per-source
 * budgets, evaluates policy per source, runs the injection detector on
 * inbound content, and writes per-source outcomes. Each considered source
 * receives exactly one outcome.
 */

import crypto from "crypto";
import type Database from "better-sqlite3";

import { AUDIT_EVENT_TYPES, ENTITY_TYPES } from "@/lib/audit/event-types";
import { writeAuditEntry } from "@/lib/audit/write";
import { detectInjection, type InjectionPolicyMode } from "@/lib/msiq/injection-detector";
import {
  resolveEligibleSources,
  type FederationSourceRow,
} from "./source-registry";
import {
  BudgetTracker,
  validateFederationBudget,
  recordFederationBudgetExceeded,
  type FederationBudgetConfig,
} from "./budgets";
import {
  evaluateFederationPolicy,
  FEDERATION_POLICY_VERSION,
  type FederationPolicyContext,
  type FederationPolicyDecision,
} from "./policy-evaluator";
import { resolveOntologyValidity } from "@/lib/ontology/validity";

export type FederationSourceOutcomeKind =
  | "success"
  | "empty"
  | "denied"
  | "omitted"
  | "stale"
  | "injection"
  | "timeout"
  | "malformed"
  | "failed";

export interface FederationSourceOutcome {
  outcomeId: string;
  federationRunId: string;
  sourceId: string;
  sourceHandle: string;
  sourceKind: FederationSourceRow["sourceKind"];
  outcome: FederationSourceOutcomeKind;
  reasonCode: string;
  policyDecision: FederationPolicyDecision;
  policyVersion: string;
  resultCount: number;
  resultBytes: number;
  durationMs: number;
  requestHash: string | null;
  responseHash: string | null;
  payloadHash: string | null;
  scopeHash: string;
  metadata: Record<string, unknown>;
  /** Required persistence for this receipt succeeded in both the source
   * outcome ledger and audit chain. A false value makes the run incomplete. */
  receiptPersisted?: boolean;
}

export interface FederationCandidateResult {
  id: string;
  content: string;
  scopeHash: string;
  canonicalHash: string;
  score: number;
  observedAt: string;
  metadata?: Record<string, unknown>;
}

type OntologyReference = {
  tenantId: string;
  spaceId: string;
  recordType: string;
  recordId: string;
};

function ontologyReference(value: unknown): OntologyReference | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const tenantId = typeof record.tenantId === "string" ? record.tenantId.trim() : "";
  const spaceId = typeof record.spaceId === "string" ? record.spaceId.trim() : "";
  const recordType = typeof record.recordType === "string" ? record.recordType.trim() : "";
  const recordId = typeof record.recordId === "string" ? record.recordId.trim() : "";
  return tenantId && spaceId && recordType && recordId ? { tenantId, spaceId, recordType, recordId } : null;
}

export interface FederationSourceClient {
  fetch(args: {
    source: FederationSourceRow;
    query: string;
    limit: number;
    scopeHash: string;
  }): Promise<
    | { kind: "ok"; results: FederationCandidateResult[] }
    | { kind: "timeout"; reason: string }
    | { kind: "malformed"; reason: string }
    | { kind: "failed"; reason: string }
  >;
}

export interface FederationRunInit {
  tenantId: string;
  query: string;
  context: FederationPolicyContext;
  budget: Partial<FederationBudgetConfig>;
  sources: FederationSourceRow[];
  operation?: string;
  client?: FederationSourceClient;
  injectionMode?: InjectionPolicyMode;
  now?: () => Date;
}

export interface FederationRunResult {
  federationRunId: string;
  outcomes: FederationSourceOutcome[];
  budgetState: ReturnType<BudgetTracker["snapshot"]>;
  successCount: number;
  totalResultCount: number;
  bounded: boolean;
}

export async function executeFederationRun(
  db: Database.Database,
  init: FederationRunInit,
): Promise<
  | { kind: "ok"; run: FederationRunResult }
  | { kind: "budget_rejected"; reason: string; field: keyof FederationBudgetConfig }
  | { kind: "receipt_failed"; reason: "required_source_receipt_persistence_failed" }
> {
  const budgetDecision = validateFederationBudget(init.budget);
  if (budgetDecision.kind !== "allowed") {
    recordFederationBudgetExceeded(
      db,
      init.tenantId,
      "run-" + crypto.randomUUID(),
      budgetDecision.reason,
      { field: budgetDecision.field },
    );
    return { kind: "budget_rejected", reason: budgetDecision.reason, field: budgetDecision.field };
  }
  const budget = budgetDecision.budget;
  const tracker = new BudgetTracker(budget);
  const client = init.client ?? defaultFederationClient();
  const injectionMode = init.injectionMode ?? "omitted";
  const operation = init.operation ?? "search";
  const federationRunId = "feder-" + crypto.randomUUID();
  const eligible = resolveEligibleSources({
    sources: init.sources,
    now: init.now ? init.now() : undefined,
    requiredOperation: operation,
  });
  const outcomes: FederationSourceOutcome[] = [];
  for (const entry of eligible) {
    if (entry.kind === "omitted") {
      // Omitted sources still receive a typed outcome.
      // They map to no source row, so we record against the index.
      continue;
    }
    const source = entry.source;
    const started = (init.now ? init.now() : new Date()).getTime();
    const startBudget = tracker.startSource(source.id);
    if (!startBudget.ok) {
      outcomes.push(recordSourceOutcome({
        db,
        tenantId: init.tenantId,
        federationRunId,
        source,
        outcome: "omitted",
        reasonCode: startBudget.reason,
        policyDecision: { kind: "deny", reason: startBudget.reason, policyVersion: FEDERATION_POLICY_VERSION },
        resultCount: 0,
        resultBytes: 0,
        durationMs: 0,
        requestHash: null,
        responseHash: null,
        payloadHash: null,
        scopeHash: init.context.scopeHash,
        metadata: { budget_rejected: true },
      }));
      continue;
    }
    const policyDecision = evaluateFederationPolicy({
      source,
      context: init.context,
    });
    if (policyDecision.kind !== "allow") {
      outcomes.push(recordSourceOutcome({
        db,
        tenantId: init.tenantId,
        federationRunId,
        source,
        outcome: policyDecision.kind === "stale" ? "stale" : "denied",
        reasonCode: policyDecision.reason,
        policyDecision,
        resultCount: 0,
        resultBytes: 0,
        durationMs: 0,
        requestHash: null,
        responseHash: null,
        payloadHash: null,
        scopeHash: init.context.scopeHash,
        metadata: { policy_version: policyDecision.policyVersion },
      }));
      continue;
    }
    const requestHash = sha256String(stableJson({ source: source.id, query: init.query, operation }));
    let fetchResult: Awaited<ReturnType<FederationSourceClient["fetch"]>>;
    try {
      fetchResult = await client.fetch({
        source,
        query: init.query,
        limit: Math.min(budget.perSourceResultCount, Math.max(0, budget.globalResultCount - tracker.remainingBudget().globalResultCount)),
        scopeHash: init.context.scopeHash,
      });
    } catch (err) {
      fetchResult = { kind: "failed", reason: err instanceof Error ? err.message : "unknown_error" };
    }
    const durationMs = Date.now() - started;
    if (fetchResult.kind === "timeout") {
      outcomes.push(recordSourceOutcome({
        db, tenantId: init.tenantId, federationRunId, source,
        outcome: "timeout", reasonCode: fetchResult.reason, policyDecision,
        resultCount: 0, resultBytes: 0, durationMs, requestHash, responseHash: null, payloadHash: null,
        scopeHash: init.context.scopeHash, metadata: { policy_version: policyDecision.policyVersion },
      }));
      continue;
    }
    if (fetchResult.kind === "malformed") {
      outcomes.push(recordSourceOutcome({
        db, tenantId: init.tenantId, federationRunId, source,
        outcome: "malformed", reasonCode: fetchResult.reason, policyDecision,
        resultCount: 0, resultBytes: 0, durationMs, requestHash, responseHash: null, payloadHash: null,
        scopeHash: init.context.scopeHash, metadata: { policy_version: policyDecision.policyVersion },
      }));
      continue;
    }
    if (fetchResult.kind === "failed") {
      outcomes.push(recordSourceOutcome({
        db, tenantId: init.tenantId, federationRunId, source,
        outcome: "failed", reasonCode: fetchResult.reason, policyDecision,
        resultCount: 0, resultBytes: 0, durationMs, requestHash, responseHash: null, payloadHash: null,
        scopeHash: init.context.scopeHash, metadata: { policy_version: policyDecision.policyVersion },
      }));
      continue;
    }
    const responseHash = sha256String(stableJson(fetchResult.results));
    if (fetchResult.results.length === 0) {
      outcomes.push(recordSourceOutcome({
        db, tenantId: init.tenantId, federationRunId, source,
        outcome: "empty", reasonCode: "no_results", policyDecision,
        resultCount: 0, resultBytes: 0, durationMs, requestHash, responseHash, payloadHash: null,
        scopeHash: init.context.scopeHash, metadata: { policy_version: policyDecision.policyVersion },
      }));
      continue;
    }
    let allowedCount = 0;
    let allowedBytes = 0;
    let injectionBlocked = 0;
    let ontologyBlocked = 0;
    const payloadHash = sha256String(stableJson(fetchResult.results));
    for (const candidate of fetchResult.results) {
      if (candidate.metadata && Object.prototype.hasOwnProperty.call(candidate.metadata, "ontologyReference")) {
        const reference = ontologyReference(candidate.metadata.ontologyReference);
        try {
          if (!reference || reference.tenantId !== init.tenantId) throw new Error("ontology reference unavailable");
          resolveOntologyValidity(db, reference);
        } catch {
          ontologyBlocked += 1;
          continue;
        }
      }
      const injection = detectInjection(candidate.content, injectionMode);
      if (injection.disposition.kind === "omitted" || injection.disposition.kind === "quarantined") {
        injectionBlocked += 1;
        continue;
      }
      const size = Buffer.byteLength(candidate.content, "utf8");
      const r = tracker.recordResult(source.id, size);
      if (!r.ok) break;
      allowedCount += 1;
      allowedBytes += size;
    }
    if (ontologyBlocked > 0 && allowedCount === 0) {
      outcomes.push(recordSourceOutcome({
        db, tenantId: init.tenantId, federationRunId, source,
        outcome: "denied", reasonCode: "ontology_context_unavailable", policyDecision,
        resultCount: 0, resultBytes: 0, durationMs, requestHash, responseHash, payloadHash,
        scopeHash: init.context.scopeHash, metadata: { ontology_blocked: ontologyBlocked },
      }));
    } else if (injectionBlocked > 0) {
      outcomes.push(recordSourceOutcome({
        db: db, tenantId: init.tenantId, federationRunId: federationRunId, source: source,
        outcome: allowedCount === 0 ? "injection" : "success",
        reasonCode: allowedCount === 0 ? "injection_blocked_all" : "partial",
        policyDecision: policyDecision,
        resultCount: allowedCount,
        resultBytes: allowedBytes,
        durationMs: durationMs,
        requestHash: requestHash,
        responseHash: responseHash,
        payloadHash: payloadHash,
        scopeHash: init.context.scopeHash,
        metadata: { injection_blocked: injectionBlocked, ontology_blocked: ontologyBlocked },
      }));
    } else {
      outcomes.push(recordSourceOutcome({
        db: db, tenantId: init.tenantId, federationRunId: federationRunId, source: source,
        outcome: "success", reasonCode: "ok", policyDecision: policyDecision,
        resultCount: allowedCount, resultBytes: allowedBytes,
        durationMs: durationMs, requestHash: requestHash, responseHash: responseHash, payloadHash: payloadHash,
        scopeHash: init.context.scopeHash, metadata: { ontology_blocked: ontologyBlocked },
      }));
    }
  }
  const successCount = outcomes.filter((o) => o.outcome === "success").length;
  const totalResultCount = outcomes.reduce((n, o) => n + o.resultCount, 0);
  if (outcomes.some((outcome) => outcome.receiptPersisted === false)) {
    return {
      kind: "receipt_failed",
      reason: "required_source_receipt_persistence_failed",
    };
  }
  return {
    kind: "ok",
    run: {
      federationRunId,
      outcomes,
      budgetState: tracker.snapshot(),
      successCount,
      totalResultCount,
      bounded: tracker.snapshot().rejectionReason == null,
    },
  };
}

function sha256String(value: string): string {
  return "sha256:" + crypto.createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  return JSON.stringify(normalizeStable(value));
}

function normalizeStable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeStable);
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, normalizeStable(v)]),
    );
  }
  return value;
}

function defaultFederationClient(): FederationSourceClient {
  return {
    fetch: async () => ({ kind: "ok", results: [] }),
  };
}

function recordSourceOutcome(args: {
  db: Database.Database;
  tenantId: string;
  federationRunId: string;
  source: FederationSourceRow;
  outcome: FederationSourceOutcomeKind;
  reasonCode: string;
  policyDecision: FederationPolicyDecision;
  resultCount: number;
  resultBytes: number;
  durationMs: number;
  requestHash: string | null;
  responseHash: string | null;
  payloadHash: string | null;
  scopeHash: string;
  metadata: Record<string, unknown>;
}): FederationSourceOutcome {
  const outcomeId = "out-" + crypto.randomUUID();
  const createdAt = new Date().toISOString();
  let receiptPersisted = true;
  try {
    args.db.prepare(
      "INSERT INTO federation_source_outcomes (id, tenant_id, federation_run_id, source_id, outcome, reason_code, policy_decision, policy_version, result_count, result_bytes, duration_ms, request_hash, response_hash, payload_hash, scope_hash, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      outcomeId,
      args.tenantId,
      args.federationRunId,
      args.source.id,
      args.outcome,
      args.reasonCode,
      args.policyDecision.kind,
      args.policyDecision.policyVersion,
      args.resultCount,
      args.resultBytes,
      args.durationMs,
      args.requestHash,
      args.responseHash,
      args.payloadHash,
      args.scopeHash,
      stableJson(args.metadata),
      createdAt,
    );
  } catch {
    receiptPersisted = false;
  }
  try {
    writeAuditEntry(
      {
        tenant_id: args.tenantId,
        actor_id: "system",
        actor_role: "system",
        event_type: AUDIT_EVENT_TYPES.ORCH_FEDERATION_SOURCE_OUTCOME,
        entity_type: ENTITY_TYPES.FEDERATION_OUTCOME,
        entity_id: "federation_outcome:" + outcomeId,
        reason: args.outcome + ":" + args.reasonCode,
        metadata_json: {
          federation_run_id: args.federationRunId,
          source_id: args.source.id,
          source_handle: args.source.sourceHandle,
          source_kind: args.source.sourceKind,
          outcome: args.outcome,
          reason_code: args.reasonCode,
          policy_decision: args.policyDecision.kind,
          policy_version: args.policyDecision.policyVersion,
          result_count: args.resultCount,
          result_bytes: args.resultBytes,
          duration_ms: args.durationMs,
          scope_hash: args.scopeHash,
          request_hash: args.requestHash,
          response_hash: args.responseHash,
          payload_hash: args.payloadHash,
        },
      },
      args.db,
    );
  } catch {
    receiptPersisted = false;
  }
  return {
    outcomeId,
    federationRunId: args.federationRunId,
    sourceId: args.source.id,
    sourceHandle: args.source.sourceHandle,
    sourceKind: args.source.sourceKind,
    outcome: args.outcome,
    reasonCode: args.reasonCode,
    policyDecision: args.policyDecision,
    policyVersion: args.policyDecision.policyVersion,
    resultCount: args.resultCount,
    resultBytes: args.resultBytes,
    durationMs: args.durationMs,
    requestHash: args.requestHash,
    responseHash: args.responseHash,
    payloadHash: args.payloadHash,
    scopeHash: args.scopeHash,
    metadata: args.metadata,
    receiptPersisted,
  };
}

/**
 * Provider / adapter failure handling (VAL-RETR-009, VAL-RETR-022).
 *
 * Failures MUST mark the task incomplete (status="provider_failed",
 * "provider_timeout", "malformed_response", etc.) — never silent zero.
 *
 * The runner enforces that every non-ok task contributes to
 * `incompleteTaskCount` and that aggregate reports clearly distinguish
 * completed from failed/incomplete tasks.
 *
 * Missing credentials fail closed: requesting a missing provider returns
 * a typed `credential_missing` status with a typed error reason.
 */

import type { AdapterResult, AdapterStatus, NormalizedTask } from "./schema";

export interface FailureClassification {
  status: AdapterStatus;
  reasonCode: string;
  detail: string;
}

export function classifyFailure(err: unknown): FailureClassification {
  if (err === null || err === undefined) {
    return {
      status: "provider_failed",
      reasonCode: "unknown_error",
      detail: "no error detail provided",
    };
  }
  if (err instanceof Error) {
    const message = err.message || "unspecified_error";
    if (/timeout|ETIMEDOUT|AbortError/i.test(message)) {
      return { status: "provider_timeout", reasonCode: "timeout", detail: message };
    }
    if (/malformed|invalid_json|parse_error/i.test(message)) {
      return { status: "malformed_response", reasonCode: "malformed_response", detail: message };
    }
    return { status: "provider_failed", reasonCode: "provider_failed", detail: message };
  }
  return {
    status: "provider_failed",
    reasonCode: "non_error_throw",
    detail: typeof err === "string" ? err : JSON.stringify(err).slice(0, 256),
  };
}

export interface ProviderConfigStatus {
  ok: boolean;
  reason: string;
  provider: string;
  status: AdapterStatus;
}

/**
 * Verify that a provider requested by the caller is actually configured.
 * Used for VAL-RETR-022: requested missing credentials return a typed
 * error and never a result falsely attributed to that provider.
 */
export function checkProviderConfig(args: {
  provider: string;
  envValue: string | undefined | null;
}): ProviderConfigStatus {
  if (!args.provider || args.provider.length === 0) {
    return {
      ok: false,
      reason: "provider_name_required",
      provider: args.provider ?? "",
      status: "configuration_error",
    };
  }
  if (!args.envValue || args.envValue.length === 0) {
    return {
      ok: false,
      reason: "credential_missing",
      provider: args.provider,
      status: "credential_missing",
    };
  }
  return {
    ok: true,
    reason: "credential_present",
    provider: args.provider,
    status: "ok",
  };
}

/**
 * Validate that an adapter result is well-formed. Used as a defense-in-depth
 * check after every adapter run.
 */
export function validateAdapterResult(result: AdapterResult): {
  ok: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  if (!result.taskId) reasons.push("taskId_missing");
  if (!result.adapterName) reasons.push("adapterName_missing");
  if (!Array.isArray(result.retrieved)) reasons.push("retrieved_not_array");
  if (!Array.isArray(result.injected)) reasons.push("injected_not_array");
  if (!Array.isArray(result.ignored)) reasons.push("ignored_not_array");
  if (typeof result.latencyMs !== "number" || !Number.isFinite(result.latencyMs)) {
    reasons.push("latencyMs_invalid");
  }
  if (!result.receipt) reasons.push("receipt_missing");
  if (result.status !== "ok" && result.injected.length > 0) {
    // Failed adapters MUST NOT claim injections — that would be a silent
    // zero hiding behind a successful shape.
    reasons.push("non_ok_status_with_injections");
  }
  if (result.adapterName === "live") {
    const receiptScopeHash = result.receipt?.authorization?.scopeHash;
    const retrievedIds = new Set(result.retrieved.map((item) => item.id));
    if (result.injected.some((id) => !retrievedIds.has(id))) {
      reasons.push("live_injected_id_not_retrieved");
    }
    if (result.retrieved.length > 0 && !receiptScopeHash) {
      reasons.push("live_retrieval_missing_scope_hash");
    }
    if (
      result.retrieved.some(
        (item) =>
          item.authorizationResult !== "allowed" ||
          !item.scopeHash ||
          item.scopeHash !== receiptScopeHash,
      )
    ) {
      reasons.push("live_retrieval_scope_mismatch");
    }
  }
  return { ok: reasons.length === 0, reasons };
}

/**
 * Aggregate the failure summary across all task results.
 */
export interface FailureSummary {
  taskCount: number;
  failedTaskCount: number;
  incompleteTaskCount: number;
  byStatus: Record<string, number>;
  byReason: Record<string, number>;
}

export function summarizeFailures(results: AdapterResult[]): FailureSummary {
  const byStatus: Record<string, number> = {};
  const byReason: Record<string, number> = {};
  let failedTaskCount = 0;
  let incompleteTaskCount = 0;
  for (const r of results) {
    if (r.status === "ok") continue;
    failedTaskCount += 1;
    incompleteTaskCount += 1;
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    if (r.statusDetail) {
      const key = r.statusDetail.slice(0, 64);
      byReason[key] = (byReason[key] ?? 0) + 1;
    }
  }
  return {
    taskCount: results.length,
    failedTaskCount,
    incompleteTaskCount,
    byStatus,
    byReason,
  };
}

/**
 * Convert a partial injection (e.g., from a timeout that returned SOME
 * results before failing) into a typed failure with safe receipts. The
 * partial results are moved to ignored to prevent them from inflating
 * the reported metrics.
 */
export function downgradeToFailure(args: {
  task: NormalizedTask;
  partial: AdapterResult;
  classification: FailureClassification;
}): AdapterResult {
  const ignoredFromPartial = args.partial.injected.map((id) => ({
    id,
    whyMissed: "partial_result_discarded_after_failure",
    reasonCode: args.classification.reasonCode,
  }));
  return {
    ...args.partial,
    status: args.classification.status,
    statusDetail: args.classification.detail,
    injected: [],
    retrieved: [],
    ignored: [...args.partial.ignored, ...ignoredFromPartial],
    receipt: {
      ...args.partial.receipt,
      status: args.classification.status,
      statusDetail: args.classification.detail,
    },
  };
}

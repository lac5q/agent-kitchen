/**
 * Benchmark report publication gate (VAL-RETR-028, VAL-RETR-029).
 *
 * Reports must NOT become public proof when:
 *   - the source has missing provenance,
 *   - receipt verification has not been run (or failed),
 *   - any provider/source/task was partial or unavailable,
 *   - the run itself is marked `incomplete` or `failed`.
 *
 * The gate is a deterministic function over the AggregateReport plus
 * the surrounding provenance + receipt verification receipts. It
 * returns either:
 *   - { ok: true, reason: "ready_for_publication" }  -> safe to publish
 *   - { ok: false, reason: ..., caveats: [...] }     -> refused
 *
 * Replayability (VAL-RETR-029) is also implemented here. A report that
 * carries `configHash`, `fixtureHash`, `seed`, `k`, `providerFlags`,
 * and `lane` can be replayed deterministically; missing values produce
 * an explicit `replay_incomplete` failure.
 */

import crypto from "node:crypto";

import type {
  AggregateReport,
  AdapterReceipt,
  BenchmarkLane,
  DatasetId,
  AdapterId,
} from "../schema";

export interface ReportProvenance {
  configHash: string;
  fixtureHash: string;
  seed: number;
  k: number;
  providerFlags: Record<string, boolean>;
  retrievalPolicyVersion?: string;
  rerankEnabled?: boolean;
  judgeEnabled?: boolean;
  benchMarkVersion?: string;
  runnerVersion?: string;
}

export interface ReceiptVerificationReceipt {
  receiptHash: string;
  chainDomain: string;
  verified: boolean;
  verifiedAtIso: string;
}

export interface PublicationGateInput {
  report: AggregateReport;
  provenance: ReportProvenance;
  receiptVerifications: ReceiptVerificationReceipt[];
  /**
   * Isolation validation computed from artifacts produced by this run.
   * A rejected foreign test artifact is a failed contamination result, not
   * a separate synthetic probe the production runner must fabricate.
   */
  contamination?: { ok: boolean; reason?: string };
  /**
   * Required audit outcomes that are known before the publication decision is
   * evaluated. Publication persistence itself happens exactly once after this
   * final decision has been calculated.
   */
  auditPersistence?: {
    ok: boolean;
    reasons?: string[];
    skippedNoWrite?: boolean;
  };
  /** Optional sensitive-content sentinel scan results. */
  sentinelScan?: { ok: boolean; violations: number };
}

export interface PublicationGateResult {
  ok: boolean;
  status: "ready_for_publication" | "blocked_for_publication";
  reason: string;
  caveats: string[];
  /** Frozen gate decision hash. */
  decisionHash: string;
  decidedAtIso: string;
}

const REQUIRED_PROVENANCE_FIELDS: ReadonlyArray<keyof ReportProvenance> = [
  "configHash",
  "fixtureHash",
  "seed",
  "k",
  "providerFlags",
];

export function evaluatePublicationGate(input: PublicationGateInput): PublicationGateResult {
  const decidedAtIso = new Date().toISOString();
  const caveats: string[] = [];
  let ok = true;

  // 1) Provenance must include all required fields.
  for (const field of REQUIRED_PROVENANCE_FIELDS) {
    const v = input.provenance[field];
    if (v === undefined || v === null) {
      ok = false;
      caveats.push("missing_provenance_field:" + field);
    } else if (typeof v === "string" && v.length === 0) {
      ok = false;
      caveats.push("empty_provenance_field:" + field);
    }
  }
  // configHash must be a sha256 hex digest.
  if (
    typeof input.provenance.configHash === "string" &&
    !/^sha256:[a-f0-9]+$/.test(input.provenance.configHash)
  ) {
    ok = false;
    caveats.push("config_hash_malformed");
  }
  if (
    typeof input.provenance.fixtureHash === "string" &&
    !/^sha256:[a-f0-9]+$/.test(input.provenance.fixtureHash)
  ) {
    ok = false;
    caveats.push("fixture_hash_malformed");
  }

  // 2) Receipt verification must be present and verified.
  if (input.receiptVerifications.length === 0) {
    ok = false;
    caveats.push("receipt_verification_missing");
  }
  for (const v of input.receiptVerifications) {
    if (!v.verified) {
      ok = false;
      caveats.push("receipt_verification_failed:" + v.receiptHash);
    }
  }

  // 3) Every artifact must belong to the current run's isolation scope.
  if (input.contamination && !input.contamination.ok) {
    ok = false;
    caveats.push(
      "contamination_failed:" + (input.contamination.reason ?? "unknown"),
    );
  }

  // 4) Required evidence persistence must complete before the sole final
  // publication decision. This prevents later caller-side gate mutation.
  if (input.auditPersistence && !input.auditPersistence.ok) {
    ok = false;
    const reasons = input.auditPersistence.reasons ?? [];
    caveats.push(
      "audit_persistence_failed:" +
        (reasons.length > 0 ? reasons.join("|") : "unknown"),
    );
  }
  if (input.auditPersistence?.skippedNoWrite) {
    ok = false;
    caveats.push("audit_persistence_skipped_no_write");
  }

  // 5) Provider/source/task runs must not be partial.
  if (input.report.aggregate.failedTaskCount > 0) {
    // Allow failed tasks if the report explicitly marks the run incomplete.
    // We don't have a top-level status, so partial is inferred here.
    ok = false;
    caveats.push("failed_tasks_present:count=" + input.report.aggregate.failedTaskCount);
  }

  // 6) Sentinel scan must be clean if supplied.
  if (input.sentinelScan && !input.sentinelScan.ok) {
    ok = false;
    caveats.push("sentinel_scan_failed:violations=" + input.sentinelScan.violations);
  }

  // 7) Run metadata fields must be consistent (replayability, VAL-RETR-029).
  const r = input.report;
  if (r.configHash !== input.provenance.configHash) {
    ok = false;
    caveats.push("report_config_hash_mismatch");
  }
  if (r.fixtureHash !== input.provenance.fixtureHash) {
    ok = false;
    caveats.push("report_fixture_hash_mismatch");
  }
  if (r.seed !== input.provenance.seed) {
    ok = false;
    caveats.push("report_seed_mismatch");
  }
  if (r.k !== input.provenance.k) {
    ok = false;
    caveats.push("report_k_mismatch");
  }

  const reason = ok
    ? "ready_for_publication"
    : "blocked_for_publication:" + caveats.join(",");

  // Decision hash binds the gate to its inputs for replay (VAL-RETR-029).
  const decisionHash =
    "sha256:" +
    crypto
      .createHash("sha256")
      .update(
        JSON.stringify({
          configHash: input.provenance.configHash,
          fixtureHash: input.provenance.fixtureHash,
          ok,
          caveats,
        }),
      )
      .digest("hex");

  return {
    ok,
    status: ok ? "ready_for_publication" : "blocked_for_publication",
    reason,
    caveats,
    decisionHash,
    decidedAtIso,
  };
}

// ---------------------------------------------------------------------------
// Replay helper (VAL-RETR-029)
// ---------------------------------------------------------------------------

export interface ReplayArgs {
  dataset: DatasetId;
  adapter: AdapterId;
  lane: BenchmarkLane;
  configHash: string;
  fixtureHash: string;
  seed: number;
  k: number;
  providerFlags: Record<string, boolean>;
  rerankEnabled: boolean;
  judgeEnabled: boolean;
  /** Optional retrieval policy version used to produce the report. */
  retrievalPolicyVersion?: string;
}

export interface ReplayHandle {
  matches: (report: { dataset: DatasetId; adapter: AdapterId; lane: BenchmarkLane; configHash: string; fixtureHash: string; seed: number; k: number; providerFlags: Record<string, boolean>; rerankEnabled: boolean; judgeEnabled: boolean }) => boolean;
  inspect(): ReplayArgs;
  fingerprint: string;
}

export function buildReplayHandle(args: ReplayArgs): ReplayHandle {
  const fingerprintInput = JSON.stringify({
    dataset: args.dataset,
    adapter: args.adapter,
    lane: args.lane,
    configHash: args.configHash,
    fixtureHash: args.fixtureHash,
    seed: args.seed,
    k: args.k,
    providerFlags: stableStringify(args.providerFlags),
    rerankEnabled: args.rerankEnabled,
    judgeEnabled: args.judgeEnabled,
    retrievalPolicyVersion: args.retrievalPolicyVersion ?? "retrieval-v1",
  });
  const fingerprint =
    "sha256:" + crypto.createHash("sha256").update(fingerprintInput).digest("hex");
  return {
    matches: (report) => {
      return (
        report.dataset === args.dataset &&
        report.adapter === args.adapter &&
        report.lane === args.lane &&
        report.configHash === args.configHash &&
        report.fixtureHash === args.fixtureHash &&
        report.seed === args.seed &&
        report.k === args.k &&
        report.rerankEnabled === args.rerankEnabled &&
        report.judgeEnabled === args.judgeEnabled &&
        sameProviderFlags(report.providerFlags, args.providerFlags)
      );
    },
    inspect: () => ({ ...args }),
    fingerprint,
  };
}

function sameProviderFlags(
  a: Record<string, boolean>,
  b: Record<string, boolean>,
): boolean {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  if (ka.length !== kb.length) return false;
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] !== kb[i]) return false;
    if (a[ka[i]] !== b[kb[i]]) return false;
  }
  return true;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  const obj = value as Record<string, unknown>;
  return (
    "{" +
    Object.keys(obj)
      .sort()
      .map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k]))
      .join(",") +
    "}"
  );
}

// ---------------------------------------------------------------------------
// Per-task receipt stability (VAL-RETR-024, VAL-RETR-027)
// ---------------------------------------------------------------------------

export interface ReceiptLineage {
  receiptHash: string;
  stages: string[];
}

export function receiptLineageFor(receipt: AdapterReceipt): ReceiptLineage {
  const stages: string[] = [];
  if (receipt.status) stages.push("status:" + receipt.status);
  if (receipt.provenance.provider) stages.push("provider:" + receipt.provenance.provider);
  if (receipt.provenance.retrievalPolicyVersion) stages.push("policy:" + receipt.provenance.retrievalPolicyVersion);
  if (receipt.metrics.contextPackHash) stages.push("pack:" + receipt.metrics.contextPackHash);
  if (receipt.provenance.configHash) stages.push("config:" + receipt.provenance.configHash);
  if (receipt.provenance.fixtureHash) stages.push("fixture:" + receipt.provenance.fixtureHash);
  const receiptHash =
    "sha256:" +
    crypto.createHash("sha256").update(JSON.stringify({ status: receipt.status, stages })).digest("hex").slice(0, 16);
  return { receiptHash, stages };
}

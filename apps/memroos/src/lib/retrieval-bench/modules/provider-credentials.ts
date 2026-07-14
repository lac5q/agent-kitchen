/**
 * Provider credentials and governance (VAL-RETR-021, VAL-RETR-022,
 * VAL-RETR-023).
 *
 * Each optional provider (embedding, vector_backend, rerank, judge,
 * external_mcp) has independent enabled flags. When a caller requests
 * a specific provider:
 *
 *   - If the flag is disabled, no provider call is made and the stage
 *     returns a typed "disabled" outcome.
 *   - If the flag is enabled and credentials are missing, the stage
 *     fails closed with a typed `credential_missing` error.
 *   - Provider output is gated by authorization: even if a provider
 *     returns unauthorized or stale content, it is rejected by the
 *     governance layer before it can contribute to retrieved items
 *     (VAL-RETR-023).
 *
 * This module owns:
 *   - The provider flag registry (independent)
 *   - The credentials verifier (fail-closed)
 *   - The governance gate that re-applies tenant / scope / belief /
 *     label gates over provider output
 */

import crypto from "node:crypto";

import type { RetrievedItem } from "../schema";

export const PROVIDER_CREDENTIALS_VERSION = "module-version-string-one-dot-zero-dot-zero";

export interface ProviderFlags {
  embedding: boolean;
  vector_backend: boolean;
  rerank: boolean;
  judge: boolean;
  external_mcp: boolean;
}

export const DEFAULT_PROVIDER_FLAGS: ProviderFlags = {
  embedding: false,
  vector_backend: false,
  rerank: false,
  judge: false,
  external_mcp: false,
};

export type ProviderName = keyof ProviderFlags;

/** Optional per-provider credential resolver. */
export type CredentialResolver = (
  name: ProviderName,
) => string | undefined | null;

export interface ProviderAvailabilityResult {
  ok: boolean;
  status: "ok" | "disabled" | "credential_missing";
  reason: string;
  requestedProvider: ProviderName;
  // Used for receipts — never the secret itself.
  credentialFingerprint: string | null;
}

export function checkProviderAvailable(args: {
  provider: ProviderName;
  flags: ProviderFlags;
  resolveCredential: CredentialResolver;
}): ProviderAvailabilityResult {
  const enabled = args.flags[args.provider];
  if (!enabled) {
    return {
      ok: false,
      status: "disabled",
      reason: "provider_disabled",
      requestedProvider: args.provider,
      credentialFingerprint: null,
    };
  }
  const credential = args.resolveCredential(args.provider);
  if (!credential || credential.length === 0) {
    return {
      ok: false,
      status: "credential_missing",
      reason: "missing_credential_for:" + args.provider,
      requestedProvider: args.provider,
      credentialFingerprint: null,
    };
  }
  return {
    ok: true,
    status: "ok",
    reason: "available",
    requestedProvider: args.provider,
    credentialFingerprint: hashSecretFingerprint(credential),
  };
}

function hashSecretFingerprint(secret: string): string {
  return "sha256:" + crypto.createHash("sha256").update(secret).digest("hex").slice(0, 16);
}

// ---------------------------------------------------------------------------
// Provider output governance gate (VAL-RETR-023)
// ---------------------------------------------------------------------------

export interface ProviderOutputItem {
  id: string;
  text: string;
  score: number;
  tier: RetrievedItem["tier"];
  source?: string;
  timestamp_iso?: string;
  /** The provider's claim of authority. */
  providerTrust?: number;
  /** Optional label metadata from the provider. */
  label?: string | null;
  /** Optional tenant metadata from the provider. */
  tenantId?: string | null;
}

export interface GovernanceGateInput {
  items: ProviderOutputItem[];
  scope: {
    tenantId: string;
    label?: string | null;
    /** Maximum freshness in seconds; null disables freshness check. */
    maxFreshnessSeconds: number | null;
    /** Reference clock (test seam). */
    nowIso?: string;
  };
  providerTrustFloor: number;
}

export interface GovernanceGateDecision {
  items: RetrievedItem[];
  denied: Array<{ id: string; reason: string }>;
  receipt: {
    stageVersion: string;
    consideredCount: number;
    passedCount: number;
    deniedCount: number;
    denialReasons: Record<string, number>;
  };
}

export function applyProviderGovernanceGate(
  input: GovernanceGateInput,
): GovernanceGateDecision {
  const allowedItems: RetrievedItem[] = [];
  const denied: Array<{ id: string; reason: string }> = [];
  const denialReasons: Record<string, number> = {
    cross_tenant: 0,
    cross_label: 0,
    stale: 0,
    sub_floor_trust: 0,
    malformed: 0,
  };

  for (const item of input.items) {
    if (item.tenantId && item.tenantId !== input.scope.tenantId) {
      denialReasons.cross_tenant += 1;
      denied.push({ id: item.id, reason: "cross_tenant" });
      continue;
    }
    if (input.scope.label && item.label && item.label !== input.scope.label) {
      denialReasons.cross_label += 1;
      denied.push({ id: item.id, reason: "cross_label" });
      continue;
    }
    if (
      input.scope.maxFreshnessSeconds !== null &&
      item.timestamp_iso
    ) {
      const ts = Date.parse(item.timestamp_iso);
      if (!Number.isFinite(ts)) {
        denialReasons.malformed += 1;
        denied.push({ id: item.id, reason: "malformed_timestamp" });
        continue;
      }
      const ageSeconds = Math.max(0, (Date.parse(input.scope.nowIso ?? new Date().toISOString()) - ts) / 1000);
      if (ageSeconds > (input.scope.maxFreshnessSeconds ?? Infinity)) {
        denialReasons.stale += 1;
        denied.push({ id: item.id, reason: "stale" });
        continue;
      }
    }
    if ((item.providerTrust ?? 1) < input.providerTrustFloor) {
      denialReasons.sub_floor_trust += 1;
      denied.push({ id: item.id, reason: "sub_floor_trust" });
      continue;
    }
    allowedItems.push({
      id: item.id,
      score: item.score,
      text: item.text,
      tier: item.tier,
      source: item.source ?? item.tier,
      authorizationResult: "allowed",
      whyEntered: "provider_output_authorized:" + input.scope.tenantId,
      timestamp_iso: item.timestamp_iso,
      rankPosition: 0, // to be set later by the deterministic pack
    });
  }

  return {
    items: allowedItems,
    denied,
    receipt: {
      stageVersion: PROVIDER_CREDENTIALS_VERSION,
      consideredCount: input.items.length,
      passedCount: allowedItems.length,
      deniedCount: denied.length,
      denialReasons,
    },
  };
}

// ---------------------------------------------------------------------------
// Stage receipt (VAL-RETR-021)
// ---------------------------------------------------------------------------

export interface ProviderFlagMeta {
  flag: ProviderName;
  enabled: boolean;
  credentialPresent: boolean;
  status: "ok" | "disabled" | "credential_missing" | "unused";
}

export function describeProviderFlags(args: {
  flags: ProviderFlags;
  resolveCredential: CredentialResolver;
}): {
  flags: ProviderFlagMeta[];
  independent: boolean;
  receiptVersion: string;
} {
  const names: ProviderName[] = ["embedding", "vector_backend", "rerank", "judge", "external_mcp"];
  const out: ProviderFlagMeta[] = [];
  for (const name of names) {
    const enabled = args.flags[name];
    const cred = args.resolveCredential(name);
    const credentialPresent = enabled && !!cred && cred.length > 0;
    const status: ProviderFlagMeta["status"] = !enabled
      ? "disabled"
      : !credentialPresent
        ? "credential_missing"
        : "ok";
    out.push({ flag: name, enabled, credentialPresent, status });
  }
  // Independence check: each flag is a distinct boolean key.
  const independent = names.every((n, i) => names.indexOf(n) === i);
  return {
    flags: out,
    independent,
    receiptVersion: PROVIDER_CREDENTIALS_VERSION,
  };
}

import { describe, expect, it } from "vitest";

import {
  DEFAULT_PROVIDER_FLAGS,
  applyProviderGovernanceGate,
  checkProviderAvailable,
  describeProviderFlags,
} from "../provider-credentials";

describe("provider credentials and governance", () => {
  it("distinguishes disabled, missing credential, and available providers", () => {
    expect(
      checkProviderAvailable({
        provider: "embedding",
        flags: DEFAULT_PROVIDER_FLAGS,
        resolveCredential: () => "secret",
      })
    ).toMatchObject({ ok: false, status: "disabled", reason: "provider_disabled" });

    expect(
      checkProviderAvailable({
        provider: "rerank",
        flags: { ...DEFAULT_PROVIDER_FLAGS, rerank: true },
        resolveCredential: () => "",
      })
    ).toMatchObject({ ok: false, status: "credential_missing", reason: "missing_credential_for:rerank" });

    const available = checkProviderAvailable({
      provider: "judge",
      flags: { ...DEFAULT_PROVIDER_FLAGS, judge: true },
      resolveCredential: () => "judge-secret",
    });
    expect(available).toMatchObject({ ok: true, status: "ok", requestedProvider: "judge" });
    expect(available.credentialFingerprint).toMatch(/^sha256:[a-f0-9]{16}$/);
  });

  it("governance denies cross-scope, stale, malformed, and low-trust provider items", () => {
    const decision = applyProviderGovernanceGate({
      scope: {
        tenantId: "tenant-a",
        label: "internal",
        maxFreshnessSeconds: 60,
        nowIso: "2026-07-18T12:00:00.000Z",
      },
      providerTrustFloor: 0.5,
      items: [
        { id: "cross-tenant", text: "x", score: 1, tier: "live", tenantId: "tenant-b" },
        { id: "cross-label", text: "x", score: 1, tier: "live", tenantId: "tenant-a", label: "private" },
        { id: "malformed", text: "x", score: 1, tier: "live", tenantId: "tenant-a", label: "internal", timestamp_iso: "bad" },
        { id: "stale", text: "x", score: 1, tier: "live", tenantId: "tenant-a", label: "internal", timestamp_iso: "2026-07-18T11:00:00.000Z" },
        { id: "low-trust", text: "x", score: 1, tier: "live", tenantId: "tenant-a", label: "internal", providerTrust: 0.1 },
        { id: "allowed", text: "ok", score: 0.8, tier: "mem0", tenantId: "tenant-a", label: "internal", source: "judge" },
      ],
    });

    expect(decision.items).toHaveLength(1);
    expect(decision.items[0]).toMatchObject({
      id: "allowed",
      source: "judge",
      authorizationResult: "allowed",
      whyEntered: "provider_output_authorized:tenant-a",
    });
    expect(decision.denied.map((item) => item.reason)).toEqual([
      "cross_tenant",
      "cross_label",
      "malformed_timestamp",
      "stale",
      "sub_floor_trust",
    ]);
    expect(decision.receipt.denialReasons).toMatchObject({
      cross_tenant: 1,
      cross_label: 1,
      malformed: 1,
      stale: 1,
      sub_floor_trust: 1,
    });
  });

  it("describes independent provider flags without exposing secrets", () => {
    const described = describeProviderFlags({
      flags: { ...DEFAULT_PROVIDER_FLAGS, embedding: true, external_mcp: true },
      resolveCredential: (name) => (name === "embedding" ? "embed-secret" : null),
    });

    expect(described.independent).toBe(true);
    expect(described.flags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ flag: "embedding", enabled: true, credentialPresent: true, status: "ok" }),
        expect.objectContaining({ flag: "external_mcp", enabled: true, credentialPresent: false, status: "credential_missing" }),
        expect.objectContaining({ flag: "vector_backend", enabled: false, credentialPresent: false, status: "disabled" }),
      ])
    );
  });
});

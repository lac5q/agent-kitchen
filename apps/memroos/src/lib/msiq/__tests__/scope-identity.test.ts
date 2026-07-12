// @vitest-environment node
/**
 * VAL-ORCH-004: Scope identity is complete (tenantId/userId/agentId/
 * spaceId/label/purpose/beliefStage). Missing or mismatched scope
 * fails closed.
 */
import { describe, expect, it } from "vitest";
import {
  buildScopeIdentity,
  hashScopeIdentity,
  isCompleteScopeIdentity,
  normalizeScopeIdentity,
  scopeIdentityRecord,
  BELIEF_STAGES,
} from "../scope-identity";

describe("VAL-ORCH-004 -- normalizeScopeIdentity", () => {
  it("returns null when tenantId is missing", () => {
    const r = normalizeScopeIdentity({
      tenantId: null,
      userId: "u",
      agentId: "a",
      spaceId: "s",
      label: { visibility: "private", policy: "agent_visible" },
      purpose: "memory_search",
      beliefStage: "silver_candidate_claim",
    });
    expect(r).toBeNull();
  });

  it("returns null when purpose is unknown", () => {
    const r = normalizeScopeIdentity({
      tenantId: "t",
      userId: "u",
      agentId: "a",
      spaceId: "s",
      label: { visibility: "private", policy: "agent_visible" },
      purpose: "bogus" as unknown as "recall",
      beliefStage: "silver_candidate_claim",
    });
    expect(r).toBeNull();
  });

  it("returns null when beliefStage is unknown", () => {
    const r = normalizeScopeIdentity({
      tenantId: "t",
      userId: "u",
      agentId: "a",
      spaceId: "s",
      label: { visibility: "private", policy: "agent_visible" },
      purpose: "memory_search",
      beliefStage: "mystery",
    });
    expect(r).toBeNull();
  });

  it("returns the canonical scope when every dimension is valid", () => {
    const r = normalizeScopeIdentity({
      tenantId: "t",
      userId: "u",
      agentId: "a",
      spaceId: "s",
      label: { visibility: "private", policy: "agent_visible" },
      purpose: "memory_search",
      beliefStage: "silver_candidate_claim",
    });
    expect(r).not.toBeNull();
    expect(BELIEF_STAGES).toContain(r!.beliefStage);
  });
});

describe("VAL-ORCH-004 -- hash determinism", () => {
  it("produces the same hash for identical scopes", () => {
    const scope = normalizeScopeIdentity({
      tenantId: "t",
      userId: "u",
      agentId: "a",
      spaceId: "s",
      label: { visibility: "private", policy: "agent_visible" },
      purpose: "memory_search",
      beliefStage: "silver_candidate_claim",
    });
    expect(scope).not.toBeNull();
    const h1 = hashScopeIdentity(scope!);
    const h2 = hashScopeIdentity(scope!);
    expect(h1).toBe(h2);
  });

  it("produces a different hash when any dimension changes", () => {
    const a = normalizeScopeIdentity({
      tenantId: "t1",
      userId: "u",
      agentId: "a",
      spaceId: "s",
      label: { visibility: "private", policy: "agent_visible" },
      purpose: "memory_search",
      beliefStage: "silver_candidate_claim",
    });
    const b = normalizeScopeIdentity({
      tenantId: "t2",
      userId: "u",
      agentId: "a",
      spaceId: "s",
      label: { visibility: "private", policy: "agent_visible" },
      purpose: "memory_search",
      beliefStage: "silver_candidate_claim",
    });
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(hashScopeIdentity(a!)).not.toBe(hashScopeIdentity(b!));
  });

  it("scopeIdentityRecord is canonical and stable", () => {
    const scope = normalizeScopeIdentity({
      tenantId: "t",
      userId: "u",
      agentId: "a",
      spaceId: "s",
      label: { visibility: "private", policy: "agent_visible" },
      purpose: "memory_search",
      beliefStage: "silver_candidate_claim",
    });
    expect(scope).not.toBeNull();
    const r = scopeIdentityRecord(scope!);
    expect(isCompleteScopeIdentity(r)).toBe(true);
  });
});

describe("VAL-ORCH-004 -- buildScopeIdentity", () => {
  it("builds a complete scope from a MemoryUseActor", () => {
    const r = buildScopeIdentity({
      actor: {
        id: "user-1",
        role: "agent",
        capability: "agent-1",
        tenantId: "tenant-1",
      },
      spaceId: "space-1",
      label: { visibility: "internal", policy: "indexable" },
      purpose: "memory_search",
      beliefStage: "silver_candidate_claim",
    });
    expect(r).not.toBeNull();
    expect(r!.tenantId).toBe("tenant-1");
    expect(r!.userId).toBe("user-1");
    expect(r!.agentId).toBe("agent-1");
    expect(r!.spaceId).toBe("space-1");
  });

  it("returns a complete scope identity even for anonymous actors (scope is data; policy denies downstream)", () => {
    const r = buildScopeIdentity({
      actor: { id: "anon", role: "anonymous", tenantId: "t", capability: "a" },
      spaceId: "space-1",
      label: { visibility: "internal", policy: "indexable" },
      purpose: "memory_search",
    });
    expect(r).not.toBeNull();
    expect(r!.userId).toBe("anon");
  });
});

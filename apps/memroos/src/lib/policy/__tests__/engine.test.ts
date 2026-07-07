// @vitest-environment node
/**
 * Phase 128 (POLGOV-01/02) — Shared policy engine tests.
 *
 * HARD CONSTRAINT: decisions must match the wrapped functions BYTE-FOR-BYTE.
 * These tests deep-compare engine evaluations against the underlying
 * functions on the same inputs to enforce that invariant.
 */

import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  AUDIT_EVENT_TYPES,
  ENTITY_TYPES,
} from "@/lib/audit/event-types";
import { initSchema } from "@/lib/db-schema";
import { authorizeMemoryUse } from "@/lib/memory/policy-gate";
import { checkDispatchPolicy } from "@/lib/security-policy";
import type { RemoteAgentConfig } from "@/types";

import {
  POLICY_VERSION,
  evaluateKnowledgePolicy,
  evaluatePolicy,
} from "../engine";

let db: Database.Database;

beforeEach(() => {
  db = new Database(":memory:");
  initSchema(db);
});

afterEach(() => {
  db.close();
});

describe("policy engine — manifest", () => {
  it("exposes a non-empty policy version from the in-repo manifest", () => {
    expect(typeof POLICY_VERSION).toBe("string");
    expect(POLICY_VERSION.length).toBeGreaterThan(0);
    // Version is yyyy.mm.<phase> shaped; just assert it parses digits.
    expect(POLICY_VERSION).toMatch(/^\d{4}\.\d{2}\.\d+$/);
  });
});

describe("policy engine — memory-use domain", () => {
  it("sealed label returns deny and matches authorizeMemoryUse byte-for-byte", () => {
    const memoryUse = {
      actor: { id: "agent:test", role: "agent" as const },
      purpose: "dispatch" as const,
      label: {
        visibility: "private" as const,
        domain: "legal" as const,
        sensitivity: "privileged" as const,
        policy: "sealed" as const,
      },
    };

    const evaluation = evaluatePolicy({
      domain: "memory-use",
      action: "recall.test",
      actor: { id: memoryUse.actor.id, role: memoryUse.actor.role },
      memoryUse,
    });

    const direct = authorizeMemoryUse(memoryUse);

    expect(evaluation.receipt.outcome).toBe("deny");
    expect(evaluation.receipt.ruleMatched).toBe("memsec.memory-use");
    expect(evaluation.receipt.reason).toBe("sealed_content");
    expect(evaluation.receipt.policyVersion).toBe(POLICY_VERSION);
    expect(evaluation.memoryUse).toEqual(direct);
  });

  it("requires_human_review label returns review-required outcome", () => {
    const memoryUse = {
      actor: { id: "agent:test", role: "agent" as const },
      purpose: "dispatch" as const,
      label: {
        visibility: "private" as const,
        domain: "engineering" as const,
        sensitivity: "credential" as const,
        policy: "requires_human_review" as const,
      },
    };

    const evaluation = evaluatePolicy({
      domain: "memory-use",
      action: "review.test",
      actor: { id: memoryUse.actor.id, role: memoryUse.actor.role },
      memoryUse: {
        actor: { id: memoryUse.actor.id, role: memoryUse.actor.role },
        purpose: memoryUse.purpose,
        label: memoryUse.label,
      },
    });

    expect(evaluation.receipt.outcome).toBe("review-required");
    expect(evaluation.receipt.reason).toBe("human_review_required");
    expect(evaluation.memoryUse).toEqual(authorizeMemoryUse(memoryUse));
  });

  it("receipt detail contains NO content field; only label/purpose/actorRole", () => {
    const evaluation = evaluatePolicy({
      domain: "memory-use",
      action: "detail.no-content",
      actor: { id: "agent:test", role: "agent" },
      memoryUse: {
        actor: { id: "agent:test", role: "agent" },
        purpose: "recall",
        label: { visibility: "private", policy: "sealed" },
      },
    });

    expect(evaluation.receipt.detail).toBeDefined();
    const keys = Object.keys(evaluation.receipt.detail ?? {}).sort();
    expect(keys).toEqual(["actorRole", "label", "purpose"]);
    expect(evaluation.receipt.detail).not.toHaveProperty("content");
    expect(evaluation.receipt.detail).not.toHaveProperty("text");
    expect(evaluation.receipt.detail).not.toHaveProperty("body");
    expect(evaluation.receipt.detail).not.toHaveProperty("payload");
  });
});

describe("policy engine — capability domain", () => {
  const remoteTargetNoDispatch: RemoteAgentConfig = {
    id: "agent:remote-no-dispatch",
    name: "remote",
    role: "worker",
    platform: "claude",
    protocol: "a2a",
    location: "cloudflare",
    host: "example.com",
    port: 443,
    healthEndpoint: "/health",
    skills: [{ id: "summarize", name: "Summarize", description: "n/a", tags: [], inputModes: ["text"], outputModes: ["text"] }],
  };

  // Force the legacy-undeclared allowance OFF regardless of NODE_ENV /
  // MEMROOS_A2A_PROFILE so `checkDispatchPolicy` actually checks declared skills.
  const savedExplicitLegacy = process.env.MEMROOS_ALLOW_LEGACY_UNDECLARED_CAPABILITIES;

  beforeEach(() => {
    process.env.MEMROOS_ALLOW_LEGACY_UNDECLARED_CAPABILITIES = "off";
  });

  afterEach(() => {
    if (savedExplicitLegacy === undefined)
      delete process.env.MEMROOS_ALLOW_LEGACY_UNDECLARED_CAPABILITIES;
    else process.env.MEMROOS_ALLOW_LEGACY_UNDECLARED_CAPABILITIES = savedExplicitLegacy;
  });

  it("dispatch target with no dispatch skills returns deny and matches checkDispatchPolicy", () => {
    const evaluation = evaluatePolicy({
      domain: "capability",
      action: "dispatch.test",
      actor: { id: "agent:from", role: "agent" },
      capability: {
        kind: "dispatch",
        fromAgentId: "agent:from",
        targetAgent: remoteTargetNoDispatch,
      },
    });

    const direct = checkDispatchPolicy("agent:from", remoteTargetNoDispatch);

    expect(evaluation.receipt.outcome).toBe("deny");
    expect(evaluation.receipt.ruleMatched).toBe("capability.dispatch");
    expect(evaluation.capability).toEqual(direct);
    // Sanity: the underlying decision is also a deny so the wrapper didn't
    // accidentally flip the outcome.
    expect(evaluation.capability?.allowed).toBe(false);
  });
});

describe("policy engine — receipt emission", () => {
  it("passing a db writes exactly one POLICY_DECISION audit row", () => {
    const before = (db
      .prepare("SELECT COUNT(*) as c FROM audit_entries WHERE event_type = ?")
      .get(AUDIT_EVENT_TYPES.POLICY_DECISION) as { c: number }).c;

    evaluatePolicy(
      {
        domain: "memory-use",
        action: "audit.test",
        actor: { id: "agent:test", role: "agent" },
        memoryUse: {
          actor: { id: "agent:test", role: "agent" },
          purpose: "recall",
          label: { visibility: "private", policy: "sealed" },
        },
      },
      db
    );

    const after = (db
      .prepare("SELECT COUNT(*) as c FROM audit_entries WHERE event_type = ?")
      .get(AUDIT_EVENT_TYPES.POLICY_DECISION) as { c: number }).c;

    expect(after - before).toBe(1);

    const row = db
      .prepare(
        "SELECT event_type, entity_type, actor_id, actor_role, entity_id, metadata_json FROM audit_entries WHERE event_type = ? ORDER BY rowid DESC LIMIT 1"
      )
      .get(AUDIT_EVENT_TYPES.POLICY_DECISION) as {
      event_type: string;
      entity_type: string;
      actor_id: string;
      actor_role: string;
      entity_id: string;
      metadata_json: string;
    };

    expect(row.event_type).toBe(AUDIT_EVENT_TYPES.POLICY_DECISION);
    expect(row.entity_type).toBe(ENTITY_TYPES.POLICY_DECISION);
    expect(row.entity_id).toBe("policy_decision:memory-use:audit.test");
    expect(row.actor_id).toBe("agent:test");
    // "agent" is a domain role; the audit boundary collapses it to "system".
    expect(row.actor_role).toBe("system");

    const metadata = JSON.parse(row.metadata_json) as Record<string, unknown>;
    expect(metadata.policyVersion).toBe(POLICY_VERSION);
    expect(metadata.domain).toBe("memory-use");
    expect(metadata.ruleMatched).toBe("memsec.memory-use");
    expect(metadata.outcome).toBe("deny");
  });
});

describe("policy engine — knowledge domain (declarative pass-through)", () => {
  it("returns allow with reason knowledge_policy_delegated and no underlying result", () => {
    const evaluation = evaluateKnowledgePolicy({
      action: "knowledge.write",
      actor: { id: "agent:test", role: "agent" },
      metadata: { tenantId: "tenant-x", toolId: "mem0_write" },
    });

    expect(evaluation.receipt.outcome).toBe("allow");
    expect(evaluation.receipt.reason).toBe("knowledge_policy_delegated");
    expect(evaluation.receipt.ruleMatched).toBe("knowledge.policy-check");
    expect(evaluation.receipt.domain).toBe("knowledge");
    expect(evaluation.memoryUse).toBeUndefined();
    expect(evaluation.capability).toBeUndefined();
  });
});

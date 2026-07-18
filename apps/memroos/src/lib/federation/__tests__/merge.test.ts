// @vitest-environment node
/**
 * VAL-ORCH-010: deterministic federated merge.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { mergeFederatedPack } from "../merge";
import type { FederationSourceOutcome, FederationPolicyDecision } from "../retrieval";

let db: import("better-sqlite3").Database;
let closeDb: () => void;
let TEST_DB_DIR: string;

beforeEach(async () => {
  TEST_DB_DIR = path.join(os.tmpdir(), "federation-merge-" + crypto.randomUUID());
  fs.mkdirSync(TEST_DB_DIR, { recursive: true });
  process.env.SQLITE_DB_PATH = path.join(TEST_DB_DIR, "fed.db");
  vi.resetModules();
  const { getDb, closeDb: close } = await import("@/lib/db");
  const { initSchema } = await import("@/lib/db-schema");
  db = getDb();
  initSchema(db);
  closeDb = close;
});

afterEach(() => {
  closeDb();
  if (fs.existsSync(TEST_DB_DIR)) fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
});

function makeOutcome(overrides: Partial<FederationSourceOutcome> = {}): FederationSourceOutcome {
  const policy: FederationPolicyDecision = { kind: "allow", reason: "ok", policyVersion: "federation-v1" };
  return {
    outcomeId: overrides.outcomeId ?? "out-" + crypto.randomUUID(),
    federationRunId: "run-1",
    sourceId: "src-1",
    sourceHandle: "alpha",
    sourceKind: "memory",
    outcome: "success",
    reasonCode: "ok",
    policyDecision: policy,
    policyVersion: "federation-v1",
    resultCount: 1,
    resultBytes: 100,
    durationMs: 1,
    requestHash: null,
    responseHash: null,
    payloadHash: null,
    scopeHash: "sha256:scope",
    metadata: {},
    ...overrides,
  };
}

describe("VAL-ORCH-010 -- mergeFederatedPack", () => {
  it("dedupes by canonical_hash and ranks by score desc, source_handle asc, hash asc", () => {
    const a = makeOutcome({ outcomeId: "A", sourceId: "src-1", sourceHandle: "alpha", scopeHash: "sha256:scope" });
    const b = makeOutcome({ outcomeId: "B", sourceId: "src-2", sourceHandle: "beta", scopeHash: "sha256:scope" });
    const items = new Map<string, Array<{ id: string; content: string; score: number; canonicalHash: string }>>();
    items.set("A", [
      { id: "i1", content: "high-score-alpha", score: 0.9, canonicalHash: "sha256:h1" },
      { id: "i2", content: "low-score-alpha", score: 0.1, canonicalHash: "sha256:l1" },
    ]);
    items.set("B", [
      { id: "i3", content: "mid-score-beta", score: 0.5, canonicalHash: "sha256:m1" },
    ]);
    const r = mergeFederatedPack(db, {
      tenantId: "default-tenant",
      federationRunId: "run-1",
      outcomes: [a, b],
      scopeHash: "sha256:scope",
      budget: { maxItems: 10, maxBytes: 10000, hopCount: 1 },
      itemsByOutcome: items,
    });
    expect(r.items.length).toBe(3);
    expect(r.items[0].canonicalHash).toBe("sha256:h1");
    expect(r.items[1].canonicalHash).toBe("sha256:m1");
    expect(r.items[2].canonicalHash).toBe("sha256:l1");
  });

  it("excludes denied items from rank even when reappear in successful sources", () => {
    const denied = makeOutcome({ outcomeId: "D", sourceId: "src-1", sourceHandle: "alpha", outcome: "denied", policyDecision: { kind: "deny", reason: "policy", policyVersion: "federation-v1" } });
    const ok = makeOutcome({ outcomeId: "O", sourceId: "src-2", sourceHandle: "beta", outcome: "success" });
    const items = new Map<string, Array<{ id: string; content: string; score: number; canonicalHash: string }>>();
    items.set("D", [{ id: "denied-1", content: "bad", score: 0.99, canonicalHash: "sha256:dup" }]);
    items.set("O", [{ id: "ok-1", content: "good", score: 0.99, canonicalHash: "sha256:dup" }]);
    const r = mergeFederatedPack(db, {
      tenantId: "default-tenant", federationRunId: "run-2", outcomes: [denied, ok],
      scopeHash: "sha256:scope", budget: { maxItems: 10, maxBytes: 10000, hopCount: 1 }, itemsByOutcome: items,
    });
    expect(r.items.length).toBe(0);
  });

  it("respects maxItems budget (partial_bounded)", () => {
    const a = makeOutcome({ outcomeId: "A", sourceHandle: "alpha" });
    const items = new Map<string, Array<{ id: string; content: string; score: number; canonicalHash: string }>>();
    items.set("A", Array.from({ length: 10 }, (_, i) => ({ id: "i" + i, content: "c" + i, score: 1 - i * 0.01, canonicalHash: "sha256:c" + i })));
    const r = mergeFederatedPack(db, {
      tenantId: "default-tenant", federationRunId: "run-3", outcomes: [a],
      scopeHash: "sha256:scope", budget: { maxItems: 3, maxBytes: 100000, hopCount: 1 }, itemsByOutcome: items,
    });
    expect(r.items.length).toBe(3);
    expect(r.boundStatus).toBe("partial_bounded");
  });

  it("records duplicate outcome ids for authorized duplicate canonical hashes", () => {
    const a = makeOutcome({ outcomeId: "A", sourceHandle: "alpha" });
    const b = makeOutcome({ outcomeId: "B", sourceHandle: "beta" });
    const items = new Map<string, Array<{ id: string; content: string; score: number; canonicalHash: string }>>();
    items.set("A", [{ id: "first", content: "alpha", score: 0.7, canonicalHash: "sha256:dup" }]);
    items.set("B", [{ id: "second", content: "beta", score: 0.9, canonicalHash: "sha256:dup" }]);

    const r = mergeFederatedPack(db, {
      tenantId: "default-tenant",
      federationRunId: "run-dup",
      outcomes: [a, b],
      scopeHash: "sha256:scope",
      budget: { maxItems: 10, maxBytes: 10000, hopCount: 2 },
      itemsByOutcome: items,
    });

    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({
      canonicalId: "first",
      duplicateCount: 1,
      contributingOutcomeIds: ["A", "B"],
    });
    expect(r.dedupeMetadata).toMatchObject({ duplicates_total: 1, dedupe_keys: 1 });
  });

  it("marks over-budget before admitting an oversized item", () => {
    const a = makeOutcome({ outcomeId: "A", sourceHandle: "alpha" });
    const items = new Map<string, Array<{ id: string; content: string; score: number; canonicalHash: string }>>();
    items.set("A", [{ id: "too-large", content: "content-too-large", score: 1, canonicalHash: "sha256:large" }]);

    const r = mergeFederatedPack(db, {
      tenantId: "default-tenant",
      federationRunId: "run-bytes",
      outcomes: [a],
      scopeHash: "sha256:scope",
      budget: { maxItems: 10, maxBytes: 3, hopCount: 1 },
      itemsByOutcome: items,
    });

    expect(r.items).toEqual([]);
    expect(r.boundStatus).toBe("over_budget");
    expect(r.budgetMetadata).toMatchObject({ used_bytes: 0, used_items: 0 });
  });

  it("persists pack hash + contributing source ids to federation_merges + audit", () => {
    const a = makeOutcome({ outcomeId: "A", sourceId: "src-1", sourceHandle: "alpha" });
    db.prepare(
      `INSERT INTO federation_sources
        (id, tenant_id, source_handle, source_kind, purpose, allowed_operations_json, trust_level, enabled, has_expiry, transport, descriptor_json, registration_hash, created_by)
       VALUES ('src-1', 'default-tenant', 'alpha', 'memory', 'orchestration', '["search"]', 'trusted', 1, 0, 'local', '{}', 'sha256:registration', 'test')`
    ).run();
    const items = new Map<string, Array<{ id: string; content: string; score: number; canonicalHash: string }>>();
    const payloadSentinel = "never-persist-this-federated-payload";
    items.set("A", [{ id: "i1", content: payloadSentinel, score: 0.9, canonicalHash: "sha256:h1" }]);
    const r = mergeFederatedPack(db, {
      tenantId: "default-tenant", federationRunId: "run-4", outcomes: [a],
      scopeHash: "sha256:scope", budget: { maxItems: 10, maxBytes: 10000, hopCount: 1 }, itemsByOutcome: items,
    });
    expect(r.packHash.startsWith("sha256:")).toBe(true);
    expect(r.contributingSourceIds).toContain("src-1");
    const rows = db.prepare("SELECT pack_hash FROM federation_merges WHERE pack_hash = ?").all(r.packHash) as Array<{ pack_hash: string }>;
    expect(rows.length).toBe(1);
    const coordinates = db.prepare(
      "SELECT canonical_id, canonical_hash, source_id FROM federation_merged_coordinates WHERE pack_hash = ?"
    ).all(r.packHash);
    expect(coordinates).toEqual([{
      canonical_id: "i1",
      canonical_hash: "sha256:h1",
      source_id: "src-1",
    }]);
    expect(JSON.stringify(coordinates)).not.toContain(payloadSentinel);
    const audits = db.prepare("SELECT event_type FROM audit_entries WHERE event_type = ?").all("orch.federation.merge") as Array<{ event_type: string }>;
    expect(audits.length).toBeGreaterThanOrEqual(1);
  });
});

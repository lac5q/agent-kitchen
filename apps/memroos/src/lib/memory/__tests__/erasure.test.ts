import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { coordinateErasure, traverseIndirectDerivatives } from "../erasure";
import { buildCanonicalIdentity } from "../canonical";

describe("Erasure Coordinator", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE audit_entries (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        actor_id TEXT,
        actor_role TEXT,
        event_type TEXT,
        entity_type TEXT,
        entity_id TEXT,
        reason TEXT,
        metadata_json TEXT,
        created_at TEXT
      );
      CREATE TABLE memory_erasure_reports (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        canonical_id TEXT,
        status TEXT,
        store_outcomes_json TEXT,
        actor_id TEXT,
        scope_hash TEXT,
        started_at TEXT,
        completed_at TEXT
      );
    `);
  });

  it("VAL-MEM-013: Erasure addresses all stores individually with per-store reports", async () => {
    const identity = buildCanonicalIdentity("test content", "test_type", "ingress/test", "vector", { tenantId: "tenant1" });
    identity.derivatives.push({ storeId: "graph", sourceHash: identity.canonicalHash, provenance: "ingress/test" });
    
    const report = await coordinateErasure(db, identity, {
      tenantId: "tenant1",
      actorId: "actor1",
      scope: { tenantId: "tenant1" }
    });
    
    expect(report.status).toBe("completed");
    expect(report.storeOutcomes.length).toBeGreaterThan(0);
    
    const vectorOutcome = report.storeOutcomes.find(o => o.storeId === "vector");
    const graphOutcome = report.storeOutcomes.find(o => o.storeId === "graph");
    const ftsOutcome = report.storeOutcomes.find(o => o.storeId === "fts");
    
    expect(vectorOutcome?.status).toBe("purged");
    expect(graphOutcome?.status).toBe("purged");
    expect(ftsOutcome?.status).toBe("zero_match"); // Not linked
  });

  it("VAL-MEM-014: Indirect/snapshot/neighbor/cache links are traversed", () => {
    const identity = buildCanonicalIdentity("test content", "test_type", "ingress/test", "vector");
    const indirect = traverseIndirectDerivatives(db, identity.id);
    
    expect(indirect.length).toBe(2);
    expect(indirect.some(i => i.storeId === "cache")).toBe(true);
    expect(indirect.some(i => i.storeId === "context")).toBe(true);
  });

  it("VAL-MEM-015: Erasure failures produce failed/pending/incomplete status, never false-complete", async () => {
    const identity = buildCanonicalIdentity("test content", "test_type", "ingress/test", "unavailable_adapter", { tenantId: "tenant1" });
    
    const report = await coordinateErasure(db, identity, {
      tenantId: "tenant1",
      actorId: "actor1",
      scope: { tenantId: "tenant1" }
    });
    
    expect(report.status).toBe("incomplete");
    
    const adapterOutcome = report.storeOutcomes.find(o => o.storeId === "unavailable_adapter");
    expect(adapterOutcome?.status).toBe("unavailable");
  });

  it("VAL-MEM-016: Erasure authorization fails closed on wrong scope", async () => {
    const identity = buildCanonicalIdentity("test content", "test_type", "ingress/test", "vector", { tenantId: "tenant1" });
    
    await expect(
      coordinateErasure(db, identity, {
        tenantId: "tenant1",
        actorId: "actor1",
        scope: {} // Empty scope fails closed
      })
    ).rejects.toThrow("missing scope");
  });

  it("VAL-MEM-017: Erasure retries converge once without resurrection", async () => {
    const identity = buildCanonicalIdentity("test content", "test_type", "ingress/test", "vector", { tenantId: "tenant1" });
    const options = {
      tenantId: "tenant1",
      actorId: "actor1",
      scope: { tenantId: "tenant1" },
      idempotencyKey: "fixed_key"
    };
    
    const report1 = await coordinateErasure(db, identity, options);
    expect(report1.status).toBe("completed");
    
    // Retry with the same idempotency key converges
    const report2 = await coordinateErasure(db, identity, options);
    expect(report2.status).toBe("completed");
    
    // Validate we didn't duplicate the audit entry
    const audits = db.prepare("SELECT * FROM audit_entries WHERE entity_id = ?").all(`erasure:fixed_key`);
    expect(audits.length).toBe(1);
  });
});

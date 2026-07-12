// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

vi.mock("@/lib/ontology/validity", () => ({
  resolveOntologyValidity: vi.fn((_db, input) => ({
    ontologyId: "memroos.core",
    ontologyVersion: "1.0.0",
    ontologyContentHash: "sha256:ontology",
    namespace: "memroos",
    canonicalId: "memroos.Document",
    aliasMigrationPath: [],
    sourceId: "ontology-source",
    sourceHash: "sha256:ontology-source",
    derivativeType: "versioned_record",
    derivativeId: `${input.recordType}:${input.recordId}`,
  })),
}));

let db: import("better-sqlite3").Database;
let closeDb: () => void;
let testDbDir: string;

beforeEach(async () => {
  testDbDir = path.join(os.tmpdir(), `federation-action-${crypto.randomUUID()}`);
  fs.mkdirSync(testDbDir, { recursive: true });
  process.env.SQLITE_DB_PATH = path.join(testDbDir, "federation.db");
  vi.resetModules();
  const { getDb, closeDb: close } = await import("@/lib/db");
  const { initSchema } = await import("@/lib/db-schema");
  db = getDb();
  initSchema(db);
  closeDb = close;
  db.prepare("INSERT INTO tenants (id, name) VALUES ('tenant-a', 'Tenant A')").run();
  db.prepare(
    `INSERT INTO users (id, email, display_name, password_hash, tenant_id)
     VALUES ('operator', 'operator@example.test', 'Operator', 'test-hash', 'tenant-a')`
  ).run();
  db.prepare("INSERT INTO user_roles (user_id, role) VALUES ('operator', 'operator')").run();
  db.prepare(
    `INSERT INTO federation_sources
      (id, tenant_id, source_handle, source_kind, space_id, purpose, allowed_operations_json, trust_level, enabled, has_expiry, transport, descriptor_json, registration_hash, created_by)
     VALUES ('source-1', 'tenant-a', 'memory-a', 'memory', 'space-a', 'orchestration', '["search"]', 'trusted', 1, 0, 'local', '{}', 'sha256:registration', 'operator')`
  ).run();
  db.prepare(
    `INSERT INTO federation_source_outcomes
      (id, tenant_id, federation_run_id, source_id, outcome, reason_code, policy_decision, policy_version, result_count, result_bytes, duration_ms, scope_hash)
     VALUES ('outcome-1', 'tenant-a', 'federation-run-1', 'source-1', 'success', 'ok', 'allow', 'federation-v1', 1, 64, 1, 'sha256:scope')`
  ).run();
  db.prepare(
    `INSERT INTO federation_merges
      (id, tenant_id, federation_run_id, pack_hash, pack_bytes, pack_item_count, contributing_source_ids, contributing_outcome_ids, dedupe_metadata_json, rank_metadata_json, budget_metadata_json, bound_status, scope_hash)
     VALUES ('merge-1', 'tenant-a', 'federation-run-1', 'sha256:pack', 64, 1, '["source-1"]', '["outcome-1"]', '{}', '{}', '{}', 'bounded', 'sha256:scope')`
  ).run();
});

afterEach(() => {
  closeDb();
  fs.rmSync(testDbDir, { recursive: true, force: true });
});

async function bridge() {
  return import("../action-bridge");
}

const input = {
  tenantId: "tenant-a",
  spaceId: "space-a",
  federationRunId: "federation-run-1",
  packHash: "sha256:pack",
  ontologyRecords: [{ recordType: "message", recordId: "42" }],
};

describe("federation action proof continuity", () => {
  it("persists only validated, bounded, scoped federation proof and revalidates before use", async () => {
    const { persistFederationActionArtifact, resolveFederationActionProof } = await bridge();
    const created = persistFederationActionArtifact(db, input);
    expect(created.status).toBe("ready");
    if (created.status !== "ready") throw new Error(created.reason);
    expect(created.artifact.packHash).toBe("sha256:pack");
    expect(created.artifact.artifactHash).toMatch(/^sha256:/);
    const resolved = resolveFederationActionProof(db, {
      tenantId: "tenant-a",
      spaceId: "space-a",
      artifactId: created.artifact.id,
    });
    expect(resolved.status).toBe("ready");
    db.prepare("UPDATE federation_sources SET enabled = 0 WHERE id = 'source-1'").run();
    expect(resolveFederationActionProof(db, {
      tenantId: "tenant-a",
      spaceId: "space-a",
      artifactId: created.artifact.id,
    })).toEqual(expect.objectContaining({ status: "unavailable", reason: "federation_source_unavailable" }));
  });

  it("denies missing, unbounded, mismatched, or persistence-failed receipts before an action can bind", async () => {
    const { persistFederationActionArtifact } = await bridge();
    expect(persistFederationActionArtifact(db, { ...input, packHash: "sha256:missing" })).toEqual(
      expect.objectContaining({ status: "unavailable" }),
    );
    db.prepare("UPDATE federation_merges SET bound_status = 'over_budget'").run();
    expect(persistFederationActionArtifact(db, input)).toEqual(
      expect.objectContaining({ status: "denied", reason: "federation_pack_unbounded" }),
    );
    db.prepare("UPDATE federation_merges SET bound_status = 'bounded'").run();
    db.exec("DROP TABLE federation_action_artifacts");
    expect(persistFederationActionArtifact(db, input)).toEqual(
      expect.objectContaining({ status: "persistence_failed", reason: "federation_artifact_persistence_failed" }),
    );
  });

  it("invalidates future use as an erasure derivative without changing historical proof rows", async () => {
    const { persistFederationActionArtifact, registerFederationActionDerivatives, resolveFederationActionProof } = await bridge();
    const created = persistFederationActionArtifact(db, input);
    if (created.status !== "ready") throw new Error(created.reason);
    expect(registerFederationActionDerivatives(db, {
      tenantId: "tenant-a",
      artifactId: created.artifact.id,
      derivatives: [{ canonicalId: "canonical-42", canonicalHash: "sha256:canonical-42", sourceId: "source-1" }],
    }).status).toBe("ready");
    const before = db.prepare("SELECT artifact_hash FROM federation_action_artifacts WHERE id = ?").get(created.artifact.id) as { artifact_hash: string };
    const { coordinateErasure } = await import("@/lib/memory/erasure");
    const report = await coordinateErasure(db, {
      id: "canonical-42",
      canonicalHash: "sha256:canonical-42",
      derivatives: [{ storeId: "federation", sourceHash: "sha256:canonical-42", provenance: "test" }],
    }, {
      tenantId: "tenant-a",
      actorId: "operator",
      scope: { tenantId: "tenant-a", purpose: "erasure" },
    });
    expect(report.storeOutcomes).toContainEqual(expect.objectContaining({ storeId: "federation", status: "tombstoned" }));
    expect(resolveFederationActionProof(db, {
      tenantId: "tenant-a",
      spaceId: "space-a",
      artifactId: created.artifact.id,
    })).toEqual(expect.objectContaining({ status: "unavailable", reason: "federation_artifact_invalidated" }));
    const after = db.prepare("SELECT artifact_hash FROM federation_action_artifacts WHERE id = ?").get(created.artifact.id) as { artifact_hash: string };
    expect(after.artifact_hash).toBe(before.artifact_hash);
  });

  it("treats approved source erasure as a typed future-use denial", async () => {
    const { persistFederationActionArtifact, registerFederationActionDerivatives, resolveFederationActionProof } = await bridge();
    const created = persistFederationActionArtifact(db, input);
    if (created.status !== "ready") throw new Error(created.reason);
    registerFederationActionDerivatives(db, {
      tenantId: "tenant-a",
      artifactId: created.artifact.id,
      derivatives: [{ canonicalId: "canonical-42", canonicalHash: "sha256:canonical-42", sourceId: "source-1" }],
    });
    const { coordinateErasure } = await import("@/lib/memory/erasure");
    const report = await coordinateErasure(db, {
      id: "source-1",
      canonicalHash: "sha256:source-1",
      derivatives: [{ storeId: "federation", sourceHash: "sha256:source-1", provenance: "source-erasure" }],
    }, {
      tenantId: "tenant-a",
      actorId: "operator",
      scope: { tenantId: "tenant-a", purpose: "erasure" },
    });
    expect(report.status).toBe("completed");
    expect(resolveFederationActionProof(db, {
      tenantId: "tenant-a",
      spaceId: "space-a",
      artifactId: created.artifact.id,
    })).toEqual(expect.objectContaining({ status: "unavailable", reason: "federation_artifact_invalidated" }));
  });
});

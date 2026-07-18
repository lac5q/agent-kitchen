// @vitest-environment node
/**
 * VAL-ORCH-006: explicit registration, eligibility resolution.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { getFederationSource, registerFederationSource, listFederationSources, resolveEligibleSources } from "../source-registry";
import { ensureCanonicalUpperOntology } from "@/lib/ontology/registry";
import { revokeOntologySource } from "@/lib/ontology/validity";

let db: import("better-sqlite3").Database;
let closeDb: () => void;
let TEST_DB_DIR: string;
let ontologyReference: { tenantId: string; spaceId: string; recordType: string; recordId: string };

beforeEach(async () => {
  TEST_DB_DIR = path.join(os.tmpdir(), "federation-registry-" + crypto.randomUUID());
  fs.mkdirSync(TEST_DB_DIR, { recursive: true });
  process.env.SQLITE_DB_PATH = path.join(TEST_DB_DIR, "fed.db");
  vi.resetModules();
  const { getDb, closeDb: close } = await import("@/lib/db");
  const { initSchema } = await import("@/lib/db-schema");
  db = getDb();
  initSchema(db);
  const ontology = ensureCanonicalUpperOntology(db, "operator");
  ontologyReference = {
    tenantId: "default-tenant",
    spaceId: "space-1",
    recordType: "federation_source",
    recordId: "memory-alpha",
  };
  seedOntologyContext(db, ontology, ontologyReference);
  closeDb = close;
});

afterEach(() => {
  closeDb();
  if (fs.existsSync(TEST_DB_DIR)) fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
});

function okInput(overrides: Partial<Parameters<typeof registerFederationSource>[1]> = {}) {
  return {
    tenantId: "default-tenant",
    sourceHandle: "memory-alpha",
    sourceKind: "memory" as const,
    spaceId: "space-1",
    purpose: "memory_search",
    allowedOperations: ["search", "read"],
    trustLevel: "registered" as const,
    transport: "inproc" as const,
    createdBy: "operator-1",
    ontologyReference,
    ...overrides,
  };
}

function seedOntologyContext(
  target: import("better-sqlite3").Database,
  ontology: { ontologyId: string; version: string; contentHash: string },
  reference: { tenantId: string; spaceId: string; recordType: string; recordId: string },
) {
  const sourceId = `source:${reference.recordType}:${reference.recordId}`;
  const sourceHash = `sha256:${"a".repeat(64)}`;
  const derivativeId = `record:${reference.recordType}:${reference.recordId}`;
  const now = new Date().toISOString();
  target.prepare(
    `INSERT INTO ontology_versioned_records
      (id, tenant_id, space_id, record_type, record_id, qualified_type, ontology_id, ontology_version,
       ontology_content_hash, mapping_path_json, created_at, source_id, source_hash)
     VALUES (?, ?, ?, ?, ?, 'memory', ?, ?, ?, '[]', ?, ?, ?)`
  ).run(
    derivativeId, reference.tenantId, reference.spaceId, reference.recordType, reference.recordId,
    ontology.ontologyId, ontology.version, ontology.contentHash, now, sourceId, sourceHash,
  );
  target.prepare(
    `INSERT INTO ontology_source_lifecycle
      (tenant_id, space_id, source_id, source_hash, status, updated_at, updated_by, reason_code)
     VALUES (?, ?, ?, ?, 'active', ?, 'operator', 'test')`
  ).run(reference.tenantId, reference.spaceId, sourceId, sourceHash, now);
  target.prepare(
    `INSERT INTO ontology_derivative_validity
      (id, tenant_id, space_id, source_id, source_hash, derivative_type, derivative_id, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'versioned_record', ?, 'authoritative', ?)`
  ).run(`valid:${derivativeId}`, reference.tenantId, reference.spaceId, sourceId, sourceHash, derivativeId, now);
}

describe("VAL-ORCH-006 -- explicit registration", () => {
  it("registers a new source and writes an audit entry", () => {
    const r = registerFederationSource(db, okInput());
    expect(r.kind).toBe("registered");
    if (r.kind !== "registered") return;
    expect(r.source.tenantId).toBe("default-tenant");
    expect(r.source.registrationHash.startsWith("sha256:")).toBe(true);
    const rows = db.prepare("SELECT event_type FROM audit_entries WHERE event_type = ?").all("orch.federation.source.registered") as Array<{ event_type: string }>;
    expect(rows.length).toBeGreaterThan(0);
  });

  it("denies registration when required fields are missing", () => {
    const r = registerFederationSource(db, okInput({ sourceHandle: "" }));
    expect(r.kind).toBe("denied");
    const r2 = registerFederationSource(db, okInput({ allowedOperations: [] }));
    expect(r2.kind).toBe("denied");
    const r3 = registerFederationSource(db, okInput({ sourceKind: "invalid" as "memory" }));
    expect(r3.kind).toBe("denied");
  });

  it("denies absent, forged, and foreign ontology context coordinates", () => {
    expect(registerFederationSource(db, okInput({ ontologyReference: undefined })).kind).toBe("denied");
    expect(registerFederationSource(db, okInput({
      ontologyReference: { ...ontologyReference, recordId: "forged" },
    })).kind).toBe("denied");
    expect(registerFederationSource(db, okInput({
      ontologyReference: { ...ontologyReference, tenantId: "other-tenant" },
    })).kind).toBe("denied");
  });

  it("persists verified coordinates and rejects a revoked ontology source", () => {
    const registered = registerFederationSource(db, okInput());
    expect(registered).toMatchObject({
      kind: "registered",
      source: {
        ontologyContext: expect.objectContaining({
          recordType: ontologyReference.recordType,
          recordId: ontologyReference.recordId,
          canonicalId: "memory",
        }),
      },
    });
    if (registered.kind !== "registered" || !registered.source.ontologyContext) throw new Error("registration failed");
    revokeOntologySource(db, {
      tenantId: ontologyReference.tenantId,
      spaceId: ontologyReference.spaceId,
      sourceId: registered.source.ontologyContext.sourceId,
      sourceHash: registered.source.ontologyContext.sourceHash,
      actor: "operator",
      reason: "source_changed",
    });
    expect(registerFederationSource(db, okInput({ sourceHandle: "after-revocation" }))).toEqual({
      kind: "denied",
      reason: "ontology_context_unavailable",
    });
  });

  it("upserts on conflict (tenant, handle, kind)", () => {
    const a = registerFederationSource(db, okInput());
    const b = registerFederationSource(db, okInput({ purpose: "memory-promotion" }));
    if (a.kind !== "registered" || b.kind !== "registered") throw new Error("not registered");
    expect(a.source.id).toBe(b.source.id);
    expect(b.source.purpose).toBe("memory-promotion");
    const list = listFederationSources(db, "default-tenant");
    expect(list.length).toBe(1);
  });

  it("returns null for missing sources and tolerates malformed persisted JSON", () => {
    const registered = registerFederationSource(db, okInput({
      labelPolicyJson: { visibility: "internal" },
      descriptor: { endpoint: "local" },
    }));
    if (registered.kind !== "registered") throw new Error("not registered");

    expect(getFederationSource(db, "default-tenant", "missing")).toBeNull();
    db.prepare(
      `UPDATE federation_sources
          SET label_policy_json = ?,
              allowed_operations_json = ?,
              descriptor_json = ?,
              ontology_record_type = ''
        WHERE id = ?`
    ).run("[]", '{"not":"an array"}', "{bad-json", registered.source.id);

    const parsed = getFederationSource(db, "default-tenant", registered.source.id);
    expect(parsed).toMatchObject({
      labelPolicyJson: {},
      allowedOperations: [],
      descriptor: {},
      ontologyContext: null,
    });
  });

  it("filters un-registered (disabled) sources out of eligibility", () => {
    registerFederationSource(db, okInput({ enabled: false }));
    const list = listFederationSources(db, "default-tenant", { enabledOnly: true });
    expect(list.length).toBe(0);
    const eligible = resolveEligibleSources({ sources: listFederationSources(db, "default-tenant"), requiredOperation: "search" });
    const omitted = eligible.find((e) => e.kind === "omitted");
    expect(omitted).toBeDefined();
    if (omitted && omitted.kind === "omitted") expect(omitted.reason).toBe("source_disabled");
  });

  it("filters revoked trust and unknown trust sources out", () => {
    registerFederationSource(db, okInput({ sourceHandle: "revoked", trustLevel: "revoked" }));
    registerFederationSource(db, okInput({ sourceHandle: "unknown", trustLevel: "unknown" }));
    const list = listFederationSources(db, "default-tenant");
    const eligible = resolveEligibleSources({ sources: list, requiredOperation: "search" });
    expect(eligible.every((e) => e.kind === "omitted" && (e.reason === "source_trust_revoked_or_unknown"))).toBe(true);
  });

  it("filters expired sources", () => {
    const past = new Date(Date.now() - 1000).toISOString();
    registerFederationSource(db, okInput({ sourceHandle: "expired", hasExpiry: true, expiresAt: past }));
    const list = listFederationSources(db, "default-tenant");
    const eligible = resolveEligibleSources({ sources: list, requiredOperation: "search" });
    expect(eligible.length).toBe(1);
    expect(eligible[0].kind).toBe("omitted");
    if (eligible[0].kind === "omitted") expect(eligible[0].reason).toBe("source_expired");
  });

  it("keeps unexpired and expiry-less sources eligible", () => {
    registerFederationSource(db, okInput({
      sourceHandle: "future-expiry",
      hasExpiry: true,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }));
    registerFederationSource(db, okInput({
      sourceHandle: "missing-expiry",
      hasExpiry: true,
      expiresAt: null,
    }));

    const eligible = resolveEligibleSources({
      sources: listFederationSources(db, "default-tenant"),
      requiredOperation: "search",
    });

    expect(eligible.every((entry) => entry.kind === "eligible")).toBe(true);
  });

  it("filters sources whose allowedOperations do not include the operation", () => {
    registerFederationSource(db, okInput({ allowedOperations: ["write"] }));
    const list = listFederationSources(db, "default-tenant");
    const eligible = resolveEligibleSources({ sources: list, requiredOperation: "search" });
    expect(eligible[0].kind).toBe("omitted");
    if (eligible[0].kind === "omitted") expect(eligible[0].reason).toBe("operation_not_allowed");
  });
});

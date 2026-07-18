import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock auth so the route gets a valid operator session.
vi.mock("@/lib/auth/session", () => ({
  authenticateUser: async () => ({
    userId: "operator-1",
    role: "operator",
    tenantId: "default-tenant",
    email: "operator@example.com",
    displayName: "Operator",
  }),
}));
vi.mock("@/lib/auth/middleware-roles", () => ({
  requireRole: () => null,
}));

// Use a fresh tmpdir for the in-memory DB so initSchema is exercised.
const TMP_ROOT = path.join(os.tmpdir(), `memroos-policy-knowledge-${crypto.randomUUID()}`);

let db: Database.Database | null = null;

async function freshDb(): Promise<Database.Database> {
  fs.mkdirSync(TMP_ROOT, { recursive: true });
  const dbPath = path.join(TMP_ROOT, `db-${crypto.randomUUID()}.db`);
  process.env["SQLITE_DB_PATH"] = dbPath;
  process.env["MEMROOS_ROOT"] = TMP_ROOT;
  vi.resetModules();
  const dbModule = await import("@/lib/db");
  const { initSchema } = await import("@/lib/db-schema");
  const opened = dbModule.getDb();
  initSchema(opened);
  return opened;
}

const seedOntologyRecord = (
  db: Database.Database,
  args: {
    recordId: string;
    spaceId: string;
    ontologyId: string;
    ontologyVersion: string;
    ontologyContentHash: string;
    sourceId?: string;
    sourceHash?: string;
    sourceStatus?: "active" | "revoked" | "changed" | "erased";
    derivativeStatus?: "authoritative" | "revoked";
  },
) => {
  const sourceId = args.sourceId ?? `source-${args.recordId}`;
  const sourceHash = args.sourceHash ?? `sha256:${"a".repeat(64)}`;
  const derivativeId = `versioned-${args.recordId}`;
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO ontology_versioned_records
      (id, tenant_id, space_id, record_type, record_id, qualified_type, ontology_id,
       ontology_version, ontology_content_hash, mapping_path_json, created_at, source_id, source_hash)
     VALUES (?, ?, ?, 'knowledge', ?, 'memory', ?, ?, ?, '[]', ?, ?, ?)`
  ).run(
    derivativeId,
    "default-tenant",
    args.spaceId,
    args.recordId,
    args.ontologyId,
    args.ontologyVersion,
    args.ontologyContentHash,
    now,
    sourceId,
    sourceHash,
  );
  db.prepare(
    `INSERT INTO ontology_source_lifecycle
      (tenant_id, space_id, source_id, source_hash, status, updated_at, updated_by, reason_code)
      VALUES (?, ?, ?, ?, ?, ?, 'operator', 'test')`
  ).run(
    "default-tenant",
    args.spaceId,
    sourceId,
    sourceHash,
    args.sourceStatus ?? "active",
    now,
  );
  db.prepare(
    `INSERT INTO ontology_derivative_validity
      (id, tenant_id, space_id, source_id, source_hash, derivative_type, derivative_id, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'versioned_record', ?, ?, ?)`
  ).run(
    `valid-${args.recordId}`,
    "default-tenant",
    args.spaceId,
    sourceId,
    sourceHash,
    derivativeId,
    args.derivativeStatus ?? "authoritative",
    now,
  );
  return { sourceId, sourceHash, derivativeId };
};

beforeEach(async () => {
  db = await freshDb();
});

afterEach(() => {
  if (db) {
    db.close();
    db = null;
  }
  vi.resetModules();
  try {
    fs.rmSync(TMP_ROOT, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("https://memroos.example.com/api/policy/knowledge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/policy/knowledge", () => {
  it("rejects invalid JSON and missing action before policy evaluation", async () => {
    const { POST } = await import("../route");
    const invalidJson = await POST(
      new Request("https://memroos.example.com/api/policy/knowledge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }) as never,
    );
    expect(invalidJson.status).toBe(400);
    expect(await invalidJson.json()).toEqual({ error: "invalid json body" });

    const missingAction = await POST(
      makeRequest({
        ontologyReference: {
          tenantId: "default-tenant",
          spaceId: "space",
          recordType: "knowledge",
          recordId: "record",
        },
      }) as never,
    );
    expect(missingAction.status).toBe(400);
    expect(await missingAction.json()).toEqual({ error: "action is required" });
  });

  it("rejects caller-supplied ontology context (forged hash)", async () => {
    const { POST } = await import("../route");
    const response = await POST(
      makeRequest({
        action: "knowledge.read",
        ontologyContext: {
          ontologyId: "forged",
          ontologyVersion: "1.0.0",
          ontologyContentHash: "sha256:forged",
          namespace: "forged",
          canonicalId: "forged",
          aliasMigrationPath: [],
        },
        ontologyReference: {
          tenantId: "default-tenant",
          spaceId: "any-space",
          recordType: "knowledge",
          recordId: "any-record",
        },
      }) as never,
    );
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toContain("caller-supplied ontology context is not accepted");
  });

  it("denies absence: a missing ontologyReference returns a deterministic 400 with reason ontology_context_unavailable", async () => {
    const { POST } = await import("../route");
    const response = await POST(
      makeRequest({ action: "knowledge.read" }) as never,
    );
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json).toMatchObject({
      error: "ontology_reference_required",
      reason: "ontology_context_unavailable",
    });
  });

  it("returns an allow receipt when the caller-supplied ontologyReference resolves to a server-owned authoritative context", async () => {
    const { ensureCanonicalUpperOntology } = await import("@/lib/ontology/registry");
    const ontology = ensureCanonicalUpperOntology(db!, "operator");
    seedOntologyRecord(db!, {
      recordId: "knowledge-record-ok",
      spaceId: "knowledge-space-ok",
      ontologyId: ontology.ontologyId,
      ontologyVersion: ontology.version,
      ontologyContentHash: ontology.contentHash,
    });

    const { POST } = await import("../route");
    const response = await POST(
      makeRequest({
        action: "knowledge.read",
        ontologyReference: {
          tenantId: "default-tenant",
          spaceId: "knowledge-space-ok",
          recordType: "knowledge",
          recordId: "knowledge-record-ok",
        },
      }) as never,
    );
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.ok).toBe(true);
    expect(json.outcome).toBe("allow");
    expect(json.reason).toBe("knowledge_policy_delegated");
    expect(json.ontology).toMatchObject({
      ontologyId: ontology.ontologyId,
      canonicalId: "memory",
    });
  });

  it("denies when the ontologyReference resolves to a revoked source", async () => {
    const { ensureCanonicalUpperOntology } = await import("@/lib/ontology/registry");
    const ontology = ensureCanonicalUpperOntology(db!, "operator");
    seedOntologyRecord(db!, {
      recordId: "knowledge-record-revoked",
      spaceId: "knowledge-space-revoked",
      ontologyId: ontology.ontologyId,
      ontologyVersion: ontology.version,
      ontologyContentHash: ontology.contentHash,
      sourceStatus: "revoked",
      derivativeStatus: "revoked",
    });

    const { POST } = await import("../route");
    const response = await POST(
      makeRequest({
        action: "knowledge.read",
        ontologyReference: {
          tenantId: "default-tenant",
          spaceId: "knowledge-space-revoked",
          recordType: "knowledge",
          recordId: "knowledge-record-revoked",
        },
      }) as never,
    );
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toMatch(/ontology context/i);
  });
});

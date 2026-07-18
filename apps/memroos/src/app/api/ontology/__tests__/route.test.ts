// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

const TEST_ROOT = path.join(os.tmpdir(), `ontology-route-${crypto.randomUUID()}`);
const TEST_DB_PATH = path.join(TEST_ROOT, "ontology.db");
const SOURCE_HASH = `sha256:${"a".repeat(64)}`;

let ontologyRoute: typeof import("../route");
let closeDb: (() => void) | undefined;

function operatorRequest(url: string, init: RequestInit = {}): Request {
  return new Request(`http://localhost${url}`, init);
}

async function ensureCanonical() {
  const response = await ontologyRoute.POST(operatorRequest("/api/ontology", {
    method: "POST",
    body: JSON.stringify({ action: "ensure_canonical", actor: "operator" }),
  }));
  expect(response.status).toBe(200);
  return await response.json() as {
    ok: boolean;
    ontology: { ontologyId: string; version: string; contentHash: string };
  };
}

beforeEach(async () => {
  fs.rmSync(TEST_ROOT, { recursive: true, force: true });
  fs.mkdirSync(TEST_ROOT, { recursive: true });
  process.env["MEMROOS_ROOT"] = TEST_ROOT;
  process.env["SQLITE_DB_PATH"] = TEST_DB_PATH;
  vi.resetModules();
  ontologyRoute = await import("../route");
  closeDb = (await import("@/lib/db")).closeDb;
});

afterEach(() => {
  closeDb?.();
  closeDb = undefined;
  delete process.env["MEMROOS_ROOT"];
  delete process.env["SQLITE_DB_PATH"];
  fs.rmSync(TEST_ROOT, { recursive: true, force: true });
});

describe("ontology registry route", () => {
  it("ensures the canonical ontology and exposes its published discovery contract", async () => {
    const canonical = await ensureCanonical();
    expect(canonical.ok).toBe(true);

    const response = ontologyRoute.GET(operatorRequest("/api/ontology"));
    expect(response.status).toBe(200);
    const body = await response.json() as {
      ok: boolean;
      ontology: {
        status: string;
        ontologyId: string;
        version: string;
        contentHash: string;
        definitions: Array<{ id: string }>;
      };
    };

    expect(body.ok).toBe(true);
    expect(body.ontology).toMatchObject({
      status: "published",
      ontologyId: canonical.ontology.ontologyId,
      version: canonical.ontology.version,
      contentHash: canonical.ontology.contentHash,
    });
    expect(body.ontology.definitions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "entity" }),
      expect.objectContaining({ id: "agent" }),
      expect.objectContaining({ id: "memory" }),
      expect.objectContaining({ id: "provenance" }),
      expect.objectContaining({ id: "policy" }),
    ]));
  });

  it("returns 404 for an explicit unknown ontology version rather than falling back", async () => {
    await ensureCanonical();

    const response = ontologyRoute.GET(operatorRequest("/api/ontology?version=9.9.9"));
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: "ontology request rejected",
      code: "not_found",
    });
  });

  it("persists explicit ontology coordinates when binding provenance", async () => {
    const canonical = await ensureCanonical();
    const response = await ontologyRoute.POST(operatorRequest("/api/ontology", {
      method: "POST",
      body: JSON.stringify({
        action: "bind_provenance",
        recordType: "memory",
        recordId: "route-memory-1",
        ontologyId: canonical.ontology.ontologyId,
        ontologyVersion: canonical.ontology.version,
        ontologyContentHash: canonical.ontology.contentHash,
        actor: "operator",
      }),
    }));
    expect(response.status).toBe(200);
    const bound = await response.json() as {
      ok: boolean;
      binding: { ontologyId: string; ontologyVersion: string; ontologyContentHash: string };
    };
    expect(bound).toMatchObject({
      ok: true,
      binding: {
        ontologyId: canonical.ontology.ontologyId,
        ontologyVersion: canonical.ontology.version,
        ontologyContentHash: canonical.ontology.contentHash,
      },
    });

    const persistedResponse = ontologyRoute.GET(operatorRequest("/api/ontology?recordType=memory&recordId=route-memory-1"));
    expect(persistedResponse.status).toBe(200);
    expect(await persistedResponse.json()).toMatchObject({
      ok: true,
      binding: {
        ontologyId: canonical.ontology.ontologyId,
        ontologyVersion: canonical.ontology.version,
        ontologyContentHash: canonical.ontology.contentHash,
      },
    });
  });

  it("does not expose raw domain pack source input in its response", async () => {
    const canonical = await ensureCanonical();
    const sentinel = "RAW-PACK-SOURCE-MUST-NOT-RETURN";
    const response = await ontologyRoute.POST(operatorRequest("/api/ontology", {
      method: "POST",
      body: JSON.stringify({
        action: "register_pack",
        namespace: "finance.ops",
        owner: "finance",
        version: "1.0.0",
        sourceHash: SOURCE_HASH,
        source: sentinel,
        provenanceSummary: {
          sourceId: "src_finance_pack",
          classification: "internal",
          importedAt: "2026-07-12T00:00:00Z",
          references: ["ref_finance_pack"],
        },
        ontology: {
          id: canonical.ontology.ontologyId,
          version: canonical.ontology.version,
          contentHash: canonical.ontology.contentHash,
        },
        types: [{
          id: "finance.ops.invoice",
          semantics: { kind: "entity" },
          extends: {
            kind: "core",
            id: "entity",
            ontologyId: canonical.ontology.ontologyId,
            ontologyVersion: canonical.ontology.version,
            ontologyContentHash: canonical.ontology.contentHash,
          },
        }],
        actor: "operator",
      }),
    }));
    expect(response.status).toBe(200);
    const body = await response.json() as {
      ok: boolean;
      pack: { ontology: { id: string; version: string; contentHash: string } };
    };
    expect(body).toMatchObject({
      ok: true,
      pack: {
        ontology: {
          id: canonical.ontology.ontologyId,
          version: canonical.ontology.version,
          contentHash: canonical.ontology.contentHash,
        },
      },
    });
    expect(JSON.stringify(body)).not.toContain(sentinel);
  });

  it("redacts pack provenance from POST, GET, and invalid mutation errors", async () => {
    const canonical = await ensureCanonical();
    const sentinel = "RAW-PROVENANCE-ROUTE-SENTINEL";
    const base = {
      action: "register_pack",
      namespace: "redacted.pack",
      owner: "finance",
      version: "1.0.0",
      sourceHash: SOURCE_HASH,
      ontology: {
        id: canonical.ontology.ontologyId,
        version: canonical.ontology.version,
        contentHash: canonical.ontology.contentHash,
      },
      types: [{
        id: "redacted.pack.invoice",
        semantics: {},
        extends: {
          kind: "core",
          id: "entity",
          ontologyId: canonical.ontology.ontologyId,
          ontologyVersion: canonical.ontology.version,
          ontologyContentHash: canonical.ontology.contentHash,
        },
      }],
      actor: "operator",
    };
    const rejected = await ontologyRoute.POST(operatorRequest("/api/ontology", {
      method: "POST",
      body: JSON.stringify({
        ...base,
        provenanceSummary: {
          sourceId: "src_redacted",
          classification: "internal",
          importedAt: "2026-07-12T00:00:00Z",
          references: ["ref_redacted"],
          nested: { payload: sentinel },
        },
      }),
    }));
    expect(rejected.status).toBe(400);
    expect(JSON.stringify(await rejected.json())).not.toContain(sentinel);

    const created = await ontologyRoute.POST(operatorRequest("/api/ontology", {
      method: "POST",
      body: JSON.stringify({
        ...base,
        provenanceSummary: {
          sourceId: "src_redacted",
          classification: "internal",
          importedAt: "2026-07-12T00:00:00Z",
          references: ["ref_redacted"],
        },
      }),
    }));
    const body = await created.json() as { ok: boolean; pack: { id: string; provenanceSummary: unknown } };
    expect(body.ok).toBe(true);
    expect(JSON.stringify(body)).not.toContain(sentinel);
    expect(body.pack.provenanceSummary).toEqual({
      sourceId: "src_redacted",
      classification: "internal",
      importedAt: "2026-07-12T00:00:00Z",
      references: ["ref_redacted"],
    });

    const fetched = ontologyRoute.GET(operatorRequest(`/api/ontology?packId=${body.pack.id}`));
    expect(JSON.stringify(await fetched.json())).not.toContain(sentinel);
  });

  it("rejects pack-core impersonation atomically while accepting approved hash-pinned dependencies", async () => {
    const canonical = await ensureCanonical();
    const ontology = {
      id: canonical.ontology.ontologyId,
      version: canonical.ontology.version,
      contentHash: canonical.ontology.contentHash,
    };
    const baseResponse = await ontologyRoute.POST(operatorRequest("/api/ontology", {
      method: "POST",
      body: JSON.stringify({
        action: "register_pack",
        namespace: "route.base",
        owner: "ops",
        version: "1.0.0",
        sourceHash: SOURCE_HASH,
        provenanceSummary: {
          sourceId: "src_route_base",
          classification: "internal",
          importedAt: "2026-07-12T00:00:00Z",
          references: ["ref_route_base"],
        },
        ontology,
        types: [{
          id: "route.base.record",
          aliases: ["route.base.record-alias"],
          semantics: {},
          extends: {
            kind: "core",
            id: "entity",
            ontologyId: ontology.id,
            ontologyVersion: ontology.version,
            ontologyContentHash: ontology.contentHash,
          },
        }],
        actor: "operator",
      }),
    }));
    expect(baseResponse.status).toBe(200);
    const base = await baseResponse.json() as { pack: { id: string } };
    const approval = await ontologyRoute.POST(operatorRequest("/api/ontology", {
      method: "POST",
      body: JSON.stringify({ action: "transition_pack", packId: base.pack.id, toState: "approved", actor: "operator" }),
    }));
    expect(approval.status).toBe(200);
    const db = (await import("@/lib/db")).getDb();
    const beforePacks = db.prepare(`SELECT COUNT(*) AS count FROM ontology_packs`).get() as { count: number };
    const beforeAudits = db.prepare(`SELECT COUNT(*) AS count FROM audit_entries WHERE event_type = 'ontology_pack_registered'`).get() as { count: number };

    const impersonation = await ontologyRoute.POST(operatorRequest("/api/ontology", {
      method: "POST",
      body: JSON.stringify({
        action: "register_pack",
        namespace: "route.impersonation",
        owner: "ops",
        version: "1.0.0",
        sourceHash: SOURCE_HASH,
        provenanceSummary: {
          sourceId: "src_route_impersonation",
          classification: "internal",
          importedAt: "2026-07-12T00:00:00Z",
          references: ["ref_route_impersonation"],
        },
        ontology,
        dependencies: [{ namespace: "route.base", version: "1.0.0", sourceHash: SOURCE_HASH }],
        types: [{
          id: "route.impersonation.child",
          semantics: {},
          extends: {
            kind: "core",
            id: "route.base.record-alias",
            ontologyId: ontology.id,
            ontologyVersion: ontology.version,
            ontologyContentHash: ontology.contentHash,
          },
        }],
        actor: "operator",
      }),
    }));
    expect(impersonation.status).toBe(400);
    expect(await impersonation.json()).toMatchObject({ ok: false, code: "incompatible" });
    expect(db.prepare(`SELECT COUNT(*) AS count FROM ontology_packs`).get()).toEqual(beforePacks);
    expect(db.prepare(`SELECT COUNT(*) AS count FROM audit_entries WHERE event_type = 'ontology_pack_registered'`).get()).toEqual(beforeAudits);

    const dependencyExtension = await ontologyRoute.POST(operatorRequest("/api/ontology", {
      method: "POST",
      body: JSON.stringify({
        action: "register_pack",
        namespace: "route.dependency",
        owner: "ops",
        version: "1.0.0",
        sourceHash: SOURCE_HASH,
        provenanceSummary: {
          sourceId: "src_route_dependency",
          classification: "internal",
          importedAt: "2026-07-12T00:00:00Z",
          references: ["ref_route_dependency"],
        },
        ontology,
        dependencies: [{ namespace: "route.base", version: "1.0.0", sourceHash: SOURCE_HASH }],
        types: [{
          id: "route.dependency.child",
          semantics: {},
          extends: {
            kind: "dependency",
            id: "route.base.record-alias",
            namespace: "route.base",
            version: "1.0.0",
            sourceHash: SOURCE_HASH,
          },
        }],
        relationships: [{ from: "route.dependency.child", to: "route.base.record-alias", type: "is_a" }],
        actor: "operator",
      }),
    }));
    expect(dependencyExtension.status).toBe(200);
    expect(await dependencyExtension.json()).toMatchObject({
      ok: true,
      pack: { relationships: [{ from: "route.dependency.child", to: "route.base.record-alias", type: "is_a" }] },
    });
  });

  it("revokes changed source candidates through the authenticated route", async () => {
    const extracted = await ontologyRoute.POST(operatorRequest("/api/ontology", {
      method: "POST",
      body: JSON.stringify({
        action: "extract_candidate",
        tenantId: "route-tenant",
        spaceId: "route-space",
        sourceId: "route-source",
        sourceHash: SOURCE_HASH,
        sourceSpans: ["span:1"],
        extractorId: "route-extractor",
        extractorVersion: "1.0.0",
        candidateKind: "type",
        namespace: "finance",
        proposed: { id: "finance.invoice", semantics: { kind: "entity" } },
        confidenceLabel: "high",
        confidenceScore: 0.9,
        actor: "operator",
      }),
    }));
    const candidate = await extracted.json() as { candidate: { id: string } };
    const revoked = await ontologyRoute.POST(operatorRequest("/api/ontology", {
      method: "POST",
      body: JSON.stringify({
        action: "revoke_source",
        tenantId: "route-tenant",
        spaceId: "route-space",
        sourceId: "route-source",
        sourceHash: SOURCE_HASH,
        actor: "operator",
        reason: "source_erased",
      }),
    }));
    expect(revoked.status).toBe(200);
    expect(await revoked.json()).toMatchObject({ ok: true, revocation: { reason: "source_erased" } });
    const persisted = ontologyRoute.GET(operatorRequest(`/api/ontology?candidateId=${candidate.candidate.id}&tenantId=route-tenant&spaceId=route-space`));
    expect(await persisted.json()).toMatchObject({ candidate: { status: "invalidated" } });
  });

  it("rejects caller-authoritative migration execution record subsets", async () => {
    const response = await ontologyRoute.POST(operatorRequest("/api/ontology", {
      method: "POST",
      body: JSON.stringify({
        action: "execute_migration",
        planId: "forged-plan",
        tenantId: "tenant-a",
        spaceId: "space-a",
        actor: "operator",
        records: [{ recordType: "memory", recordId: "forged", sourceType: "legacy" }],
      }),
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: "ontology request rejected",
      code: "invalid",
    });
  });

  it("rejects remote ontology reads and writes without operator credentials", async () => {
    const get = ontologyRoute.GET(new Request("https://memroos.example/api/ontology"));
    expect(get.status).toBe(403);

    const post = await ontologyRoute.POST(new Request("https://memroos.example/api/ontology", {
      method: "POST",
      body: JSON.stringify({ action: "ensure_canonical", actor: "operator" }),
    }));
    expect(post.status).toBe(403);
  });

  it("normalizes malformed POST bodies and unknown actions into safe invalid responses", async () => {
    const malformed = await ontologyRoute.POST(operatorRequest("/api/ontology", {
      method: "POST",
      body: "{not-json",
    }));
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toMatchObject({
      ok: false,
      error: "ontology request rejected",
      code: "invalid",
    });

    const nonObject = await ontologyRoute.POST(operatorRequest("/api/ontology", {
      method: "POST",
      body: JSON.stringify(null),
    }));
    expect(nonObject.status).toBe(400);
    expect(await nonObject.json()).toMatchObject({ ok: false, code: "invalid" });

    const unknown = await ontologyRoute.POST(operatorRequest("/api/ontology", {
      method: "POST",
      body: JSON.stringify({ action: "not_a_real_action" }),
    }));
    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toMatchObject({
      ok: false,
      error: "ontology request rejected",
      code: "invalid",
    });
  });

  it("returns safe GET errors for incomplete alias resolution requests", async () => {
    await ensureCanonical();

    const response = ontologyRoute.GET(operatorRequest("/api/ontology?alias=invoice&namespace=finance"));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: "ontology request rejected",
      code: "invalid",
    });
  });

  it("routes publish and projection reconciliation requests through safe responses", async () => {
    const { canonicalContentHash, ONTOLOGY_PROJECTIONS } = await import("@/lib/ontology/registry");
    const document = {
      id: "route.custom",
      version: "1.0.0",
      definitions: [{ id: "route.custom.entity", semantics: { kind: "entity" } }],
      relationships: [] as Array<{ from: string; to: string; type: string }>,
    };
    const contentHash = canonicalContentHash(document);

    const published = await ontologyRoute.POST(operatorRequest("/api/ontology", {
      method: "POST",
      body: JSON.stringify({
        action: "publish",
        ...document,
        projections: ONTOLOGY_PROJECTIONS.map((projection) => ({ projection, contentHash })),
        actor: "operator",
      }),
    }));
    expect(published.status).toBe(400);
    const publishedBody = await published.json();
    expect(publishedBody).toMatchObject({
      ok: false,
    });

    const reconciled = await ontologyRoute.POST(operatorRequest("/api/ontology", {
      method: "POST",
      body: JSON.stringify({
        action: "reconcile_projection",
        ontologyId: "route.custom",
        version: "1.0.0",
        projection: "git",
        contentHash,
        status: "stale",
        actor: "operator",
      }),
    }));
    expect(reconciled.status).toBe(400);
    const reconciledBody = await reconciled.json();
    expect(reconciledBody).toMatchObject({
      ok: false,
    });
  });

  it("routes ontology candidate, alias, and migration actions through safe handlers", async () => {
    const canonical = await ensureCanonical();
    const aliasResponse = await ontologyRoute.POST(operatorRequest("/api/ontology", {
      method: "POST",
      body: JSON.stringify({
        action: "register_alias",
        ontologyId: canonical.ontology.ontologyId,
        ontologyVersion: canonical.ontology.version,
        ontologyContentHash: canonical.ontology.contentHash,
        namespace: "route.alias",
        alias: "Invoice",
        canonicalId: "entity",
        actor: "operator",
        reason: "test alias",
      }),
    }));
    expect(aliasResponse.status).toBe(400);
    const aliasBody = await aliasResponse.json() as { alias?: { id: string } };

    const transitionAlias = await ontologyRoute.POST(operatorRequest("/api/ontology", {
      method: "POST",
      body: JSON.stringify({
        action: "transition_alias",
        aliasId: aliasBody.alias?.id ?? "missing-alias",
        aliasAction: "deprecate",
        actor: "operator",
        reason: "superseded",
      }),
    }));
    expect(transitionAlias.status).toBe(400);

    const policyContext = await ontologyRoute.POST(operatorRequest("/api/ontology", {
      method: "POST",
      body: JSON.stringify({
        action: "register_policy_context",
        tenantId: "route-tenant",
        spaceId: "route-space",
        contextHash: "policy-hash",
        policyVersion: "1.0.0",
        actor: "operator",
        expiresAt: "2027-01-01T00:00:00Z",
      }),
    }));
    expect(policyContext.status).toBe(400);
    expect(await policyContext.json()).toMatchObject({
      ok: false,
      code: "invalid",
    });

    for (const body of [
      {
        action: "decide_candidate",
        candidateId: "missing-candidate",
        tenantId: "route-tenant",
        spaceId: "route-space",
        decision: "reject",
        reviewerId: "operator",
        reason: "not found",
      },
      {
        action: "promote_candidate",
        candidateId: "missing-candidate",
        tenantId: "route-tenant",
        spaceId: "route-space",
        sealProposalId: "seal-proposal",
        sealDecisionId: "seal-decision",
        ontologyId: canonical.ontology.ontologyId,
        ontologyVersion: canonical.ontology.version,
        ontologyContentHash: canonical.ontology.contentHash,
        namespace: "route.alias",
        policyContextHash: "policy-hash",
        reviewerId: "operator",
        idempotencyKey: "promote-missing",
        expiresAt: "2027-01-01T00:00:00Z",
      },
      {
        action: "plan_migration",
        tenantId: "route-tenant",
        spaceId: "route-space",
        source: { ontologyId: canonical.ontology.ontologyId, version: canonical.ontology.version, hash: canonical.ontology.contentHash },
        target: { ontologyId: "route.missing", version: "9.9.9", hash: "sha256:missing" },
        mappings: { entity: ["route.missing.entity"] },
        actor: "operator",
      },
      {
        action: "approve_migration",
        planId: "missing-plan",
        tenantId: "route-tenant",
        spaceId: "route-space",
        planHash: "plan-hash",
        actor: "operator",
      },
    ]) {
      const response = await ontologyRoute.POST(operatorRequest("/api/ontology", {
        method: "POST",
        body: JSON.stringify(body),
      }));
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        ok: false,
        error: "ontology request rejected",
      });
    }
  });
});

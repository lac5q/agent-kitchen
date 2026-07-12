// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

const TMP_ROOT = path.join(os.tmpdir(), `ontology-registry-${crypto.randomUUID()}`);
const SOURCE_HASH = `sha256:${"a".repeat(64)}`;

let db: import("better-sqlite3").Database;
let closeDb: () => void;

async function loadDb() {
  process.env["MEMROOS_ROOT"] = TMP_ROOT;
  process.env["SQLITE_DB_PATH"] = path.join(TMP_ROOT, `ontology-${crypto.randomUUID()}.db`);
  vi.resetModules();
  const database = await import("@/lib/db");
  db = database.getDb();
  closeDb = database.closeDb;
}

beforeEach(async () => {
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
  fs.mkdirSync(TMP_ROOT, { recursive: true });
  await loadDb();
});

afterEach(() => {
  closeDb?.();
  delete process.env["MEMROOS_ROOT"];
  delete process.env["SQLITE_DB_PATH"];
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
});

async function registry() {
  return import("../registry");
}

async function canonical() {
  const mod = await registry();
  return { mod, ontology: mod.ensureCanonicalUpperOntology(db, "operator") };
}

function nextDocument(mod: Awaited<ReturnType<typeof registry>>, parent: { version: string; contentHash: string }) {
  return {
    id: mod.UPPER_ONTOLOGY_ID,
    version: "1.1.0",
    definitions: [
      ...mod.CORE_VOCABULARY,
      { id: "project", aliases: ["workspace_project"], semantics: { kind: "entity", description: "A bounded operating project." } },
    ],
    relationships: [
      { from: "agent", to: "entity", type: "is_a" },
      { from: "memory", to: "entity", type: "is_a" },
      { from: "provenance", to: "entity", type: "is_a" },
      { from: "policy", to: "entity", type: "is_a" },
      { from: "project", to: "entity", type: "is_a" },
    ],
    parent: { ontologyId: mod.UPPER_ONTOLOGY_ID, version: parent.version, contentHash: parent.contentHash },
  };
}

describe("ontology registry validation", () => {
  it("VAL-ONTO-001 creates one canonical active upper ontology with stable hashes and strict version lookup", async () => {
    const { mod, ontology } = await canonical();
    expect(ontology.contentHash).toBe(mod.canonicalContentHash({
      id: ontology.ontologyId, version: ontology.version, definitions: ontology.definitions, relationships: ontology.relationships,
    }));
    expect(mod.discoverOntology(db).version).toBe("1.0.0");
    expect(mod.discoverOntology(db, { version: "1.0.0" }).requested).toBe(true);
    expect(() => mod.discoverOntology(db, { version: "9.9.9" })).toThrow(/Unknown ontology version/);
    expect(db.prepare(`SELECT COUNT(*) AS count FROM ontology_registry`).get()).toMatchObject({ count: 1 });
  });

  it("VAL-ONTO-002 rejects malformed, duplicate, regressive, unparented, and hash-mismatched publication", async () => {
    const { mod, ontology } = await canonical();
    const valid = nextDocument(mod, ontology);
    const hash = mod.canonicalContentHash(valid);
    expect(() => mod.publishOntologyVersion(db, { ...valid, actor: "operator", suppliedHash: "sha256:bad", projections: [] })).toThrow(/suppliedHash/);
    expect(() => mod.publishOntologyVersion(db, { ...valid, version: "wat", actor: "operator", suppliedHash: hash, projections: [] })).toThrow(/semantic version/);
    const projections = mod.ONTOLOGY_PROJECTIONS.map((projection) => ({ projection, contentHash: hash }));
    const published = mod.publishOntologyVersion(db, { ...valid, actor: "operator", suppliedHash: hash, projections });
    expect(published.version).toBe("1.1.0");
    expect(() => mod.publishOntologyVersion(db, { ...valid, actor: "operator", suppliedHash: hash, projections })).toThrow(/already exists/);
    const regressive = { ...valid, version: "1.0.1", parent: valid.parent };
    const regressiveHash = mod.canonicalContentHash(regressive);
    expect(() => mod.publishOntologyVersion(db, { ...regressive, actor: "operator", suppliedHash: regressiveHash, projections: mod.ONTOLOGY_PROJECTIONS.map((projection) => ({ projection, contentHash: regressiveHash })) })).toThrow(/must advance/);
  });

  it("VAL-ONTO-003 rejects duplicate aliases, broken relationship endpoints, cycles, and weakened published semantics", async () => {
    const { mod, ontology } = await canonical();
    const document = nextDocument(mod, ontology);
    const duplicate = {
      ...document,
      definitions: [...document.definitions, { id: "duplicate", aliases: ["entity"], semantics: { kind: "entity" } }],
    };
    const duplicateHash = mod.canonicalContentHash(duplicate);
    expect(() => mod.publishOntologyVersion(db, {
      ...duplicate,
      actor: "operator", suppliedHash: duplicateHash,
      projections: mod.ONTOLOGY_PROJECTIONS.map((projection) => ({ projection, contentHash: duplicateHash })),
    })).toThrow(/Alias shadows/);
    const broken = { ...document, relationships: [...document.relationships, { from: "project", to: "missing", type: "is_a" }] };
    const brokenHash = mod.canonicalContentHash(broken);
    expect(() => mod.publishOntologyVersion(db, {
      ...broken, actor: "operator", suppliedHash: brokenHash,
      projections: mod.ONTOLOGY_PROJECTIONS.map((projection) => ({ projection, contentHash: brokenHash })),
    })).toThrow(/endpoints/);
    const cyclic = { ...document, relationships: [...document.relationships, { from: "entity", to: "project", type: "is_a" }] };
    const cyclicHash = mod.canonicalContentHash(cyclic);
    expect(() => mod.publishOntologyVersion(db, { ...cyclic, actor: "operator", suppliedHash: cyclicHash, projections: mod.ONTOLOGY_PROJECTIONS.map((projection) => ({ projection, contentHash: cyclicHash })) })).toThrow(/cycle/);
    const weakened = { ...document, definitions: document.definitions.map((definition) => definition.id === "agent" ? { ...definition, semantics: { kind: "entity", description: "different" } } : definition) };
    const weakenedHash = mod.canonicalContentHash(weakened);
    expect(() => mod.publishOntologyVersion(db, { ...weakened, actor: "operator", suppliedHash: weakenedHash, projections: mod.ONTOLOGY_PROJECTIONS.map((projection) => ({ projection, contentHash: weakenedHash })) })).toThrow(/immutable/);
    const published = mod.publishOntologyVersion(db, {
      ...document, actor: "operator", suppliedHash: mod.canonicalContentHash(document),
      projections: mod.ONTOLOGY_PROJECTIONS.map((projection) => ({ projection, contentHash: mod.canonicalContentHash(document) })),
    });
    const relationshipRemoved = {
      ...nextDocument(mod, published),
      version: "1.2.0",
      relationships: document.relationships.filter((relationship) => relationship.from !== "project"),
    };
    const relationshipRemovedHash = mod.canonicalContentHash(relationshipRemoved);
    expect(() => mod.publishOntologyVersion(db, {
      ...relationshipRemoved, actor: "operator", suppliedHash: relationshipRemovedHash,
      projections: mod.ONTOLOGY_PROJECTIONS.map((projection) => ({ projection, contentHash: relationshipRemovedHash })),
    })).toThrow(/Published relationship is immutable/);
    const relationshipChanged = {
      ...nextDocument(mod, published),
      version: "1.2.0",
      relationships: document.relationships.map((relationship) => relationship.from === "agent"
        ? { ...relationship, type: "acts_as" }
        : relationship),
    };
    const relationshipChangedHash = mod.canonicalContentHash(relationshipChanged);
    expect(() => mod.publishOntologyVersion(db, {
      ...relationshipChanged, actor: "operator", suppliedHash: relationshipChangedHash,
      projections: mod.ONTOLOGY_PROJECTIONS.map((projection) => ({ projection, contentHash: relationshipChangedHash })),
    })).toThrow(/Published relationship is immutable/);
  });

  it("VAL-ONTO-004 reconciles every mirror and does not treat stale, divergent, or failed mirrors as globally active", async () => {
    const { mod, ontology } = await canonical();
    for (const status of ["stale", "divergent", "failed"] as const) {
      const reconciled = mod.updateOntologyProjection(db, {
        ontologyId: ontology.ontologyId, version: ontology.version, projection: "git", contentHash: status === "divergent" ? SOURCE_HASH : ontology.contentHash, status, actor: "operator",
      });
      expect(reconciled.find((entry) => entry.projection === "git")?.current).toBe(false);
      expect(mod.discoverOntology(db).globallyActive).toBe(false);
      mod.updateOntologyProjection(db, { ontologyId: ontology.ontologyId, version: ontology.version, projection: "git", contentHash: ontology.contentHash, status: "current", actor: "operator" });
      expect(mod.discoverOntology(db).globallyActive).toBe(true);
    }
  });

  it("VAL-ONTO-005 writes immutable ontology provenance and preserves historical bindings after advancement", async () => {
    const { mod, ontology } = await canonical();
    const binding = mod.bindOntologyProvenance(db, {
      recordType: "memory", recordId: "memory-1", ontologyId: ontology.ontologyId, ontologyVersion: ontology.version, ontologyContentHash: ontology.contentHash, actor: "operator",
    });
    const document = nextDocument(mod, ontology);
    const hash = mod.canonicalContentHash(document);
    mod.publishOntologyVersion(db, { ...document, actor: "operator", suppliedHash: hash, projections: mod.ONTOLOGY_PROJECTIONS.map((projection) => ({ projection, contentHash: hash })) });
    expect(mod.getOntologyProvenanceBinding(db, "memory", "memory-1")).toEqual(binding);
    expect(() => mod.bindOntologyProvenance(db, {
      recordType: "memory", recordId: "memory-1", ontologyId: document.id, ontologyVersion: document.version, ontologyContentHash: hash, actor: "operator",
    })).toThrow(/immutable ontology binding/);
  });

  it("VAL-ONTO-006 registers only valid draft packs and keeps raw source sentinels out of results and audit metadata", async () => {
    const { mod, ontology } = await canonical();
    const sentinel = "RAW-PACK-SOURCE-MUST-NOT-PERSIST";
    const pack = mod.registerDomainPack(db, {
      namespace: "finance.ops", owner: "finance", version: "1.0.0", sourceHash: SOURCE_HASH,
      provenanceSummary: { origin: "git", revision: "abc123" },
      ontology: { id: ontology.ontologyId, version: ontology.version, contentHash: ontology.contentHash },
      types: [{ id: "finance.ops.invoice", semantics: { kind: "entity" } }],
      actor: "operator",
      ...( { source: sentinel } as Record<string, unknown>),
    } as never);
    expect(pack.lifecycleState).toBe("draft");
    expect(JSON.stringify(pack)).not.toContain(sentinel);
    const audit = db.prepare(`SELECT metadata_json FROM audit_entries WHERE event_type = 'ontology_pack_registered'`).get() as { metadata_json: string };
    expect(audit.metadata_json).not.toContain(sentinel);
    expect(() => mod.registerDomainPack(db, {
      namespace: "nested", owner: "finance", version: "1.0.0", sourceHash: SOURCE_HASH,
      provenanceSummary: { origin: [{ externalRef: { payload: sentinel } }] },
      ontology: pack.ontology, types: [{ id: "nested.record", semantics: {} }], actor: "operator",
    })).toThrow(/provenanceSummary cannot contain payload/);
    expect(() => mod.registerDomainPack(db, {
      namespace: "annotated", owner: "finance", version: "1.0.0", sourceHash: SOURCE_HASH,
      provenanceSummary: { note: sentinel },
      ontology: pack.ontology, types: [{ id: "annotated.record", semantics: {} }], actor: "operator",
    })).toThrow(/provenanceSummary cannot contain note/);
    expect(() => mod.registerDomainPack(db, {
      namespace: "not valid!", owner: "finance", version: "1.0.1", sourceHash: SOURCE_HASH, provenanceSummary: {},
      ontology: pack.ontology, types: [{ id: "not valid!.invoice", semantics: {} }], actor: "operator",
    })).toThrow(/namespace/);
  });

  it("VAL-ONTO-007 validates pack dependencies, fully qualified type collisions, and dependency cycles", async () => {
    const { mod, ontology } = await canonical();
    const base = mod.registerDomainPack(db, {
      id: "base", namespace: "base", owner: "ops", version: "1.0.0", sourceHash: SOURCE_HASH, provenanceSummary: {},
      ontology: { id: ontology.ontologyId, version: ontology.version, contentHash: ontology.contentHash },
      types: [{ id: "base.record", semantics: {} }], actor: "operator",
    });
    mod.transitionDomainPack(db, { packId: base.id, toState: "approved", actor: "operator" });
    expect(() => mod.registerDomainPack(db, {
      namespace: "child", owner: "ops", version: "1.0.0", sourceHash: SOURCE_HASH, provenanceSummary: {}, ontology: base.ontology,
      dependencies: [{ namespace: "base", version: "1.0.0", sourceHash: `sha256:${"b".repeat(64)}` }],
      types: [{ id: "child.record", semantics: {} }], actor: "operator",
    })).toThrow(/source hash is stale/);
    expect(() => mod.registerDomainPack(db, {
      namespace: "missing", owner: "ops", version: "1.0.0", sourceHash: SOURCE_HASH, provenanceSummary: {}, ontology: base.ontology,
      dependencies: [{ namespace: "absent", version: "1.0.0", sourceHash: SOURCE_HASH }],
      types: [{ id: "missing.record", semantics: {} }], actor: "operator",
    })).toThrow(/does not exist/);
    expect(() => mod.registerDomainPack(db, {
      namespace: "self", owner: "ops", version: "1.0.0", sourceHash: SOURCE_HASH, provenanceSummary: {}, ontology: base.ontology,
      dependencies: [{ namespace: "self", version: "1.0.0", sourceHash: SOURCE_HASH }],
      types: [{ id: "self.record", semantics: {} }], actor: "operator",
    })).toThrow(/cannot depend on itself/);
    mod.transitionDomainPack(db, { packId: base.id, toState: "deprecated", actor: "operator", reason: "stale" });
    expect(() => mod.registerDomainPack(db, {
      namespace: "deprecated", owner: "ops", version: "1.0.0", sourceHash: SOURCE_HASH, provenanceSummary: {}, ontology: base.ontology,
      dependencies: [{ namespace: "base", version: "1.0.0", sourceHash: SOURCE_HASH }],
      types: [{ id: "deprecated.record", semantics: {} }], actor: "operator",
    })).toThrow(/found deprecated/);
    db.prepare(`UPDATE ontology_packs SET lifecycle_state = 'approved' WHERE id = ?`).run(base.id);
    expect(() => mod.registerDomainPack(db, {
      namespace: "child", owner: "ops", version: "1.0.0", sourceHash: SOURCE_HASH, provenanceSummary: {}, ontology: base.ontology,
      types: [{ id: "entity", semantics: {} }], actor: "operator",
    })).toThrow(/fully qualified/);
    db.prepare(`INSERT INTO ontology_packs (id, namespace, owner, version, source_hash, provenance_summary_json, ontology_id, ontology_version, ontology_content_hash, types_json, dependencies_json, lifecycle_state, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?)`)
      .run("cycle-existing", "cycle.existing", "ops", "1.0.0", SOURCE_HASH, "{}", base.ontology.id, base.ontology.version, base.ontology.contentHash, "[]", JSON.stringify([{ namespace: "cycle.future", version: "1.0.0", sourceHash: SOURCE_HASH }]), "operator", new Date().toISOString());
    expect(() => mod.registerDomainPack(db, {
      id: "cycle-future", namespace: "cycle.future", owner: "ops", version: "1.0.0", sourceHash: SOURCE_HASH, provenanceSummary: {}, ontology: base.ontology,
      dependencies: [{ namespace: "cycle.existing", version: "1.0.0", sourceHash: SOURCE_HASH }],
      types: [{ id: "cycle.future.record", semantics: {} }], actor: "operator",
    })).toThrow(/cycle/);
  });

  it("VAL-ONTO-010 rejects types and aliases that shadow existing domain packs across namespaces", async () => {
    const { mod, ontology } = await canonical();
    const existing = mod.registerDomainPack(db, {
      namespace: "finance", owner: "ops", version: "1.0.0", sourceHash: SOURCE_HASH, provenanceSummary: {},
      ontology: { id: ontology.ontologyId, version: ontology.version, contentHash: ontology.contentHash },
      types: [{ id: "finance.invoice", aliases: ["legal.case", "invoice"], semantics: {} }], actor: "operator",
    });
    expect(() => mod.registerDomainPack(db, {
      namespace: "legal", owner: "ops", version: "1.0.0", sourceHash: SOURCE_HASH, provenanceSummary: {}, ontology: existing.ontology,
      types: [{ id: "legal.case", semantics: {} }], actor: "operator",
    })).toThrow(/existing definition or alias/);
    expect(() => mod.registerDomainPack(db, {
      namespace: "legal", owner: "ops", version: "1.0.1", sourceHash: SOURCE_HASH, provenanceSummary: {}, ontology: existing.ontology,
      types: [{ id: "legal.record", aliases: ["finance.invoice"], semantics: {} }], actor: "operator",
    })).toThrow(/existing definition or alias/);
    expect(() => mod.registerDomainPack(db, {
      namespace: "legal", owner: "ops", version: "1.0.2", sourceHash: SOURCE_HASH, provenanceSummary: {}, ontology: existing.ontology,
      types: [{ id: "legal.invoice", aliases: ["invoice"], semantics: {} }], actor: "operator",
    })).toThrow(/existing definition or alias/);
  });

  it("VAL-ONTO-008 enforces pack lifecycle transitions, authoritative write eligibility, and historical readability", async () => {
    const { mod, ontology } = await canonical();
    const replacement = mod.registerDomainPack(db, {
      namespace: "replacement", owner: "ops", version: "1.0.0", sourceHash: SOURCE_HASH, provenanceSummary: {}, ontology: { id: ontology.ontologyId, version: ontology.version, contentHash: ontology.contentHash },
      types: [{ id: "replacement.record", semantics: {} }], actor: "operator",
    });
    const pack = mod.registerDomainPack(db, {
      namespace: "lifecycle", owner: "ops", version: "1.0.0", sourceHash: SOURCE_HASH, provenanceSummary: {}, ontology: replacement.ontology,
      types: [{ id: "lifecycle.record", semantics: {} }], actor: "operator",
    });
    expect(() => mod.assertPackAuthoritative(db, pack.id)).toThrow(/not approved/);
    mod.transitionDomainPack(db, { packId: replacement.id, toState: "approved", actor: "operator" });
    mod.transitionDomainPack(db, { packId: pack.id, toState: "approved", actor: "operator" });
    expect(mod.assertPackAuthoritative(db, pack.id).id).toBe(pack.id);
    expect(() => mod.transitionDomainPack(db, { packId: pack.id, toState: "deprecated", actor: "operator" })).toThrow(/reason/);
    mod.transitionDomainPack(db, { packId: pack.id, toState: "deprecated", actor: "operator", reason: "replaced" });
    expect(mod.getDomainPack(db, pack.id)?.lifecycleState).toBe("deprecated");
    expect(() => mod.assertPackAuthoritative(db, pack.id)).toThrow(/not approved/);
    expect(() => mod.transitionDomainPack(db, { packId: pack.id, toState: "retired", actor: "operator" })).toThrow(/replacement/);
    const retired = mod.transitionDomainPack(db, { packId: pack.id, toState: "retired", actor: "operator", replacementPackId: replacement.id });
    expect(retired.lifecycleState).toBe("retired");
  });

  it("VAL-ONTO-009 rolls back ontology publication when its paired audit row fails", async () => {
    const { mod, ontology } = await canonical();
    db.exec(`
      CREATE TRIGGER reject_ontology_audit
      BEFORE INSERT ON audit_entries
      WHEN NEW.event_type = 'ontology_version_published'
      BEGIN SELECT RAISE(ABORT, 'audit rejection'); END;
    `);
    const document = nextDocument(mod, ontology);
    const hash = mod.canonicalContentHash(document);
    expect(() => mod.publishOntologyVersion(db, {
      ...document, actor: "operator", suppliedHash: hash,
      projections: mod.ONTOLOGY_PROJECTIONS.map((projection) => ({ projection, contentHash: hash })),
    })).toThrow(/audit/);
    expect(db.prepare(`SELECT COUNT(*) AS count FROM ontology_versions WHERE version = '1.1.0'`).get()).toMatchObject({ count: 0 });
    expect(mod.discoverOntology(db).version).toBe("1.0.0");
  });
});

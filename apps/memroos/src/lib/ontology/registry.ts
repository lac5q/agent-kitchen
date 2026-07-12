import { createHash, randomUUID } from "crypto";
import type Database from "better-sqlite3";

import { commitAuditAtomic } from "@/lib/skills/skill-audit-atomic";

export const UPPER_ONTOLOGY_ID = "memroos.upper";
export const ONTOLOGY_PROJECTIONS = ["git", "sqlite", "frontmatter", "graph", "generated_graph"] as const;
export const PACK_LIFECYCLE_STATES = ["draft", "approved", "deprecated", "retired"] as const;

export type OntologyProjection = (typeof ONTOLOGY_PROJECTIONS)[number];
export type ProjectionStatus = "current" | "stale" | "divergent" | "failed";
export type PackLifecycleState = (typeof PACK_LIFECYCLE_STATES)[number];

export interface OntologyDefinition {
  id: string;
  aliases?: string[];
  semantics: Record<string, unknown>;
}

export interface OntologyRelationship {
  from: string;
  to: string;
  type: string;
}

export interface OntologyDocument {
  id: string;
  version: string;
  definitions: OntologyDefinition[];
  relationships: OntologyRelationship[];
}

export interface ProjectionInput {
  projection: OntologyProjection;
  contentHash: string;
  status?: ProjectionStatus;
}

export interface PublishOntologyInput extends OntologyDocument {
  actor: string;
  suppliedHash?: string;
  parent?: {
    ontologyId: string;
    version: string;
    contentHash: string;
  };
  projections: ProjectionInput[];
}

export interface OntologyVersion {
  ontologyId: string;
  version: string;
  contentHash: string;
  status: "published";
  parent: { ontologyId: string; version: string; contentHash: string } | null;
  definitions: OntologyDefinition[];
  relationships: OntologyRelationship[];
  publishedBy: string;
  publishedAt: string;
}

export interface OntologyDiscovery extends OntologyVersion {
  requested: boolean;
  globallyActive: boolean;
  reconciliation: ProjectionReconciliation[];
}

export interface ProjectionReconciliation {
  projection: OntologyProjection;
  expectedHash: string;
  actualHash: string | null;
  status: ProjectionStatus | "missing";
  current: boolean;
}

export interface ProvenanceBinding {
  id: string;
  recordType: string;
  recordId: string;
  ontologyId: string;
  ontologyVersion: string;
  ontologyContentHash: string;
  boundBy: string;
  boundAt: string;
}

export interface BindProvenanceInput {
  recordType: string;
  recordId: string;
  ontologyId: string;
  ontologyVersion: string;
  ontologyContentHash: string;
  actor: string;
}

export interface PackDependency {
  namespace: string;
  version: string;
  sourceHash: string;
}

export interface DomainPackInput {
  id?: string;
  namespace: string;
  owner: string;
  version: string;
  sourceHash: string;
  provenanceSummary: Record<string, unknown>;
  ontology: {
    id: string;
    version: string;
    contentHash: string;
  };
  dependencies?: PackDependency[];
  types: OntologyDefinition[];
  actor: string;
}

export interface DomainPack {
  id: string;
  namespace: string;
  owner: string;
  version: string;
  sourceHash: string;
  provenanceSummary: Record<string, unknown>;
  ontology: { id: string; version: string; contentHash: string };
  dependencies: PackDependency[];
  types: OntologyDefinition[];
  lifecycleState: PackLifecycleState;
  createdBy: string;
  createdAt: string;
  approvedAt: string | null;
  deprecatedAt: string | null;
  deprecatedReason: string | null;
  retiredAt: string | null;
  replacementPackId: string | null;
}

export class OntologyRegistryError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "invalid"
      | "not_found"
      | "conflict"
      | "not_active"
      | "incompatible"
      | "lifecycle"
  ) {
    super(message);
    this.name = "OntologyRegistryError";
  }
}

export const CORE_VOCABULARY: readonly OntologyDefinition[] = Object.freeze([
  {
    id: "entity",
    aliases: ["thing"],
    semantics: { kind: "root", description: "A governed resource with an immutable identity." },
  },
  {
    id: "agent",
    aliases: ["actor"],
    semantics: { kind: "entity", description: "An accountable human or automated actor." },
  },
  {
    id: "memory",
    aliases: ["knowledge_record"],
    semantics: { kind: "entity", description: "A retained, governed memory record." },
  },
  {
    id: "provenance",
    aliases: ["lineage"],
    semantics: { kind: "entity", description: "The immutable origin and binding evidence for a record." },
  },
  {
    id: "policy",
    aliases: ["governance_policy"],
    semantics: { kind: "entity", description: "A rule that constrains governed operations." },
  },
]);

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function canonicalContentHash(document: Pick<OntologyDocument, "id" | "version" | "definitions" | "relationships">): string {
  const canonical = {
    id: document.id,
    version: document.version,
    definitions: document.definitions,
    relationships: document.relationships,
  };
  return `sha256:${createHash("sha256").update(stableJson(canonical), "utf8").digest("hex")}`;
}

function nonEmpty(value: string, field: string): string {
  const clean = value?.trim();
  if (!clean) throw new OntologyRegistryError(`${field} is required`, "invalid");
  return clean;
}

function parseSemver(value: string): [number, number, number, string | null] {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(value);
  if (!match) throw new OntologyRegistryError(`Invalid semantic version: ${value}`, "invalid");
  return [Number(match[1]), Number(match[2]), Number(match[3]), match[4] ?? null];
}

function compareSemver(a: string, b: string): number {
  const left = parseSemver(a);
  const right = parseSemver(b);
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return (left[index] as number) - (right[index] as number);
  }
  if (left[3] === right[3]) return 0;
  if (left[3] === null) return 1;
  if (right[3] === null) return -1;
  return left[3].localeCompare(right[3]);
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

function versionRow(db: Database.Database, ontologyId: string, version: string): Record<string, string> | undefined {
  return db.prepare(`SELECT * FROM ontology_versions WHERE ontology_id = ? AND version = ?`).get(ontologyId, version) as Record<string, string> | undefined;
}

function toOntologyVersion(row: Record<string, string>): OntologyVersion {
  return {
    ontologyId: row.ontology_id,
    version: row.version,
    contentHash: row.content_hash,
    status: "published" as const,
    parent: row.parent_ontology_id
      ? { ontologyId: row.parent_ontology_id, version: row.parent_version, contentHash: row.parent_content_hash }
      : null,
    definitions: parseJson<OntologyDefinition[]>(row.definitions_json),
    relationships: parseJson<OntologyRelationship[]>(row.relationships_json),
    publishedBy: row.published_by,
    publishedAt: row.published_at,
  };
}

function assertDocumentShape(document: OntologyDocument): void {
  if (document.id !== UPPER_ONTOLOGY_ID) {
    throw new OntologyRegistryError(`Only ${UPPER_ONTOLOGY_ID} is a canonical upper ontology`, "invalid");
  }
  nonEmpty(document.version, "version");
  parseSemver(document.version);
  if (!Array.isArray(document.definitions) || document.definitions.length === 0) {
    throw new OntologyRegistryError("definitions must be a non-empty array", "invalid");
  }
  if (!Array.isArray(document.relationships)) {
    throw new OntologyRegistryError("relationships must be an array", "invalid");
  }
  const identifiers = new Set<string>();
  for (const definition of document.definitions) {
    const id = nonEmpty(definition.id, "definition.id");
    if (!definition.semantics || typeof definition.semantics !== "object" || Array.isArray(definition.semantics)) {
      throw new OntologyRegistryError(`definition ${id} requires semantics`, "invalid");
    }
    if (identifiers.has(id)) throw new OntologyRegistryError(`Duplicate definition or alias: ${id}`, "conflict");
    identifiers.add(id);
    for (const alias of definition.aliases ?? []) {
      const cleanAlias = nonEmpty(alias, "definition.alias");
      if (identifiers.has(cleanAlias)) throw new OntologyRegistryError(`Alias shadows definition or alias: ${cleanAlias}`, "conflict");
      identifiers.add(cleanAlias);
    }
  }
  const graph = new Map<string, string[]>();
  for (const definition of document.definitions) graph.set(definition.id, []);
  for (const relation of document.relationships) {
    if (!graph.has(relation.from) || !graph.has(relation.to)) {
      throw new OntologyRegistryError(`Relationship endpoints must be declared definitions: ${relation.from} -> ${relation.to}`, "invalid");
    }
    nonEmpty(relation.type, "relationship.type");
    graph.get(relation.from)!.push(relation.to);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (node: string): void => {
    if (visiting.has(node)) throw new OntologyRegistryError(`Ontology relationship cycle at ${node}`, "invalid");
    if (visited.has(node)) return;
    visiting.add(node);
    for (const target of graph.get(node) ?? []) visit(target);
    visiting.delete(node);
    visited.add(node);
  };
  for (const id of graph.keys()) visit(id);
}

function assertCompatible(previous: OntologyVersion | null, next: OntologyDocument): void {
  if (!previous) {
    const ids = new Set(next.definitions.map((definition) => definition.id));
    for (const core of CORE_VOCABULARY) {
      if (!ids.has(core.id)) throw new OntologyRegistryError(`Initial upper ontology must define core vocabulary: ${core.id}`, "incompatible");
    }
    return;
  }
  const nextById = new Map(next.definitions.map((definition) => [definition.id, definition]));
  for (const definition of previous.definitions) {
    const successor = nextById.get(definition.id);
    if (!successor || stableJson(successor) !== stableJson(definition)) {
      throw new OntologyRegistryError(`Published definition is immutable: ${definition.id}`, "incompatible");
    }
  }
  for (const core of CORE_VOCABULARY) {
    const successor = nextById.get(core.id);
    if (!successor || stableJson(successor) !== stableJson(core)) {
      throw new OntologyRegistryError(`Core semantic cannot be changed or weakened: ${core.id}`, "incompatible");
    }
  }
  const nextRelationships = new Set(next.relationships.map(stableJson));
  for (const relationship of previous.relationships) {
    if (!nextRelationships.has(stableJson(relationship))) {
      throw new OntologyRegistryError(
        `Published relationship is immutable: ${relationship.from} -> ${relationship.to} (${relationship.type})`,
        "incompatible"
      );
    }
  }
}

function validatedProjections(input: ProjectionInput[], expectedHash: string): ProjectionInput[] {
  if (!Array.isArray(input) || input.length !== ONTOLOGY_PROJECTIONS.length) {
    throw new OntologyRegistryError("All canonical projections are required", "invalid");
  }
  const seen = new Set<string>();
  const normalized = input.map((mirror) => {
    if (!ONTOLOGY_PROJECTIONS.includes(mirror.projection)) throw new OntologyRegistryError(`Unknown projection: ${String(mirror.projection)}`, "invalid");
    if (seen.has(mirror.projection)) throw new OntologyRegistryError(`Duplicate projection: ${mirror.projection}`, "conflict");
    seen.add(mirror.projection);
    const status = mirror.status ?? "current";
    if (status !== "current" || mirror.contentHash !== expectedHash) {
      throw new OntologyRegistryError(`Publication requires current ${mirror.projection} projection with canonical hash`, "not_active");
    }
    return { ...mirror, status };
  });
  return normalized;
}

function safeProvenanceSummary(value: Record<string, unknown>): Record<string, unknown> {
  const allowedKeys = new Set([
    "origin",
    "revision",
    "uri",
    "importedAt",
    "sourceId",
    "repository",
    "path",
    "license",
    "externalRef",
  ]);
  const seen = new WeakSet<object>();
  const inspect = (candidate: unknown): void => {
    if (candidate === null || ["string", "number", "boolean"].includes(typeof candidate)) return;
    if (Array.isArray(candidate)) {
      for (const nested of candidate) inspect(nested);
      return;
    }
    if (typeof candidate !== "object") {
      throw new OntologyRegistryError("provenanceSummary values must be JSON-safe", "invalid");
    }
    if (seen.has(candidate)) throw new OntologyRegistryError("provenanceSummary cannot contain cyclic values", "invalid");
    seen.add(candidate);
    for (const [key, nested] of Object.entries(candidate)) {
      if (!allowedKeys.has(key)) throw new OntologyRegistryError(`provenanceSummary cannot contain ${key}`, "invalid");
      inspect(nested);
    }
  };
  inspect(value);
  return value;
}

export function publishOntologyVersion(db: Database.Database, input: PublishOntologyInput): OntologyVersion {
  const document: OntologyDocument = {
    id: nonEmpty(input.id, "id"),
    version: nonEmpty(input.version, "version"),
    definitions: input.definitions,
    relationships: input.relationships,
  };
  const actor = nonEmpty(input.actor, "actor");
  assertDocumentShape(document);
  const contentHash = canonicalContentHash(document);
  if (input.suppliedHash && input.suppliedHash !== contentHash) {
    throw new OntologyRegistryError("suppliedHash does not match canonical content", "invalid");
  }
  const existing = versionRow(db, document.id, document.version);
  if (existing) throw new OntologyRegistryError(`Ontology version already exists: ${document.version}`, "conflict");
  const active = db.prepare(`SELECT active_version FROM ontology_registry WHERE ontology_id = ?`).get(document.id) as { active_version: string } | undefined;
  const previous = active ? toOntologyVersion(versionRow(db, document.id, active.active_version)!) : null;
  if (previous && compareSemver(document.version, previous.version) <= 0) {
    throw new OntologyRegistryError(`Version must advance from ${previous.version}`, "conflict");
  }
  if (previous) {
    if (!input.parent || input.parent.ontologyId !== previous.ontologyId || input.parent.version !== previous.version || input.parent.contentHash !== previous.contentHash) {
      throw new OntologyRegistryError("Successor must reference the active parent ontology version and hash", "invalid");
    }
  } else if (input.parent) {
    throw new OntologyRegistryError("Initial ontology cannot declare a parent", "invalid");
  }
  assertCompatible(previous, document);
  const projections = validatedProjections(input.projections, contentHash);
  const now = new Date().toISOString();

  const commit = commitAuditAtomic(db, {
    actor,
    eventType: "ontology_version_published",
    entityType: "ontology_version",
    entityId: `${document.id}@${document.version}`,
    metadata: {
      ontology_id: document.id,
      version: document.version,
      content_hash: contentHash,
      parent_version: previous?.version ?? null,
      projection_count: projections.length,
    },
    body: (helpers) => {
      db.prepare(
        `INSERT INTO ontology_versions
          (ontology_id, version, content_hash, parent_ontology_id, parent_version, parent_content_hash,
           definitions_json, relationships_json, published_by, published_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        document.id, document.version, contentHash,
        previous?.ontologyId ?? null, previous?.version ?? null, previous?.contentHash ?? null,
        stableJson(document.definitions), stableJson(document.relationships), actor, now
      );
      for (const projection of projections) {
        db.prepare(
          `INSERT INTO ontology_projection_mirrors
            (ontology_id, version, projection, content_hash, status, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(document.id, document.version, projection.projection, projection.contentHash, projection.status, now);
      }
      db.prepare(
        `INSERT INTO ontology_registry (ontology_id, active_version, active_content_hash, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(ontology_id) DO UPDATE SET
           active_version = excluded.active_version,
           active_content_hash = excluded.active_content_hash,
           updated_at = excluded.updated_at`
      ).run(document.id, document.version, contentHash, now);
      const projectionCount = db.prepare(
        `SELECT COUNT(*) AS count
         FROM ontology_projection_mirrors
         WHERE ontology_id = ? AND version = ? AND content_hash = ? AND status = 'current'`
      ).get(document.id, document.version, contentHash) as { count: number };
      helpers.requireVerified(
        "canonical_projection_rows",
        projectionCount.count === ONTOLOGY_PROJECTIONS.length
      );
      return toOntologyVersion(versionRow(db, document.id, document.version)!);
    },
  });
  return commit.mutationResult as OntologyVersion;
}

export function ensureCanonicalUpperOntology(db: Database.Database, actor = "system"): OntologyVersion {
  const active = db.prepare(`SELECT active_version FROM ontology_registry WHERE ontology_id = ?`).get(UPPER_ONTOLOGY_ID) as { active_version: string } | undefined;
  if (active) return toOntologyVersion(versionRow(db, UPPER_ONTOLOGY_ID, active.active_version)!);
  const document: OntologyDocument = {
    id: UPPER_ONTOLOGY_ID,
    version: "1.0.0",
    definitions: [...CORE_VOCABULARY],
    relationships: [
      { from: "agent", to: "entity", type: "is_a" },
      { from: "memory", to: "entity", type: "is_a" },
      { from: "provenance", to: "entity", type: "is_a" },
      { from: "policy", to: "entity", type: "is_a" },
    ],
  };
  const hash = canonicalContentHash(document);
  return publishOntologyVersion(db, {
    ...document,
    actor,
    suppliedHash: hash,
    projections: ONTOLOGY_PROJECTIONS.map((projection) => ({ projection, contentHash: hash })),
  });
}

export function reconcileOntologyProjections(db: Database.Database, ontologyId: string, version: string): ProjectionReconciliation[] {
  const row = versionRow(db, ontologyId, version);
  if (!row) throw new OntologyRegistryError(`Unknown ontology version: ${ontologyId}@${version}`, "not_found");
  const mirrors = db.prepare(`SELECT projection, content_hash, status FROM ontology_projection_mirrors WHERE ontology_id = ? AND version = ?`).all(ontologyId, version) as Array<{ projection: OntologyProjection; content_hash: string; status: ProjectionStatus }>;
  const byProjection = new Map(mirrors.map((mirror) => [mirror.projection, mirror]));
  return ONTOLOGY_PROJECTIONS.map((projection) => {
    const mirror = byProjection.get(projection);
    return {
      projection,
      expectedHash: row.content_hash,
      actualHash: mirror?.content_hash ?? null,
      status: mirror?.status ?? "missing",
      current: mirror?.status === "current" && mirror.content_hash === row.content_hash,
    };
  });
}

export function discoverOntology(db: Database.Database, options: { ontologyId?: string; version?: string } = {}): OntologyDiscovery {
  const ontologyId = options.ontologyId ?? UPPER_ONTOLOGY_ID;
  const version = options.version ?? (db.prepare(`SELECT active_version FROM ontology_registry WHERE ontology_id = ?`).get(ontologyId) as { active_version: string } | undefined)?.active_version;
  if (!version) throw new OntologyRegistryError(`No active ontology version for ${ontologyId}`, "not_found");
  const row = versionRow(db, ontologyId, version);
  if (!row) throw new OntologyRegistryError(`Unknown ontology version: ${ontologyId}@${version}`, "not_found");
  const reconciliation = reconcileOntologyProjections(db, ontologyId, version);
  return { ...toOntologyVersion(row), requested: Boolean(options.version), globallyActive: reconciliation.every((entry) => entry.current), reconciliation };
}

export function updateOntologyProjection(
  db: Database.Database,
  input: { ontologyId: string; version: string; projection: OntologyProjection; contentHash: string; status: ProjectionStatus; actor: string }
): ProjectionReconciliation[] {
  const ontology = discoverOntology(db, { ontologyId: input.ontologyId, version: input.version });
  const actor = nonEmpty(input.actor, "actor");
  if (!ONTOLOGY_PROJECTIONS.includes(input.projection)) throw new OntologyRegistryError(`Unknown projection: ${input.projection}`, "invalid");
  if (!["current", "stale", "divergent", "failed"].includes(input.status)) throw new OntologyRegistryError(`Unknown projection status: ${input.status}`, "invalid");
  const now = new Date().toISOString();
  commitAuditAtomic(db, {
    actor,
    eventType: "ontology_projection_reconciled",
    entityType: "ontology_projection",
    entityId: `${ontology.ontologyId}@${ontology.version}:${input.projection}`,
    metadata: { ontology_id: ontology.ontologyId, version: ontology.version, projection: input.projection, content_hash: input.contentHash, status: input.status },
    body: () => {
      db.prepare(
        `INSERT INTO ontology_projection_mirrors (ontology_id, version, projection, content_hash, status, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(ontology_id, version, projection) DO UPDATE SET
           content_hash = excluded.content_hash, status = excluded.status, updated_at = excluded.updated_at`
      ).run(ontology.ontologyId, ontology.version, input.projection, input.contentHash, input.status, now);
      return null;
    },
  });
  return reconcileOntologyProjections(db, ontology.ontologyId, ontology.version);
}

export function bindOntologyProvenance(db: Database.Database, input: BindProvenanceInput): ProvenanceBinding {
  const actor = nonEmpty(input.actor, "actor");
  nonEmpty(input.recordType, "recordType");
  nonEmpty(input.recordId, "recordId");
  const ontology = discoverOntology(db, { ontologyId: input.ontologyId, version: input.ontologyVersion });
  if (!ontology.globallyActive) throw new OntologyRegistryError("Ontology projections are not globally active", "not_active");
  if (ontology.contentHash !== input.ontologyContentHash) throw new OntologyRegistryError("Ontology content hash does not match requested version", "invalid");
  const existing = db.prepare(`SELECT * FROM ontology_provenance_bindings WHERE record_type = ? AND record_id = ?`).get(input.recordType, input.recordId) as Record<string, string> | undefined;
  if (existing) {
    if (existing.ontology_id === ontology.ontologyId && existing.ontology_version === ontology.version && existing.ontology_content_hash === ontology.contentHash) return toBinding(existing);
    throw new OntologyRegistryError("Record already has an immutable ontology binding", "conflict");
  }
  const binding: ProvenanceBinding = {
    id: `ontbind_${randomUUID()}`, recordType: input.recordType, recordId: input.recordId,
    ontologyId: ontology.ontologyId, ontologyVersion: ontology.version, ontologyContentHash: ontology.contentHash,
    boundBy: actor, boundAt: new Date().toISOString(),
  };
  const commit = commitAuditAtomic(db, {
    actor, eventType: "ontology_provenance_bound", entityType: "ontology_binding", entityId: `${binding.recordType}:${binding.recordId}`,
    metadata: { binding_id: binding.id, record_type: binding.recordType, record_id: binding.recordId, ontology_id: binding.ontologyId, ontology_version: binding.ontologyVersion, ontology_content_hash: binding.ontologyContentHash },
    body: () => {
      db.prepare(`INSERT INTO ontology_provenance_bindings (id, record_type, record_id, ontology_id, ontology_version, ontology_content_hash, bound_by, bound_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(binding.id, binding.recordType, binding.recordId, binding.ontologyId, binding.ontologyVersion, binding.ontologyContentHash, binding.boundBy, binding.boundAt);
      return binding;
    },
  });
  return commit.mutationResult as ProvenanceBinding;
}

function toBinding(row: Record<string, string>): ProvenanceBinding {
  return { id: row.id, recordType: row.record_type, recordId: row.record_id, ontologyId: row.ontology_id, ontologyVersion: row.ontology_version, ontologyContentHash: row.ontology_content_hash, boundBy: row.bound_by, boundAt: row.bound_at };
}

export function getOntologyProvenanceBinding(db: Database.Database, recordType: string, recordId: string): ProvenanceBinding | null {
  const row = db.prepare(`SELECT * FROM ontology_provenance_bindings WHERE record_type = ? AND record_id = ?`).get(recordType, recordId) as Record<string, string> | undefined;
  return row ? toBinding(row) : null;
}

function namespaceIsValid(namespace: string): boolean {
  return /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/.test(namespace);
}

function assertPackTypes(db: Database.Database, pack: DomainPackInput, ontology: OntologyDiscovery): void {
  if (!Array.isArray(pack.types) || pack.types.length === 0) throw new OntologyRegistryError("types must be a non-empty array", "invalid");
  const reservedIdentifiers = new Set(ontology.definitions.flatMap((definition) => [definition.id, ...(definition.aliases ?? [])]));
  for (const row of allPackRows(db)) {
    for (const definition of parseJson<OntologyDefinition[]>(row.types_json)) {
      reservedIdentifiers.add(definition.id);
      for (const alias of definition.aliases ?? []) reservedIdentifiers.add(alias);
    }
  }
  const seen = new Set<string>();
  for (const definition of pack.types) {
    const id = nonEmpty(definition.id, "type.id");
    if (!id.startsWith(`${pack.namespace}.`)) throw new OntologyRegistryError(`Pack type must be fully qualified by ${pack.namespace}: ${id}`, "invalid");
    if (reservedIdentifiers.has(id) || seen.has(id)) throw new OntologyRegistryError(`Pack type collides with an existing definition or alias: ${id}`, "conflict");
    if (!definition.semantics || typeof definition.semantics !== "object" || Array.isArray(definition.semantics)) throw new OntologyRegistryError(`Pack type ${id} requires semantics`, "invalid");
    seen.add(id);
    for (const alias of definition.aliases ?? []) {
      if (reservedIdentifiers.has(alias) || seen.has(alias)) throw new OntologyRegistryError(`Pack alias shadows an existing definition or alias: ${alias}`, "conflict");
      seen.add(alias);
    }
  }
}

function toPack(row: Record<string, string>): DomainPack {
  return {
    id: row.id, namespace: row.namespace, owner: row.owner, version: row.version, sourceHash: row.source_hash,
    provenanceSummary: parseJson<Record<string, unknown>>(row.provenance_summary_json),
    ontology: { id: row.ontology_id, version: row.ontology_version, contentHash: row.ontology_content_hash },
    dependencies: parseJson<PackDependency[]>(row.dependencies_json), types: parseJson<OntologyDefinition[]>(row.types_json),
    lifecycleState: row.lifecycle_state as PackLifecycleState, createdBy: row.created_by, createdAt: row.created_at,
    approvedAt: row.approved_at ?? null, deprecatedAt: row.deprecated_at ?? null, deprecatedReason: row.deprecated_reason ?? null,
    retiredAt: row.retired_at ?? null, replacementPackId: row.replacement_pack_id ?? null,
  };
}

function allPackRows(db: Database.Database): Array<Record<string, string>> {
  return db.prepare(`SELECT * FROM ontology_packs`).all() as Array<Record<string, string>>;
}

function assertNoPackDependencyCycle(
  db: Database.Database,
  prospective: { id: string; namespace: string; version: string },
  dependencies: PackDependency[]
): void {
  const rows = allPackRows(db);
  const idByCoordinates = new Map(rows.map((row) => [`${row.namespace}@${row.version}`, row.id]));
  idByCoordinates.set(`${prospective.namespace}@${prospective.version}`, prospective.id);
  const graph = new Map<string, string[]>();
  for (const row of rows) {
    graph.set(row.id, parseJson<PackDependency[]>(row.dependencies_json).map((dependency) => idByCoordinates.get(`${dependency.namespace}@${dependency.version}`)).filter((id): id is string => Boolean(id)));
  }
  graph.set(prospective.id, dependencies.map((dependency) => idByCoordinates.get(`${dependency.namespace}@${dependency.version}`)).filter((id): id is string => Boolean(id)));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) throw new OntologyRegistryError("Domain pack dependency cycle", "conflict");
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of graph.get(id) ?? []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of graph.keys()) visit(id);
}

export function registerDomainPack(db: Database.Database, input: DomainPackInput): DomainPack {
  const namespace = nonEmpty(input.namespace, "namespace");
  if (!namespaceIsValid(namespace)) throw new OntologyRegistryError("namespace must be a simple dotted or dash identifier", "invalid");
  const owner = nonEmpty(input.owner, "owner");
  const actor = nonEmpty(input.actor, "actor");
  const version = nonEmpty(input.version, "version");
  parseSemver(version);
  if (!/^sha256:[a-f0-9]{64}$/.test(input.sourceHash)) throw new OntologyRegistryError("sourceHash must be a sha256 hash", "invalid");
  const summary = safeProvenanceSummary(input.provenanceSummary ?? {});
  const ontology = discoverOntology(db, { ontologyId: input.ontology.id, version: input.ontology.version });
  if (!ontology.globallyActive) throw new OntologyRegistryError("Domain packs require a globally active parent ontology", "not_active");
  if (ontology.contentHash !== input.ontology.contentHash) throw new OntologyRegistryError("Domain pack parent hash does not match ontology version", "invalid");
  assertPackTypes(db, { ...input, namespace }, ontology);
  const dependencies = input.dependencies ?? [];
  const dependencyCoordinates = new Set<string>();
  for (const dependency of dependencies) {
    const dependencyNamespace = nonEmpty(dependency.namespace, "dependency.namespace");
    const dependencyVersion = nonEmpty(dependency.version, "dependency.version");
    parseSemver(dependencyVersion);
    if (!/^sha256:[a-f0-9]{64}$/.test(dependency.sourceHash)) throw new OntologyRegistryError("dependency.sourceHash must be a sha256 hash", "invalid");
    const coordinate = `${dependencyNamespace}@${dependencyVersion}`;
    if (dependencyNamespace === namespace && dependencyVersion === version) {
      throw new OntologyRegistryError(`Domain pack cannot depend on itself: ${coordinate}`, "conflict");
    }
    if (dependencyCoordinates.has(coordinate)) throw new OntologyRegistryError(`Duplicate pack dependency: ${coordinate}`, "conflict");
    dependencyCoordinates.add(coordinate);
    const row = db.prepare(`SELECT source_hash, lifecycle_state FROM ontology_packs WHERE namespace = ? AND version = ?`).get(dependencyNamespace, dependencyVersion) as { source_hash: string; lifecycle_state: PackLifecycleState } | undefined;
    if (!row) throw new OntologyRegistryError(`Dependency does not exist: ${coordinate}`, "invalid");
    if (row.lifecycle_state !== "approved") throw new OntologyRegistryError(`Dependency must be approved, found ${row.lifecycle_state}: ${coordinate}`, "lifecycle");
    if (row.source_hash !== dependency.sourceHash) throw new OntologyRegistryError(`Dependency source hash is stale: ${coordinate}`, "invalid");
  }
  const id = input.id ?? `ontpack_${randomUUID()}`;
  assertNoPackDependencyCycle(db, { id, namespace, version }, dependencies);
  if (db.prepare(`SELECT 1 FROM ontology_packs WHERE namespace = ? AND version = ?`).get(namespace, version)) throw new OntologyRegistryError(`Pack already exists: ${namespace}@${version}`, "conflict");
  const pack: DomainPack = {
    id, namespace, owner, version, sourceHash: input.sourceHash, provenanceSummary: summary,
    ontology: { id: ontology.ontologyId, version: ontology.version, contentHash: ontology.contentHash },
    dependencies, types: input.types, lifecycleState: "draft", createdBy: actor, createdAt: new Date().toISOString(),
    approvedAt: null, deprecatedAt: null, deprecatedReason: null, retiredAt: null, replacementPackId: null,
  };
  const commit = commitAuditAtomic(db, {
    actor, eventType: "ontology_pack_registered", entityType: "ontology_pack", entityId: pack.id,
    metadata: { pack_id: pack.id, namespace: pack.namespace, version: pack.version, source_hash: pack.sourceHash, ontology_id: pack.ontology.id, ontology_version: pack.ontology.version, ontology_content_hash: pack.ontology.contentHash, dependency_count: pack.dependencies.length, type_count: pack.types.length },
    body: () => {
      db.prepare(`INSERT INTO ontology_packs (id, namespace, owner, version, source_hash, provenance_summary_json, ontology_id, ontology_version, ontology_content_hash, types_json, dependencies_json, lifecycle_state, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`)
        .run(pack.id, pack.namespace, pack.owner, pack.version, pack.sourceHash, stableJson(pack.provenanceSummary), pack.ontology.id, pack.ontology.version, pack.ontology.contentHash, stableJson(pack.types), stableJson(pack.dependencies), pack.createdBy, pack.createdAt);
      return pack;
    },
  });
  return commit.mutationResult as DomainPack;
}

export function getDomainPack(db: Database.Database, packId: string): DomainPack | null {
  const row = db.prepare(`SELECT * FROM ontology_packs WHERE id = ?`).get(packId) as Record<string, string> | undefined;
  return row ? toPack(row) : null;
}

export function assertPackAuthoritative(db: Database.Database, packId: string): DomainPack {
  const pack = getDomainPack(db, packId);
  if (!pack) throw new OntologyRegistryError(`Unknown domain pack: ${packId}`, "not_found");
  if (pack.lifecycleState !== "approved") throw new OntologyRegistryError(`Domain pack ${packId} is not approved for authoritative writes`, "lifecycle");
  return pack;
}

export function transitionDomainPack(
  db: Database.Database,
  input: { packId: string; toState: PackLifecycleState; actor: string; reason?: string; replacementPackId?: string }
): DomainPack {
  const actor = nonEmpty(input.actor, "actor");
  const pack = getDomainPack(db, input.packId);
  if (!pack) throw new OntologyRegistryError(`Unknown domain pack: ${input.packId}`, "not_found");
  const reason = input.reason?.trim() ?? "";
  const valid = (pack.lifecycleState === "draft" && input.toState === "approved")
    || (pack.lifecycleState === "approved" && input.toState === "deprecated")
    || (pack.lifecycleState === "deprecated" && input.toState === "retired");
  if (!valid) throw new OntologyRegistryError(`Invalid pack lifecycle transition: ${pack.lifecycleState} -> ${input.toState}`, "lifecycle");
  if (input.toState === "deprecated" && !reason) throw new OntologyRegistryError("Deprecation requires a reason", "lifecycle");
  if (input.toState === "retired") {
    if (!input.replacementPackId || input.replacementPackId === pack.id) throw new OntologyRegistryError("Retirement requires a distinct replacement pack", "lifecycle");
    assertPackAuthoritative(db, input.replacementPackId);
  }
  const now = new Date().toISOString();
  const commit = commitAuditAtomic(db, {
    actor, eventType: "ontology_pack_lifecycle_transitioned", entityType: "ontology_pack", entityId: pack.id,
    reason: reason || null,
    metadata: { pack_id: pack.id, from_state: pack.lifecycleState, to_state: input.toState, replacement_pack_id: input.replacementPackId ?? null },
    body: () => {
      db.prepare(`UPDATE ontology_packs SET lifecycle_state = ?, approved_at = CASE WHEN ? = 'approved' THEN ? ELSE approved_at END, deprecated_at = CASE WHEN ? = 'deprecated' THEN ? ELSE deprecated_at END, deprecated_reason = CASE WHEN ? = 'deprecated' THEN ? ELSE deprecated_reason END, retired_at = CASE WHEN ? = 'retired' THEN ? ELSE retired_at END, replacement_pack_id = CASE WHEN ? = 'retired' THEN ? ELSE replacement_pack_id END WHERE id = ?`)
        .run(input.toState, input.toState, now, input.toState, now, input.toState, reason || null, input.toState, now, input.toState, input.replacementPackId ?? null, pack.id);
      db.prepare(`INSERT INTO ontology_pack_lifecycle_audit (id, pack_id, from_state, to_state, actor, reason, replacement_pack_id, transitioned_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(`ontpackaudit_${randomUUID()}`, pack.id, pack.lifecycleState, input.toState, actor, reason || null, input.replacementPackId ?? null, now);
      return getDomainPack(db, pack.id)!;
    },
  });
  return commit.mutationResult as DomainPack;
}

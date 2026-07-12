import { randomUUID } from "crypto";
import type Database from "better-sqlite3";

import { commitAuditAtomic } from "@/lib/skills/skill-audit-atomic";
import { discoverOntology } from "./registry";
import { OntologyGovernanceError } from "./candidates";
import { registerOntologyDerivative, sourceForCanonicalDefinition } from "./validity";

export interface OntologyAlias {
  id: string;
  ontologyId: string;
  ontologyVersion: string;
  ontologyContentHash: string;
  namespace: string;
  alias: string;
  canonicalId: string;
  status: "active" | "redirected" | "deprecated" | "removed";
  priorTarget: string | null;
}

function clean(value: string, field: string): string {
  const result = value?.trim();
  if (!result) throw new OntologyGovernanceError(`${field} is required`, "invalid");
  return result;
}

function rowToAlias(row: Record<string, string>): OntologyAlias {
  return { id: row.id, ontologyId: row.ontology_id, ontologyVersion: row.ontology_version, ontologyContentHash: row.ontology_content_hash, namespace: row.namespace, alias: row.alias, canonicalId: row.canonical_id, status: row.status as OntologyAlias["status"], priorTarget: row.prior_target ?? null };
}

function canonicalExists(db: Database.Database, ontology: ReturnType<typeof discoverOntology>, namespace: string, canonicalId: string): boolean {
  if (ontology.definitions.some((definition) => definition.id === canonicalId)) return true;
  return Boolean(db.prepare(`SELECT 1 FROM ontology_canonical_definitions WHERE ontology_id = ? AND ontology_version = ? AND namespace = ? AND canonical_id = ?`).get(ontology.ontologyId, ontology.version, namespace, canonicalId));
}

export function registerOntologyAlias(db: Database.Database, input: { ontologyId: string; ontologyVersion: string; ontologyContentHash: string; namespace: string; alias: string; canonicalId: string; actor: string; reason: string }): OntologyAlias {
  const ontology = discoverOntology(db, { ontologyId: input.ontologyId, version: input.ontologyVersion });
  const fields = ["namespace", "alias", "canonicalId", "actor", "reason"] as const;
  for (const field of fields) clean(input[field], field);
  if (!ontology.globallyActive || ontology.contentHash !== input.ontologyContentHash || !input.canonicalId.startsWith(`${input.namespace}.`) || !canonicalExists(db, ontology, input.namespace, input.canonicalId)) throw new OntologyGovernanceError("alias requires a current authoritative canonical target", "unavailable");
  const source = sourceForCanonicalDefinition(db, {
    ontologyId: ontology.ontologyId,
    ontologyVersion: ontology.version,
    namespace: input.namespace,
    canonicalId: input.canonicalId,
  });
  if (!source) throw new OntologyGovernanceError("alias canonical source is revoked or unverified", "unavailable");
  const row = db.prepare(`SELECT * FROM ontology_aliases WHERE ontology_id = ? AND ontology_version = ? AND namespace = ? AND alias = ?`).get(ontology.ontologyId, ontology.version, input.namespace, input.alias) as Record<string, string> | undefined;
  if (row) {
    const existing = rowToAlias(row);
    if (existing.status === "active" && existing.canonicalId === input.canonicalId) return existing;
    throw new OntologyGovernanceError("alias is ambiguous or has a prior lifecycle record", "conflict");
  }
  const alias: OntologyAlias = { id: `ontalias_${randomUUID()}`, ontologyId: ontology.ontologyId, ontologyVersion: ontology.version, ontologyContentHash: ontology.contentHash, namespace: input.namespace, alias: input.alias, canonicalId: input.canonicalId, status: "active", priorTarget: null };
  return commitAuditAtomic(db, {
    actor: input.actor, eventType: "ontology_alias_lifecycle", entityType: "ontology_alias", entityId: alias.id, reason: input.reason,
    metadata: { alias_id: alias.id, ontology_id: alias.ontologyId, ontology_version: alias.ontologyVersion, ontology_content_hash: alias.ontologyContentHash, namespace: alias.namespace, alias: alias.alias, canonical_id: alias.canonicalId, action: "add" },
    body: () => {
      db.prepare(`INSERT INTO ontology_aliases (id, ontology_id, ontology_version, ontology_content_hash, namespace, alias, canonical_id, status, created_by, created_at, reason) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`).run(alias.id, alias.ontologyId, alias.ontologyVersion, alias.ontologyContentHash, alias.namespace, alias.alias, alias.canonicalId, input.actor, new Date().toISOString(), input.reason);
      registerOntologyDerivative(db, { ...source, derivativeType: "alias", derivativeId: alias.id });
      db.prepare(`INSERT INTO ontology_alias_lifecycle_audit (id, alias_id, action, prior_target, next_target, actor, reason, ontology_content_hash, created_at) VALUES (?, ?, 'add', NULL, ?, ?, ?, ?, ?)`).run(`ontaliasaudit_${randomUUID()}`, alias.id, alias.canonicalId, input.actor, input.reason, alias.ontologyContentHash, new Date().toISOString());
      return alias;
    },
  }).mutationResult as OntologyAlias;
}

export function resolveOntologyAlias(db: Database.Database, input: { ontologyId: string; ontologyVersion: string; namespace: string; submitted: string }): { canonicalId: string; aliasId: string | null; submitted: string } {
  const ontology = discoverOntology(db, { ontologyId: input.ontologyId, version: input.ontologyVersion });
  if (!ontology.globallyActive) throw new OntologyGovernanceError("ontology is unavailable for alias resolution", "unavailable");
  const rows = db.prepare(`SELECT * FROM ontology_aliases WHERE ontology_id = ? AND ontology_version = ? AND namespace = ? AND alias = ? AND status = 'active'`).all(ontology.ontologyId, ontology.version, input.namespace, input.submitted) as Array<Record<string, string>>;
  if (rows.length > 1) throw new OntologyGovernanceError("alias mapping is ambiguous", "conflict");
  if (rows.length === 1) {
    const source = sourceForCanonicalDefinition(db, {
      ontologyId: ontology.ontologyId,
      ontologyVersion: ontology.version,
      namespace: input.namespace,
      canonicalId: rows[0].canonical_id,
    });
    if (!source || !db.prepare(`SELECT 1 FROM ontology_derivative_validity WHERE derivative_type = 'alias' AND derivative_id = ? AND status = 'authoritative'`).get(rows[0].id)) {
      throw new OntologyGovernanceError("alias is revoked or unverified", "unavailable");
    }
    return { canonicalId: rows[0].canonical_id, aliasId: rows[0].id, submitted: input.submitted };
  }
  const canonical = db.prepare(`SELECT canonical_id FROM ontology_canonical_definitions WHERE ontology_id = ? AND ontology_version = ? AND namespace = ? AND canonical_id = ?`).get(ontology.ontologyId, ontology.version, input.namespace, input.submitted) as { canonical_id: string } | undefined;
  if (!canonical && !ontology.definitions.some((definition) => definition.id === input.submitted)) throw new OntologyGovernanceError("unknown alias or canonical type", "not_found");
  return { canonicalId: canonical?.canonical_id ?? input.submitted, aliasId: null, submitted: input.submitted };
}

export function transitionOntologyAlias(db: Database.Database, input: { aliasId: string; action: "redirect" | "deprecate" | "restore" | "remove"; canonicalId?: string; actor: string; reason: string }): OntologyAlias {
  const row = db.prepare(`SELECT * FROM ontology_aliases WHERE id = ?`).get(input.aliasId) as Record<string, string> | undefined;
  if (!row) throw new OntologyGovernanceError("alias not found", "not_found");
  const alias = rowToAlias(row);
  clean(input.actor, "actor"); clean(input.reason, "reason");
  const next = input.action === "redirect" ? "redirected" : input.action === "deprecate" ? "deprecated" : input.action === "restore" ? "active" : "removed";
  const target = input.action === "redirect" ? clean(input.canonicalId ?? "", "canonicalId") : alias.canonicalId;
  const ontology = discoverOntology(db, { ontologyId: alias.ontologyId, version: alias.ontologyVersion });
  if (input.action === "redirect" && (!target.startsWith(`${alias.namespace}.`) || !canonicalExists(db, ontology, alias.namespace, target))) throw new OntologyGovernanceError("redirect target must be an existing namespace canonical type", "invalid");
  return commitAuditAtomic(db, {
    actor: input.actor, eventType: "ontology_alias_lifecycle", entityType: "ontology_alias", entityId: alias.id, reason: input.reason,
    metadata: { alias_id: alias.id, action: input.action, prior_target: alias.canonicalId, next_target: target, ontology_content_hash: alias.ontologyContentHash },
    body: () => {
      db.prepare(`UPDATE ontology_aliases SET canonical_id = ?, status = ?, prior_target = ?, updated_by = ?, updated_at = ?, reason = ? WHERE id = ?`).run(target, next, alias.canonicalId, input.actor, new Date().toISOString(), input.reason, alias.id);
      db.prepare(`INSERT INTO ontology_alias_lifecycle_audit (id, alias_id, action, prior_target, next_target, actor, reason, ontology_content_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(`ontaliasaudit_${randomUUID()}`, alias.id, input.action, alias.canonicalId, target, input.actor, input.reason, alias.ontologyContentHash, new Date().toISOString());
      return { ...alias, canonicalId: target, priorTarget: alias.canonicalId, status: next as OntologyAlias["status"] };
    },
  }).mutationResult as OntologyAlias;
}

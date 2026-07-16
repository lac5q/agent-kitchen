// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

const ROOT = path.join(os.tmpdir(), `ontology-candidates-${crypto.randomUUID()}`);
const sourceHash = `sha256:${"a".repeat(64)}`;
const policyHash = `sha256:${"b".repeat(64)}`;
let db: import("better-sqlite3").Database;
let closeDb: () => void;

beforeEach(async () => {
  fs.rmSync(ROOT, { recursive: true, force: true });
  fs.mkdirSync(ROOT, { recursive: true });
  process.env.MEMROOS_ROOT = ROOT;
  process.env.SQLITE_DB_PATH = path.join(ROOT, "test.db");
  vi.resetModules();
  const database = await import("@/lib/db");
  db = database.getDb();
  closeDb = database.closeDb;
});
afterEach(() => {
  closeDb?.();
  delete process.env.MEMROOS_ROOT;
  delete process.env.SQLITE_DB_PATH;
  fs.rmSync(ROOT, { recursive: true, force: true });
});

async function setup() {
  const registry = await import("../registry");
  const ontology = registry.ensureCanonicalUpperOntology(db, "operator");
  return { registry, ontology, candidates: await import("../candidates"), aliases: await import("../aliases"), migrations: await import("../migrations") };
}

function migrationTarget(registry: typeof import("../registry"), source: { ontologyId: string; version: string; contentHash: string }) {
  const document = {
    id: source.ontologyId,
    version: "1.1.0",
    definitions: [...registry.CORE_VOCABULARY, { id: "migration.target", semantics: { kind: "entity" } }],
    relationships: [
      ...registry.CORE_RELATIONSHIPS,
      { from: "migration.target", to: "entity", type: "is_a" },
    ],
    parent: source,
  };
  const hash = registry.canonicalContentHash(document);
  return registry.publishOntologyVersion(db, {
    ...document,
    actor: "operator",
    suppliedHash: hash,
    projections: registry.ONTOLOGY_PROJECTIONS.map((projection) => ({ projection, contentHash: hash })),
  });
}

function seedMigrationSource(
  source: { ontologyId: string; version: string; contentHash: string },
  input: { tenantId: string; spaceId: string; recordType: string; recordId: string; sourceType: string }
) {
  const sourceId = `source:${input.recordType}:${input.recordId}`;
  const sourceLifecycleHash = `sha256:${"d".repeat(64)}`;
  const id = `source-record:${input.recordType}:${input.recordId}`;
  db.prepare(`INSERT INTO ontology_versioned_records (id, tenant_id, space_id, record_type, record_id, qualified_type, ontology_id, ontology_version, ontology_content_hash, legacy_type, mapping_path_json, created_at, source_id, source_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?, ?)`)
    .run(id, input.tenantId, input.spaceId, input.recordType, input.recordId, input.sourceType, source.ontologyId, source.version, source.contentHash, input.sourceType, new Date().toISOString(), sourceId, sourceLifecycleHash);
  db.prepare(`INSERT INTO ontology_source_lifecycle (tenant_id, space_id, source_id, source_hash, status, updated_at, updated_by, reason_code) VALUES (?, ?, ?, ?, 'active', ?, 'operator', 'test')`)
    .run(input.tenantId, input.spaceId, sourceId, sourceLifecycleHash, new Date().toISOString());
  db.prepare(`INSERT INTO ontology_derivative_validity (id, tenant_id, space_id, source_id, source_hash, derivative_type, derivative_id, status, created_at) VALUES (?, ?, ?, ?, ?, 'versioned_record', ?, 'authoritative', ?)`)
    .run(`valid:${id}`, input.tenantId, input.spaceId, sourceId, sourceLifecycleHash, id, new Date().toISOString());
}

function extraction() {
  return {
    tenantId: "tenant-a", spaceId: "space-a", sourceId: "source-1", sourceHash, sourceSpans: ["span:1"],
    extractorId: "extractor", extractorVersion: "1.0.0", candidateKind: "type" as const, namespace: "finance",
    proposed: { id: "finance.invoice", semantics: { kind: "entity" } }, confidenceLabel: "high" as const, confidenceScore: 0.9, actor: "agent-1",
  };
}

function seedPromotionContext(candidateId: string, tenantId: string, candidates: typeof import("../candidates")) {
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  candidates.registerOntologyPolicyContext(db, { tenantId, spaceId: "space-a", contextHash: policyHash, policyVersion: "test-policy", actor: "operator", expiresAt });
  const runId = `eval-${candidateId}`;
  db.prepare(`INSERT INTO eval_runs (id, trace_id, agent_id, role, composite_w, trusted, drift_agreement, drift_status, layer_breakdown_json, scorer_results_json, judge_provider, judge_model, judge_model_family, prompt_template_version, prompt_hash, golden_set_path, golden_set_version, config_hash, started_at, completed_at) VALUES (?, ?, ?, 'test', 1, 1, 1, 'stable', '{}', '{}', 'local', 'local', 'local', '1', 'hash', 'fixture', '1', 'hash', ?, ?)`).run(runId, `trace-${candidateId}`, "agent", new Date().toISOString(), new Date().toISOString());
  db.prepare(`INSERT INTO seal_proposals (id, trace_id, run_id, agent_id, proposal_type, status, diff_json, rationale, forecast_w_delta, baseline_w, baseline_run_id, baseline_layer_json, tenant_id) VALUES (?, ?, ?, 'agent', 'ontology_promotion', 'approved', ?, 'test', 0, 1, ?, '{}', ?)`).run(`seal-${candidateId}`, `trace-${candidateId}`, runId, JSON.stringify({ candidateId }), runId, tenantId);
  db.prepare(`INSERT INTO seal_proposal_decisions (id, proposal_id, action, operator, reasoning, tenant_id) VALUES (?, ?, 'approved', 'operator', 'test', ?)`).run(`decision-${candidateId}`, `seal-${candidateId}`, tenantId);
  return { expiresAt, sealProposalId: `seal-${candidateId}`, sealDecisionId: `decision-${candidateId}` };
}

describe("ontology candidate governance", () => {
  it("VAL-ONTO-010..013 creates scoped non-authoritative deterministic candidates and retains immutable evidence decisions", async () => {
    const { candidates } = await setup();
    const first = candidates.extractOntologyCandidate(db, extraction());
    const replay = candidates.extractOntologyCandidate(db, extraction());
    expect(replay.id).toBe(first.id);
    expect(first.status).toBe("pending");
    expect(() => candidates.getOntologyCandidate(db, first.id, "tenant-b", "space-a")).toThrow(/authorized scope/);
    expect(() => candidates.extractOntologyCandidate(db, { ...extraction(), confidenceLabel: "high", confidenceScore: 2 })).toThrow(/confidence/);
    const approved = candidates.decideOntologyCandidate(db, { candidateId: first.id, tenantId: "tenant-a", spaceId: "space-a", decision: "approve", reviewerId: "operator", reason: "reviewed" });
    expect(approved.status).toBe("approved");
    const decision = db.prepare(`SELECT original_json, evidence_hash, source_hash FROM ontology_candidate_decisions WHERE candidate_id = ?`).get(first.id) as { original_json: string; evidence_hash: string; source_hash: string };
    expect(decision).toMatchObject({ evidence_hash: first.evidenceHash, source_hash: sourceHash });
    expect(decision.original_json).toContain("finance.invoice");
    candidates.extractOntologyCandidate(db, { ...extraction(), sourceHash: `sha256:${"c".repeat(64)}` });
    expect(candidates.getOntologyCandidate(db, first.id, "tenant-a", "space-a").status).toBe("invalidated");
  });

  it("VAL-ONTO-014..016 requires complete current governed context, commits atomically, and separates ontology from belief promotion", async () => {
    const { ontology, candidates } = await setup();
    const candidate = candidates.extractOntologyCandidate(db, extraction());
    candidates.decideOntologyCandidate(db, { candidateId: candidate.id, tenantId: candidate.tenantId, spaceId: candidate.spaceId, decision: "approve", reviewerId: "operator", reason: "reviewed" });
    const input = { candidateId: candidate.id, tenantId: candidate.tenantId, spaceId: candidate.spaceId, ...seedPromotionContext(candidate.id, candidate.tenantId, candidates), ontologyId: ontology.ontologyId, ontologyVersion: ontology.version, ontologyContentHash: ontology.contentHash, namespace: "finance", policyContextHash: policyHash, reviewerId: "operator", idempotencyKey: "test-only-ontology-promotion-retry-key" };
    expect(() => candidates.promoteOntologyCandidate(db, { ...input, policyContextHash: "bad" })).toThrow(/incomplete/);
    const promotion = candidates.promoteOntologyCandidate(db, input);
    expect(candidates.promoteOntologyCandidate(db, input)).toEqual(promotion);
    expect(db.prepare(`SELECT COUNT(*) AS count FROM ontology_canonical_definitions`).get()).toMatchObject({ count: 1 });
    expect(db.prepare(`SELECT belief_stage FROM agent_memory_candidates WHERE id = ?`).get(candidate.id)).toBeUndefined();
  });

  it("VAL-ONTO-017..018 resolves only unambiguous non-destructive aliases with lifecycle evidence", async () => {
    const { ontology, candidates, aliases } = await setup();
    const candidate = candidates.extractOntologyCandidate(db, extraction());
    candidates.decideOntologyCandidate(db, { candidateId: candidate.id, tenantId: candidate.tenantId, spaceId: candidate.spaceId, decision: "approve", reviewerId: "operator", reason: "reviewed" });
    candidates.promoteOntologyCandidate(db, { candidateId: candidate.id, tenantId: candidate.tenantId, spaceId: candidate.spaceId, ...seedPromotionContext(candidate.id, candidate.tenantId, candidates), ontologyId: ontology.ontologyId, ontologyVersion: ontology.version, ontologyContentHash: ontology.contentHash, namespace: "finance", policyContextHash: policyHash, reviewerId: "operator", idempotencyKey: "k" });
    const alias = aliases.registerOntologyAlias(db, { ontologyId: ontology.ontologyId, ontologyVersion: ontology.version, ontologyContentHash: ontology.contentHash, namespace: "finance", alias: "invoice", canonicalId: "finance.invoice", actor: "operator", reason: "compatibility" });
    expect(aliases.resolveOntologyAlias(db, { ontologyId: ontology.ontologyId, ontologyVersion: ontology.version, namespace: "finance", submitted: "invoice" })).toMatchObject({ canonicalId: "finance.invoice", aliasId: alias.id, submitted: "invoice" });
    expect(() => aliases.registerOntologyAlias(db, { ontologyId: ontology.ontologyId, ontologyVersion: ontology.version, ontologyContentHash: ontology.contentHash, namespace: "finance", alias: "invoice", canonicalId: "finance.other", actor: "operator", reason: "collision" })).toThrow(/canonical target/);
    expect(aliases.transitionOntologyAlias(db, { aliasId: alias.id, action: "deprecate", actor: "operator", reason: "replace" }).status).toBe("deprecated");
    expect(db.prepare(`SELECT COUNT(*) AS count FROM ontology_alias_lifecycle_audit WHERE alias_id = ?`).get(alias.id)).toMatchObject({ count: 2 });
  });

  it("VAL-ONTO-019..025 plans approved additive migrations and fails closed for ambiguous mappings", async () => {
    const { registry, ontology, migrations, candidates } = await setup();
    const target = migrationTarget(registry, ontology);
    seedMigrationSource(ontology, { tenantId: "tenant-a", spaceId: "space-a", recordType: "knowledge", recordId: "r1", sourceType: "legacy_invoice" });
    seedMigrationSource(ontology, { tenantId: "tenant-a", spaceId: "space-a", recordType: "knowledge", recordId: "r2", sourceType: "ambiguous" });
    const plan = migrations.planOntologyMigration(db, { tenantId: "tenant-a", spaceId: "space-a", source: { ontologyId: ontology.ontologyId, version: ontology.version, hash: ontology.contentHash }, target: { ontologyId: target.ontologyId, version: target.version, hash: target.contentHash }, mappings: { legacy_invoice: ["memory"], ambiguous: ["memory", "entity"] }, actor: "operator" });
    expect(plan.snapshot).toMatchObject({ inventoryHash: expect.stringMatching(/^sha256:/), itemCount: 2 });
    expect(db.prepare(`SELECT COUNT(*) AS count FROM ontology_migration_snapshot_items WHERE snapshot_id = ?`).get(plan.snapshot.id)).toMatchObject({ count: 2 });
    expect(() => migrations.executeOntologyMigration(db, { planId: plan.id, tenantId: plan.tenantId, spaceId: plan.spaceId, actor: "operator" })).toThrow(/approved/);
    const approved = migrations.approveOntologyMigration(db, { planId: plan.id, tenantId: plan.tenantId, spaceId: plan.spaceId, planHash: plan.planHash, actor: "operator" });
    const result = migrations.executeOntologyMigration(db, { planId: plan.id, tenantId: plan.tenantId, spaceId: plan.spaceId, actor: "operator" });
    expect(approved.status).toBe("approved");
    expect(result).toMatchObject({ migrated: 1, reviewRequired: 1, plan: { status: "incomplete" } });
    expect(db.prepare(`SELECT target_type FROM ontology_migration_checkpoints WHERE record_id = 'r2'`).get()).toMatchObject({ target_type: null });
    const checkpointAudits = db.prepare(`SELECT COUNT(*) AS count FROM audit_entries WHERE event_type = 'ontology_migration_checkpointed'`).get() as { count: number };
    expect(migrations.executeOntologyMigration(db, { planId: plan.id, tenantId: plan.tenantId, spaceId: plan.spaceId, actor: "operator" }))
      .toMatchObject({ migrated: 1, reviewRequired: 1, plan: { status: "incomplete" } });
    expect(db.prepare(`SELECT COUNT(*) AS count FROM audit_entries WHERE event_type = 'ontology_migration_checkpointed'`).get()).toEqual(checkpointAudits);
    expect(db.prepare(`SELECT COUNT(*) AS count FROM ontology_versioned_records WHERE migration_snapshot_id = ?`).get(plan.snapshot.id)).toMatchObject({ count: 1 });
    expect(candidates.ontologyReceiptContext(db, { tenantId: "tenant-a", spaceId: "space-a", recordType: "knowledge", recordId: "r1" })).toMatchObject({ ontologyId: ontology.ontologyId, canonicalId: "memory" });
  });

  it("VAL-ONTO-024 links safe ontology coordinates into policy receipts", async () => {
    const { registry, ontology, migrations, candidates } = await setup();
    const target = migrationTarget(registry, ontology);
    seedMigrationSource(ontology, { tenantId: "default-tenant", spaceId: "space-a", recordType: "memory", recordId: "m1", sourceType: "legacy" });
    const plan = migrations.planOntologyMigration(db, { tenantId: "default-tenant", spaceId: "space-a", source: { ontologyId: ontology.ontologyId, version: ontology.version, hash: ontology.contentHash }, target: { ontologyId: target.ontologyId, version: target.version, hash: target.contentHash }, mappings: { legacy: ["memory"] }, actor: "operator" });
    migrations.approveOntologyMigration(db, { planId: plan.id, tenantId: plan.tenantId, spaceId: plan.spaceId, planHash: plan.planHash, actor: "operator" });
    migrations.executeOntologyMigration(db, { planId: plan.id, tenantId: plan.tenantId, spaceId: plan.spaceId, actor: "operator" });
    const context = candidates.ontologyReceiptContext(db, { tenantId: "default-tenant", spaceId: "space-a", recordType: "memory", recordId: "m1" });
    const policy = await import("@/lib/policy/engine");
    expect(policy.buildReceipt({ domain: "knowledge", action: "read", ontologyContext: context as never }, { outcome: "allow", reason: "safe", ruleMatched: "test" }).ontology).toMatchObject({ ontologyId: ontology.ontologyId, canonicalId: "memory" });
    const evaluation = policy.evaluatePolicy({
      domain: "knowledge",
      action: "read",
      actor: { id: "operator", role: "operator", tenantId: "default-tenant" },
      ontologyReference: { tenantId: "default-tenant", spaceId: "space-a", recordType: "memory", recordId: "m1" },
    }, db);
    expect(evaluation.receipt.ontology).toMatchObject({ canonicalId: "memory", sourceId: "source:memory:m1" });
    expect(() => policy.evaluatePolicy({
      domain: "knowledge",
      action: "read",
      actor: { id: "operator", role: "operator", tenantId: "default-tenant" },
      ontologyContext: context as never,
    }, db)).toThrow(/caller-supplied/);
  });

  it("rolls back an item when its checkpoint audit cannot persist", async () => {
    const { registry, ontology, migrations } = await setup();
    const target = migrationTarget(registry, ontology);
    seedMigrationSource(ontology, { tenantId: "tenant-a", spaceId: "space-a", recordType: "knowledge", recordId: "fault-record", sourceType: "legacy" });
    const plan = migrations.planOntologyMigration(db, {
      tenantId: "tenant-a", spaceId: "space-a",
      source: { ontologyId: ontology.ontologyId, version: ontology.version, hash: ontology.contentHash },
      target: { ontologyId: target.ontologyId, version: target.version, hash: target.contentHash },
      mappings: { legacy: ["memory"] }, actor: "operator",
    });
    migrations.approveOntologyMigration(db, { planId: plan.id, tenantId: plan.tenantId, spaceId: plan.spaceId, planHash: plan.planHash, actor: "operator" });
    db.exec(`CREATE TRIGGER deny_migration_checkpoint_audit BEFORE INSERT ON audit_entries
      WHEN NEW.event_type = 'ontology_migration_checkpointed' BEGIN SELECT RAISE(ABORT, 'fault'); END;`);
    expect(() => migrations.executeOntologyMigration(db, { planId: plan.id, tenantId: plan.tenantId, spaceId: plan.spaceId, actor: "operator" }))
      .toThrow(/audit|fault/);
    expect(db.prepare(`SELECT COUNT(*) AS count FROM ontology_migration_checkpoints WHERE plan_id = ?`).get(plan.id)).toMatchObject({ count: 0 });
    expect(db.prepare(`SELECT COUNT(*) AS count FROM ontology_versioned_records WHERE migration_snapshot_id = ?`).get(plan.snapshot.id)).toMatchObject({ count: 0 });
  });

  it("retries final reconciliation after its audit fails without duplicating committed item work", async () => {
    const { registry, ontology, migrations } = await setup();
    const target = migrationTarget(registry, ontology);
    seedMigrationSource(ontology, { tenantId: "tenant-a", spaceId: "space-a", recordType: "knowledge", recordId: "final-audit-fault-record", sourceType: "legacy" });
    const plan = migrations.planOntologyMigration(db, {
      tenantId: "tenant-a", spaceId: "space-a",
      source: { ontologyId: ontology.ontologyId, version: ontology.version, hash: ontology.contentHash },
      target: { ontologyId: target.ontologyId, version: target.version, hash: target.contentHash },
      mappings: { legacy: ["memory"] }, actor: "operator",
    });
    migrations.approveOntologyMigration(db, { planId: plan.id, tenantId: plan.tenantId, spaceId: plan.spaceId, planHash: plan.planHash, actor: "operator" });
    db.exec(`CREATE TRIGGER deny_migration_final_audit BEFORE INSERT ON audit_entries
      WHEN NEW.event_type = 'ontology_migration_execution_reconciled' BEGIN SELECT RAISE(ABORT, 'fault'); END;`);

    expect(() => migrations.executeOntologyMigration(db, { planId: plan.id, tenantId: plan.tenantId, spaceId: plan.spaceId, actor: "operator" }))
      .toThrow(/audit|fault/);
    expect(db.prepare(`SELECT status FROM ontology_migration_plans WHERE id = ?`).get(plan.id))
      .toMatchObject({ status: "approved" });
    expect(db.prepare(`SELECT COUNT(*) AS count FROM ontology_migration_checkpoints WHERE plan_id = ?`).get(plan.id))
      .toMatchObject({ count: 1 });
    expect(db.prepare(`SELECT COUNT(*) AS count FROM ontology_versioned_records WHERE migration_snapshot_id = ?`).get(plan.snapshot.id))
      .toMatchObject({ count: 1 });
    expect(db.prepare(`SELECT COUNT(*) AS count FROM audit_entries WHERE event_type = 'ontology_migration_execution_reconciled'`).get())
      .toMatchObject({ count: 0 });

    db.exec(`DROP TRIGGER deny_migration_final_audit;`);
    expect(migrations.executeOntologyMigration(db, { planId: plan.id, tenantId: plan.tenantId, spaceId: plan.spaceId, actor: "operator" }))
      .toMatchObject({ migrated: 1, reviewRequired: 0, plan: { status: "completed" } });
    expect(db.prepare(`SELECT COUNT(*) AS count FROM ontology_migration_checkpoints WHERE plan_id = ?`).get(plan.id))
      .toMatchObject({ count: 1 });
    expect(db.prepare(`SELECT COUNT(*) AS count FROM ontology_versioned_records WHERE migration_snapshot_id = ?`).get(plan.snapshot.id))
      .toMatchObject({ count: 1 });
    expect(db.prepare(`SELECT COUNT(*) AS count FROM audit_entries WHERE event_type = 'ontology_migration_execution_reconciled'`).get())
      .toMatchObject({ count: 1 });
  });

  it("revokes all candidate-derived authority on source change while retaining safe historic rows", async () => {
    const { ontology, candidates, aliases } = await setup();
    const candidate = candidates.extractOntologyCandidate(db, extraction());
    candidates.decideOntologyCandidate(db, { candidateId: candidate.id, tenantId: candidate.tenantId, spaceId: candidate.spaceId, decision: "approve", reviewerId: "operator", reason: "reviewed" });
    const promotion = candidates.promoteOntologyCandidate(db, {
      candidateId: candidate.id, tenantId: candidate.tenantId, spaceId: candidate.spaceId,
      ...seedPromotionContext(candidate.id, candidate.tenantId, candidates),
      ontologyId: ontology.ontologyId, ontologyVersion: ontology.version, ontologyContentHash: ontology.contentHash,
      namespace: "finance", policyContextHash: policyHash, reviewerId: "operator", idempotencyKey: "source-revocation",
    });
    const alias = aliases.registerOntologyAlias(db, {
      ontologyId: ontology.ontologyId, ontologyVersion: ontology.version, ontologyContentHash: ontology.contentHash,
      namespace: "finance", alias: "invoice", canonicalId: "finance.invoice", actor: "operator", reason: "compatibility",
    });
    const validity = await import("../validity");
    expect(validity.revokeOntologySource(db, {
      tenantId: candidate.tenantId, spaceId: candidate.spaceId, sourceId: candidate.sourceId, sourceHash: candidate.sourceHash,
      actor: "operator", reason: "source_changed",
    })).toMatchObject({ reason: "source_changed" });
    expect(candidates.getOntologyCandidate(db, candidate.id, candidate.tenantId, candidate.spaceId).status).toBe("invalidated");
    expect(() => aliases.resolveOntologyAlias(db, {
      ontologyId: ontology.ontologyId, ontologyVersion: ontology.version, namespace: "finance", submitted: "invoice",
    })).toThrow(/revoked|unverified/);
    expect(db.prepare(`SELECT COUNT(*) AS count FROM ontology_derivative_validity WHERE status = 'revoked' AND derivative_id IN (?, ?, ?)`)
      .get(candidate.id, promotion.id, alias.id)).toMatchObject({ count: 3 });
    expect(db.prepare(`SELECT COUNT(*) AS count FROM ontology_candidate_decisions WHERE candidate_id = ?`).get(candidate.id))
      .toMatchObject({ count: 1 });
  });

  it("fails atomically when a required source-revocation receipt cannot persist", async () => {
    const { candidates } = await setup();
    const candidate = candidates.extractOntologyCandidate(db, extraction());
    const validity = await import("../validity");
    db.exec(`CREATE TRIGGER deny_ontology_revocation_audit BEFORE INSERT ON audit_entries
      WHEN NEW.event_type = 'ontology_source_revoked' BEGIN SELECT RAISE(ABORT, 'fault'); END;`);
    expect(() => validity.revokeOntologySource(db, {
      tenantId: candidate.tenantId, spaceId: candidate.spaceId, sourceId: candidate.sourceId, sourceHash: candidate.sourceHash,
      actor: "operator", reason: "source_erased",
    })).toThrow(/audit|fault/);
    expect(db.prepare(`SELECT status FROM ontology_source_lifecycle WHERE tenant_id = ? AND space_id = ? AND source_id = ? AND source_hash = ?`)
      .get(candidate.tenantId, candidate.spaceId, candidate.sourceId, candidate.sourceHash)).toMatchObject({ status: "active" });
    expect(db.prepare(`SELECT status FROM ontology_derivative_validity WHERE derivative_type = 'candidate' AND derivative_id = ?`)
      .get(candidate.id)).toMatchObject({ status: "authoritative" });
  });
});

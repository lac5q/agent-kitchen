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
    const { ontology, migrations, candidates } = await setup();
    const plan = migrations.planOntologyMigration(db, { tenantId: "tenant-a", spaceId: "space-a", source: { ontologyId: ontology.ontologyId, version: ontology.version, hash: ontology.contentHash }, target: { ontologyId: ontology.ontologyId, version: ontology.version, hash: ontology.contentHash }, mappings: { legacy_invoice: ["memory"], ambiguous: ["memory", "entity"] }, actor: "operator" });
    expect(() => migrations.executeOntologyMigration(db, { planId: plan.id, tenantId: plan.tenantId, spaceId: plan.spaceId, actor: "operator", records: [] })).toThrow(/approved/);
    const approved = migrations.approveOntologyMigration(db, { planId: plan.id, tenantId: plan.tenantId, spaceId: plan.spaceId, planHash: plan.planHash, actor: "operator" });
    const result = migrations.executeOntologyMigration(db, { planId: plan.id, tenantId: plan.tenantId, spaceId: plan.spaceId, actor: "operator", records: [{ recordType: "knowledge", recordId: "r1", sourceType: "legacy_invoice" }, { recordType: "knowledge", recordId: "r2", sourceType: "ambiguous" }] });
    expect(approved.status).toBe("approved");
    expect(result).toMatchObject({ migrated: 1, reviewRequired: 1, plan: { status: "incomplete" } });
    expect(db.prepare(`SELECT target_type FROM ontology_migration_checkpoints WHERE record_id = 'r2'`).get()).toMatchObject({ target_type: null });
    expect(candidates.ontologyReceiptContext(db, { tenantId: "tenant-a", spaceId: "space-a", recordType: "knowledge", recordId: "r1" })).toMatchObject({ ontologyId: ontology.ontologyId, canonicalId: "memory" });
  });

  it("VAL-ONTO-024 links safe ontology coordinates into policy receipts", async () => {
    const { ontology, migrations, candidates } = await setup();
    const plan = migrations.planOntologyMigration(db, { tenantId: "tenant-a", spaceId: "space-a", source: { ontologyId: ontology.ontologyId, version: ontology.version, hash: ontology.contentHash }, target: { ontologyId: ontology.ontologyId, version: ontology.version, hash: ontology.contentHash }, mappings: { legacy: ["memory"] }, actor: "operator" });
    migrations.approveOntologyMigration(db, { planId: plan.id, tenantId: plan.tenantId, spaceId: plan.spaceId, planHash: plan.planHash, actor: "operator" });
    migrations.executeOntologyMigration(db, { planId: plan.id, tenantId: plan.tenantId, spaceId: plan.spaceId, actor: "operator", records: [{ recordType: "memory", recordId: "m1", sourceType: "legacy" }] });
    const context = candidates.ontologyReceiptContext(db, { tenantId: "tenant-a", spaceId: "space-a", recordType: "memory", recordId: "m1" });
    const policy = await import("@/lib/policy/engine");
    expect(policy.buildReceipt({ domain: "knowledge", action: "read", ontologyContext: context as never }, { outcome: "allow", reason: "safe", ruleMatched: "test" }).ontology).toMatchObject({ ontologyId: ontology.ontologyId, canonicalId: "memory" });
  });
});

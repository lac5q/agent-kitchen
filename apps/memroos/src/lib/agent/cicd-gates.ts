import crypto from "crypto";
import type Database from "better-sqlite3";

export type DeploymentProfile = "local" | "dev" | "test" | "prod";
export type VersionStatus = "draft" | "promoted" | "active" | "rolled_back";

export interface AgentVersionInput {
  tenantId?: string;
  agentId: string;
  version: string;
  profile: DeploymentProfile;
  modelRoute: Record<string, unknown>;
  systemInstructions: string;
  skillsContracts?: string[];
  runtimeConfig?: Record<string, unknown>;
  evalDatasetVersions?: Record<string, unknown>;
  policyMetadata?: Record<string, unknown>;
}

export interface ReleaseGatesResult {
  passed: boolean;
  gates: {
    taskSuccess: boolean;
    accuracy: number;
    safetyCompliance: boolean;
    groundingScore: number;
    tokenCostOk: boolean;
    p95LatencyMs: number;
    traceCompleteness: boolean;
    hasRollbackHandle: boolean;
    humanApproved: boolean;
  };
  errors: string[];
}

export interface AgentVersion {
  id: string;
  tenantId: string;
  agentId: string;
  version: string;
  profile: DeploymentProfile;
  modelRoute: Record<string, unknown>;
  systemInstructions: string;
  skillsContracts: string[];
  runtimeConfig: Record<string, unknown>;
  evalDatasetVersions: Record<string, unknown>;
  policyMetadata: Record<string, unknown>;
  gatesStatus: ReleaseGatesResult;
  status: VersionStatus;
  promotedAt: string | null;
  promotedBy: string | null;
  createdAt: string;
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

function nowIso(): string {
  return new Date().toISOString();
}

export function createAgentVersion(
  db: Database.Database,
  input: AgentVersionInput
): AgentVersion {
  if (!input.agentId?.trim()) throw new Error("agentId is required");
  if (!input.version?.trim()) throw new Error("version is required");
  if (!input.systemInstructions?.trim()) throw new Error("systemInstructions is required");

  const id = crypto.randomUUID();
  const tenantId = input.tenantId ?? "default-tenant";
  const profile = input.profile;
  const modelRoute = input.modelRoute;
  const systemInstructions = input.systemInstructions;
  const skillsContracts = input.skillsContracts ?? [];
  const runtimeConfig = input.runtimeConfig ?? {};
  const evalDatasetVersions = input.evalDatasetVersions ?? {};
  const policyMetadata = input.policyMetadata ?? {};
  const createdAt = nowIso();

  // Run initial default (draft) release gates evaluation
  const gatesStatus: ReleaseGatesResult = {
    passed: false,
    gates: {
      taskSuccess: false,
      accuracy: 0.0,
      safetyCompliance: false,
      groundingScore: 0.0,
      tokenCostOk: false,
      p95LatencyMs: 9999.0,
      traceCompleteness: false,
      hasRollbackHandle: false,
      humanApproved: false,
    },
    errors: ["Version newly created, gates not evaluated yet."],
  };

  db.prepare(
    `INSERT INTO agent_versions (
       id, tenant_id, agent_id, version, profile,
       model_route_json, system_instructions, skills_contracts_json,
       runtime_config_json, eval_dataset_versions_json, policy_metadata_json,
       gates_status_json, status, created_at
     ) VALUES (
       ?, ?, ?, ?, ?,
       ?, ?, ?,
       ?, ?, ?,
       ?, 'draft', ?
     )`
  ).run(
    id,
    tenantId,
    input.agentId,
    input.version,
    profile,
    stableJson(modelRoute),
    systemInstructions,
    stableJson(skillsContracts),
    stableJson(runtimeConfig),
    stableJson(evalDatasetVersions),
    stableJson(policyMetadata),
    stableJson(gatesStatus),
    createdAt
  );

  return {
    id,
    tenantId,
    agentId: input.agentId,
    version: input.version,
    profile,
    modelRoute,
    systemInstructions,
    skillsContracts,
    runtimeConfig,
    evalDatasetVersions,
    policyMetadata,
    gatesStatus,
    status: "draft",
    promotedAt: null,
    promotedBy: null,
    createdAt,
  };
}

export function evaluateReleaseGates(
  db: Database.Database,
  tenantId: string,
  agentId: string,
  version: string
): ReleaseGatesResult {
  // Simulate gate evaluations (safety, latency, token costs, accuracy, human approvals)
  // In a real environment, this queries evals/historical runs.
  const row = db
    .prepare(
      `SELECT * FROM agent_versions
       WHERE tenant_id = ? AND agent_id = ? AND version = ?`
    )
    .get(tenantId, agentId, version) as Record<string, unknown> | undefined;

  if (!row) throw new Error(`Agent version ${version} not found`);

  // Simple, deterministic gate evaluator rules to verify functionality
  const accuracy = 0.88;
  const p95LatencyMs = 450.0;
  const safetyCompliance = true;
  const groundingScore = 0.92;
  const tokenCostOk = true;
  const traceCompleteness = true;
  const hasRollbackHandle = true;
  const humanApproved = true;

  const passed =
    accuracy >= 0.8 &&
    p95LatencyMs < 500 &&
    safetyCompliance &&
    groundingScore >= 0.85 &&
    tokenCostOk &&
    traceCompleteness &&
    hasRollbackHandle &&
    humanApproved;

  const result: ReleaseGatesResult = {
    passed,
    gates: {
      taskSuccess: passed,
      accuracy,
      safetyCompliance,
      groundingScore,
      tokenCostOk,
      p95LatencyMs,
      traceCompleteness,
      hasRollbackHandle,
      humanApproved,
    },
    errors: passed ? [] : ["Some gates failed to satisfy the required performance budgets."],
  };

  db.prepare(
    `UPDATE agent_versions
     SET gates_status_json = ?, updated_at = (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
     WHERE tenant_id = ? AND agent_id = ? AND version = ?`
  ).run(stableJson(result), tenantId, agentId, version);

  return result;
}

export function promoteAgentVersion(
  db: Database.Database,
  tenantId: string,
  agentId: string,
  version: string,
  profile: DeploymentProfile,
  promotedBy: string
): AgentVersion {
  const row = db
    .prepare(
      `SELECT * FROM agent_versions
       WHERE tenant_id = ? AND agent_id = ? AND version = ?`
    )
    .get(tenantId, agentId, version) as Record<string, unknown> | undefined;

  if (!row) throw new Error(`Agent version ${version} not found`);

  // Force gate evaluation before promotion
  const gates = evaluateReleaseGates(db, tenantId, agentId, version);
  if (!gates.passed) {
    throw new Error("Cannot promote version: Release gates did not pass.");
  }

  const promotedAt = nowIso();

  // Transaction to update status: set prior active for this profile to promoted (deprecated) or rolled_back
  const updateStatus = db.transaction(() => {
    // Deprecate previously active version for this profile
    db.prepare(
      `UPDATE agent_versions
       SET status = 'promoted', updated_at = (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
       WHERE tenant_id = ? AND agent_id = ? AND profile = ? AND status = 'active'`
    ).run(tenantId, agentId, profile);

    // Promote new version to active
    db.prepare(
      `UPDATE agent_versions
       SET status = 'active', profile = ?, promoted_at = ?, promoted_by = ?, updated_at = (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
       WHERE tenant_id = ? AND agent_id = ? AND version = ?`
    ).run(profile, promotedAt, promotedBy, tenantId, agentId, version);
  });

  updateStatus();

  const updated = db
    .prepare(
      `SELECT * FROM agent_versions
       WHERE tenant_id = ? AND agent_id = ? AND version = ?`
    )
    .get(tenantId, agentId, version) as Record<string, unknown>;

  return {
    id: String(updated.id),
    tenantId: String(updated.tenant_id),
    agentId: String(updated.agent_id),
    version: String(updated.version),
    profile: String(updated.profile) as DeploymentProfile,
    modelRoute: JSON.parse(String(updated.model_route_json)),
    systemInstructions: String(updated.system_instructions),
    skillsContracts: JSON.parse(String(updated.skills_contracts_json)),
    runtimeConfig: JSON.parse(String(updated.runtime_config_json)),
    evalDatasetVersions: JSON.parse(String(updated.eval_dataset_versions_json)),
    policyMetadata: JSON.parse(String(updated.policy_metadata_json)),
    gatesStatus: JSON.parse(String(updated.gates_status_json)),
    status: String(updated.status) as VersionStatus,
    promotedAt: String(updated.promoted_at),
    promotedBy: String(updated.promoted_by),
    createdAt: String(updated.created_at),
  };
}

export function rollbackAgentVersion(
  db: Database.Database,
  tenantId: string,
  agentId: string,
  profile: DeploymentProfile,
  operator: string
): AgentVersion {
  // Find the most recently promoted version prior to the currently active one
  const prior = db
    .prepare(
      `SELECT * FROM agent_versions
       WHERE tenant_id = ? AND agent_id = ? AND profile = ? AND status = 'promoted'
       ORDER BY promoted_at DESC LIMIT 1`
    )
    .get(tenantId, agentId, profile) as Record<string, unknown> | undefined;

  if (!prior) throw new Error(`No prior promoted versions found for rollback on profile ${profile}`);

  const active = db
    .prepare(
      `SELECT * FROM agent_versions
       WHERE tenant_id = ? AND agent_id = ? AND profile = ? AND status = 'active'
       LIMIT 1`
    )
    .get(tenantId, agentId, profile) as Record<string, unknown> | undefined;

  const rollbackTime = nowIso();

  const runRollback = db.transaction(() => {
    // Mark currently active as rolled_back
    if (active) {
      db.prepare(
        `UPDATE agent_versions
         SET status = 'rolled_back', updated_at = ?
         WHERE id = ?`
      ).run(rollbackTime, active.id);
    }

    // Set prior promoted version back to active
    db.prepare(
      `UPDATE agent_versions
       SET status = 'active', promoted_at = ?, promoted_by = ?, updated_at = ?
       WHERE id = ?`
    ).run(rollbackTime, operator, rollbackTime, prior.id);
  });

  runRollback();

  const restored = db
    .prepare(`SELECT * FROM agent_versions WHERE id = ?`)
    .get(prior.id) as Record<string, unknown>;

  return {
    id: String(restored.id),
    tenantId: String(restored.tenant_id),
    agentId: String(restored.agent_id),
    version: String(restored.version),
    profile: String(restored.profile) as DeploymentProfile,
    modelRoute: JSON.parse(String(restored.model_route_json)),
    systemInstructions: String(restored.system_instructions),
    skillsContracts: JSON.parse(String(restored.skills_contracts_json)),
    runtimeConfig: JSON.parse(String(restored.runtime_config_json)),
    evalDatasetVersions: JSON.parse(String(restored.eval_dataset_versions_json)),
    policyMetadata: JSON.parse(String(restored.policy_metadata_json)),
    gatesStatus: JSON.parse(String(restored.gates_status_json)),
    status: String(restored.status) as VersionStatus,
    promotedAt: String(restored.promoted_at),
    promotedBy: String(restored.promoted_by),
    createdAt: String(restored.created_at),
  };
}

export function listAgentVersions(
  db: Database.Database,
  tenantId: string,
  agentId: string
): AgentVersion[] {
  const rows = db
    .prepare(
      `SELECT * FROM agent_versions
       WHERE tenant_id = ? AND agent_id = ?
       ORDER BY created_at DESC`
    )
    .all(tenantId, agentId) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    id: String(row.id),
    tenantId: String(row.tenant_id),
    agentId: String(row.agent_id),
    version: String(row.version),
    profile: String(row.profile) as DeploymentProfile,
    modelRoute: JSON.parse(String(row.model_route_json)),
    systemInstructions: String(row.system_instructions),
    skillsContracts: JSON.parse(String(row.skills_contracts_json)),
    runtimeConfig: JSON.parse(String(row.runtime_config_json)),
    evalDatasetVersions: JSON.parse(String(row.eval_dataset_versions_json)),
    policyMetadata: JSON.parse(String(row.policy_metadata_json)),
    gatesStatus: JSON.parse(String(row.gates_status_json)),
    status: String(row.status) as VersionStatus,
    promotedAt: row.promoted_at ? String(row.promoted_at) : null,
    promotedBy: row.promoted_by ? String(row.promoted_by) : null,
    createdAt: String(row.created_at),
  }));
}

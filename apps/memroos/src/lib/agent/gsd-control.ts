import crypto from "crypto";
import type Database from "better-sqlite3";

import {
  buildAgentContextPacket,
  type AgentContextLane,
  type AgentContextPacket,
  type AgentRunLedger,
} from "@/lib/agent/context-packet";
import { createAgentCheckpoint } from "@/lib/agent/checkpoints";

export const GSD_LANES: AgentContextLane[] = [
  "research",
  "code",
  "memory",
  "deployment",
  "email_doc",
  "gtm",
  "safety",
  "ops",
];

export const LANE_REQUIRED_PROOF: Record<AgentContextLane, string[]> = {
  research: ["source_receipts"],
  code: ["focused_tests"],
  memory: ["memory_write_receipt"],
  deployment: ["deploy_verification"],
  email_doc: ["sent_or_shared_receipt"],
  gtm: ["artifact_review"],
  safety: ["safety_review"],
  ops: ["operator_receipt"],
};

export interface GsdGoalInput {
  goalId?: string;
  title: string;
  actorAgentId: string;
  ownerAgentId?: string;
  lane?: AgentContextLane;
  acceptanceCriteria?: string[];
  requiredVerification?: string[];
  forbiddenActions?: string[];
  approvalRequired?: string[];
  scope?: AgentContextPacket["scope"];
  now?: () => Date;
}

export interface GsdGoalResult {
  goalId: string;
  packet: AgentContextPacket;
  ledger: AgentRunLedger;
  checkpointId: string;
  hiveActionId: number;
}

export interface GsdShipcheckInput {
  goalId: string;
  actorAgentId: string;
  lane?: AgentContextLane;
  proof?: Record<string, unknown>;
  bypassReason?: string;
  now?: () => Date;
}

export interface GsdShipcheckResult {
  goalId: string;
  lane: AgentContextLane;
  status: "verified" | "bypassed" | "blocked";
  requiredProof: string[];
  missingProof: string[];
  packetHash: string;
  receiptId?: number;
  bypassReason?: string;
  message?: string;
}

export interface GsdResumeResult {
  goalId: string;
  packet: AgentContextPacket;
  ledger: AgentRunLedger;
  resume: {
    status: string;
    nextAction: string | null;
    latestEvents: string[];
    pendingApprovals: string[];
    latestProofReceipts: string[];
    handoff?: string;
  };
}

export interface GsdStandupResult {
  generatedAt: string;
  activeGoals: Array<{
    goalId: string;
    title: string;
    owner: string;
    status: string;
    updatedAt: string;
  }>;
  blockers: Array<{
    id: string;
    goalId?: string;
    summary: string;
    source: string;
    timestamp: string;
  }>;
  recentProof: Array<{
    id: string;
    goalId?: string;
    status?: string;
    lane?: string;
    summary: string;
    timestamp: string;
  }>;
  pendingApprovals: Array<{
    id: string;
    goalId?: string;
    reason?: string;
    createdAt: string;
  }>;
  nextActions: Array<{
    goalId: string;
    nextAction: string;
    createdAt: string;
  }>;
}

type Row = Record<string, unknown>;

function nowIso(input?: () => Date): string {
  return (input ?? (() => new Date()))().toISOString();
}

function stableId(prefix: string, value: string, timestamp: string): string {
  const hash = crypto.createHash("sha256").update(`${value}:${timestamp}`).digest("hex").slice(0, 16);
  return `${prefix}_${hash}`;
}

export function asGsdLane(value: unknown): AgentContextLane | undefined {
  return typeof value === "string" && (GSD_LANES as string[]).includes(value) ? (value as AgentContextLane) : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim() !== "") : [];
}

function parseRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function truthyProof(value: unknown): boolean {
  if (value === false || value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function proofExists(ledger: AgentRunLedger, proof: Record<string, unknown>, requirement: string): boolean {
  if (truthyProof(proof[requirement])) return true;
  if (Array.isArray(proof.receipts) && proof.receipts.includes(requirement)) return true;
  return ledger.verifications.some(
    (verification) =>
      verification.requiredProof === requirement &&
      !["missing", "pending", "required", "failed", "blocked"].includes(verification.proofStatus.toLowerCase())
  );
}

function writeHiveAction(
  db: Database.Database,
  input: {
    actorAgentId: string;
    actionType: "continue" | "loop" | "checkpoint" | "trigger" | "stop" | "error";
    summary: string;
    artifacts: Record<string, unknown>;
  }
): number {
  const result = db
    .prepare(
      `INSERT INTO hive_actions(agent_id, action_type, summary, artifacts)
       VALUES (@agentId, @actionType, @summary, @artifacts)`
    )
    .run({
      agentId: input.actorAgentId,
      actionType: input.actionType,
      summary: input.summary,
      artifacts: JSON.stringify(input.artifacts),
    });
  return Number(result.lastInsertRowid);
}

export function createOrResumeGsdGoal(db: Database.Database, input: GsdGoalInput): GsdGoalResult {
  if (!input.title?.trim()) throw new Error("goal title is required");
  if (!input.actorAgentId?.trim()) throw new Error("actorAgentId is required");

  const generatedAt = nowIso(input.now);
  const lane = input.lane ?? "ops";
  const goalId = input.goalId?.trim() || stableId("gsd", input.title, generatedAt);
  const ownerAgentId = input.ownerAgentId?.trim() || input.actorAgentId;
  const requiredVerification = unique([...(input.requiredVerification ?? []), ...LANE_REQUIRED_PROOF[lane]]);
  const acceptanceCriteria = input.acceptanceCriteria ?? requiredVerification;
  const checkpoint = {
    completedSteps: ["goal_created"],
    remainingSteps: ["shipcheck", "resume", "standup"],
    decisions: {
      lane,
      acceptanceCriteria,
      requiredVerification,
      scope: input.scope ?? {},
      forbiddenActions: input.forbiddenActions ?? [],
      approvalRequired: input.approvalRequired ?? [],
    },
    verificationState: Object.fromEntries(requiredVerification.map((proof) => [proof, "required"])),
    resumeFrom: "shipcheck",
    lastStepAt: generatedAt,
  };

  let hiveActionId = 0;
  let checkpointId = "";
  db.transaction(() => {
    db.prepare(
      `INSERT INTO hive_delegations(task_id, from_agent, to_agent, task_summary, priority, status, checkpoint, context_id)
       VALUES (@goalId, @actorAgentId, @ownerAgentId, @title, @priority, 'active', @checkpoint, @contextId)
       ON CONFLICT(task_id) DO UPDATE SET
         task_summary = excluded.task_summary,
         to_agent = excluded.to_agent,
         status = 'active',
         checkpoint = excluded.checkpoint,
         context_id = COALESCE(excluded.context_id, context_id),
         updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')`
    ).run({
      goalId,
      actorAgentId: input.actorAgentId,
      ownerAgentId,
      title: input.title.trim(),
      priority: 5,
      checkpoint: JSON.stringify(checkpoint),
      contextId: goalId,
    });

    hiveActionId = writeHiveAction(db, {
      actorAgentId: input.actorAgentId,
      actionType: "trigger",
      summary: `GSD goal set: ${input.title.trim()}`,
      artifacts: {
        command: "goal",
        goalId,
        goal_id: goalId,
        lane,
        acceptanceCriteria,
        requiredVerification,
        scope: input.scope ?? {},
      },
    });

    const created = createAgentCheckpoint(db, {
      runId: goalId,
      ownerAgentId,
      objective: input.title.trim(),
      completedSteps: ["goal_created"],
      remainingSteps: ["shipcheck", "resume", "standup"],
      decisions: checkpoint.decisions,
      verificationState: checkpoint.verificationState,
      nextSafeAction: "Run /shipcheck before marking the goal complete.",
      provenancePointers: [`hive_actions:${hiveActionId}`],
    });
    checkpointId = created.id;

  })();

  const result = buildAgentContextPacket(db, {
    goalId,
    actorAgentId: input.actorAgentId,
    lane,
    goalTitle: input.title.trim(),
    acceptanceCriteria,
    scope: input.scope,
    constraints: {
      requiredVerification,
      forbiddenActions: input.forbiddenActions,
      approvalRequired: input.approvalRequired,
    },
    now: input.now,
  });

  return { goalId, packet: result.packet, ledger: result.ledger, checkpointId, hiveActionId };
}

export function runGsdShipcheck(db: Database.Database, input: GsdShipcheckInput): GsdShipcheckResult {
  if (!input.goalId?.trim()) throw new Error("goalId is required");
  if (!input.actorAgentId?.trim()) throw new Error("actorAgentId is required");

  const lane = input.lane ?? "ops";
  const { packet, ledger } = buildAgentContextPacket(db, {
    goalId: input.goalId,
    actorAgentId: input.actorAgentId,
    lane,
    now: input.now,
  });
  const requiredProof = unique([...LANE_REQUIRED_PROOF[lane], ...packet.constraints.requiredVerification]);
  const proof = input.proof ?? {};
  const missingProof = requiredProof.filter((requirement) => !proofExists(ledger, proof, requirement));
  const bypassReason = input.bypassReason?.trim();

  if (missingProof.length > 0 && !bypassReason) {
    return {
      goalId: input.goalId,
      lane,
      status: "blocked",
      requiredProof,
      missingProof,
      packetHash: packet.packetHash,
      message: "Required proof is missing; provide proof or an explicit bypass reason.",
    };
  }

  if (missingProof.length > 0 && (!bypassReason || bypassReason.length < 8)) {
    return {
      goalId: input.goalId,
      lane,
      status: "blocked",
      requiredProof,
      missingProof,
      packetHash: packet.packetHash,
      message: "Bypass reason must be at least 8 characters.",
    };
  }

  const status = missingProof.length > 0 ? "bypassed" : "verified";
  const receiptId = db.transaction(() => {
    const actionId = writeHiveAction(db, {
      actorAgentId: input.actorAgentId,
      actionType: "checkpoint",
      summary: status === "verified" ? `GSD shipcheck verified for ${input.goalId}` : `GSD shipcheck bypassed for ${input.goalId}`,
      artifacts: {
        command: "shipcheck",
        goalId: input.goalId,
        goal_id: input.goalId,
        lane,
        status,
        requiredProof,
        missingProof,
        proof,
        ...(bypassReason ? { bypassReason } : {}),
      },
    });

    createAgentCheckpoint(db, {
      runId: input.goalId,
      ownerAgentId: input.actorAgentId,
      objective: `Shipcheck ${status} for ${input.goalId}`,
      completedSteps: status === "verified" ? ["shipcheck_verified"] : ["shipcheck_bypassed"],
      remainingSteps: status === "verified" ? [] : ["resolve_missing_proof"],
      decisions: { lane, status, missingProof },
      verificationState: Object.fromEntries(requiredProof.map((proofName) => [proofName, status])),
      nextSafeAction: status === "verified" ? "Goal can be marked complete." : "Review bypass reason and missing proof.",
      provenancePointers: [`hive_actions:${actionId}`],
    });

    return actionId;
  })();

  return {
    goalId: input.goalId,
    lane,
    status,
    requiredProof,
    missingProof,
    packetHash: packet.packetHash,
    receiptId,
    ...(bypassReason ? { bypassReason } : {}),
  };
}

export function buildGsdResume(db: Database.Database, input: { goalId: string; actorAgentId: string; lane?: AgentContextLane; now?: () => Date }): GsdResumeResult {
  const { packet, ledger } = buildAgentContextPacket(db, input);
  const latestVerification = ledger.verifications[0];
  return {
    goalId: input.goalId,
    packet,
    ledger,
    resume: {
      status: packet.goal.status,
      nextAction: ledger.handoffs[0]?.nextAction ?? latestVerification?.requiredProof ?? null,
      latestEvents: packet.recentRunState.latestEvents,
      pendingApprovals: packet.recentRunState.pendingApprovals,
      latestProofReceipts: packet.recentRunState.latestProofReceipts,
      ...(packet.recentRunState.handoff ? { handoff: packet.recentRunState.handoff } : {}),
    },
  };
}

export function buildGsdStandup(
  db: Database.Database,
  input: { goalId?: string; actorAgentId: string; lane?: AgentContextLane; limit?: number; now?: () => Date }
): GsdStandupResult {
  const generatedAt = nowIso(input.now);
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
  const goalWhere = input.goalId ? "WHERE task_id = @goalId OR context_id = @goalId" : "WHERE status IN ('pending','active','paused')";
  const activeRows = db
    .prepare(
      `SELECT task_id, task_summary, to_agent, status, updated_at
       FROM hive_delegations
       ${goalWhere}
       ORDER BY updated_at DESC
       LIMIT @limit`
    )
    .all({ goalId: input.goalId, limit }) as Row[];
  const actionRows = db
    .prepare(
      `SELECT id, action_type, summary, artifacts, timestamp
       FROM hive_actions
       ORDER BY timestamp DESC, id DESC
       LIMIT @limit`
    )
    .all({ limit }) as Row[];
  const auditRows = db
    .prepare(
      `SELECT id, entity_id, reason, created_at
       FROM audit_entries
       ORDER BY created_at DESC
       LIMIT @limit`
    )
    .all({ limit }) as Row[];
  const checkpointRows = db
    .prepare(
      `SELECT run_id, next_safe_action, created_at
       FROM agent_checkpoints
       ORDER BY created_at DESC
       LIMIT @limit`
    )
    .all({ limit }) as Row[];

  const scopedActions = actionRows.filter((row) => {
    if (!input.goalId) return true;
    const artifacts = parseRecord(row.artifacts);
    return artifacts.goalId === input.goalId || artifacts.goal_id === input.goalId;
  });

  return {
    generatedAt,
    activeGoals: activeRows.map((row) => ({
      goalId: String(row.task_id),
      title: String(row.task_summary ?? row.task_id),
      owner: String(row.to_agent ?? "unknown"),
      status: String(row.status ?? "pending"),
      updatedAt: String(row.updated_at ?? generatedAt),
    })),
    blockers: scopedActions
      .filter((row) => row.action_type === "error" || /\b(blocked|blocker|missing)\b/i.test(String(row.summary ?? "")))
      .map((row) => {
        const artifacts = parseRecord(row.artifacts);
        return {
          id: `hive_actions:${String(row.id)}`,
          goalId: typeof artifacts.goalId === "string" ? artifacts.goalId : undefined,
          summary: String(row.summary ?? ""),
          source: "hive_actions",
          timestamp: String(row.timestamp ?? generatedAt),
        };
      }),
    recentProof: scopedActions
      .filter((row) => parseRecord(row.artifacts).command === "shipcheck")
      .map((row) => {
        const artifacts = parseRecord(row.artifacts);
        return {
          id: `hive_actions:${String(row.id)}`,
          goalId: typeof artifacts.goalId === "string" ? artifacts.goalId : undefined,
          status: typeof artifacts.status === "string" ? artifacts.status : undefined,
          lane: typeof artifacts.lane === "string" ? artifacts.lane : undefined,
          summary: String(row.summary ?? ""),
          timestamp: String(row.timestamp ?? generatedAt),
        };
      }),
    pendingApprovals: auditRows
      .filter((row) => String(row.reason ?? "").toLowerCase().includes("approval"))
      .map((row) => ({
        id: String(row.id),
        goalId: String(row.entity_id ?? "").replace(/^gsd_goal:/, "") || undefined,
        reason: typeof row.reason === "string" ? row.reason : undefined,
        createdAt: String(row.created_at ?? generatedAt),
      })),
    nextActions: checkpointRows.map((row) => ({
      goalId: String(row.run_id),
      nextAction: String(row.next_safe_action ?? ""),
      createdAt: String(row.created_at ?? generatedAt),
    })),
  };
}

export function gsdInputFromJson(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function gsdStringArray(value: unknown): string[] {
  return stringArray(value);
}

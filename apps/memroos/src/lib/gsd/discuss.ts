import crypto from "crypto";
import type Database from "better-sqlite3";

import { buildAgentContextPacket } from "@/lib/agent-context-packet";
import type { AgentContextLane } from "@/lib/agent-context-packet";
import { createAgentCheckpoint } from "@/lib/agent-checkpoints";

export type DiscussRole = "chair" | "researcher" | "implementer" | "reviewer" | "validator";

export interface DiscussRoleAssignment {
  role: DiscussRole;
  agentId: string;
  mandate: string;
}

export interface DiscussVerdict {
  decision: "approve" | "revise" | "reject" | "needs_more_info";
  summary: string;
  actionItems: string[];
  risks: string[];
  validatorPass: boolean;
  validatorNotes?: string;
}

export interface DiscussCouncilInput {
  goalId: string;
  actorAgentId: string;
  topic: string;
  lane?: AgentContextLane;
  roles: DiscussRoleAssignment[];
  taskBudget: {
    maxRounds: number;
    maxAgents: number;
    maxTokens?: number;
  };
  contributions?: Array<{
    role: DiscussRole;
    agentId: string;
    summary: string;
    evidencePointers?: string[];
  }>;
  verdict: DiscussVerdict;
  now?: () => Date;
}

export interface DiscussCouncilResult {
  councilId: string;
  goalId: string;
  topic: string;
  packetHash: string;
  roles: DiscussRoleAssignment[];
  taskBudget: DiscussCouncilInput["taskBudget"];
  contributions: NonNullable<DiscussCouncilInput["contributions"]>;
  verdict: DiscussVerdict;
  ledgerReceiptId: number;
  checkpointId: string;
  blockedReasons: string[];
}

const ALLOWED_ROLES: DiscussRole[] = ["chair", "researcher", "implementer", "reviewer", "validator"];

function nowIso(input?: () => Date): string {
  return (input ?? (() => new Date()))().toISOString();
}

function stableCouncilId(goalId: string, topic: string, timestamp: string): string {
  return `discuss_${crypto.createHash("sha256").update(`${goalId}:${topic}:${timestamp}`).digest("hex").slice(0, 12)}`;
}

function writeHiveAction(
  db: Database.Database,
  input: {
    actorAgentId: string;
    summary: string;
    artifacts: Record<string, unknown>;
  }
): number {
  const result = db
    .prepare(
      `INSERT INTO hive_actions(agent_id, action_type, summary, artifacts)
       VALUES (@agentId, 'checkpoint', @summary, @artifacts)`
    )
    .run({
      agentId: input.actorAgentId,
      summary: input.summary,
      artifacts: JSON.stringify(input.artifacts),
    });
  return Number(result.lastInsertRowid);
}

export function runBoundedDiscussCouncil(db: Database.Database, input: DiscussCouncilInput): DiscussCouncilResult {
  if (!input.goalId?.trim()) throw new Error("goalId is required");
  if (!input.actorAgentId?.trim()) throw new Error("actorAgentId is required");
  if (!input.topic?.trim()) throw new Error("topic is required");
  if (!Array.isArray(input.roles) || input.roles.length === 0) throw new Error("roles are required");

  const generatedAt = nowIso(input.now);
  const blockedReasons: string[] = [];

  if (input.taskBudget.maxRounds < 1 || input.taskBudget.maxRounds > 5) {
    blockedReasons.push("taskBudget.maxRounds must be between 1 and 5 for bounded council.");
  }
  if (input.taskBudget.maxAgents < 2 || input.taskBudget.maxAgents > 6) {
    blockedReasons.push("taskBudget.maxAgents must be between 2 and 6 for bounded council.");
  }
  if (input.roles.length > input.taskBudget.maxAgents) {
    blockedReasons.push("roles exceed taskBudget.maxAgents.");
  }

  const invalidRoles = input.roles.filter((role) => !ALLOWED_ROLES.includes(role.role));
  if (invalidRoles.length > 0) {
    blockedReasons.push(`invalid roles: ${invalidRoles.map((role) => role.role).join(", ")}`);
  }

  if (!input.roles.some((role) => role.role === "validator")) {
    blockedReasons.push("validator role is required.");
  }

  if (!input.verdict?.summary?.trim()) {
    blockedReasons.push("verdict.summary is required.");
  }

  if (!input.verdict.validatorPass) {
    blockedReasons.push("validator pass is required before ledgering council output.");
  }

  if (blockedReasons.length > 0) {
    return {
      councilId: stableCouncilId(input.goalId, input.topic, generatedAt),
      goalId: input.goalId,
      topic: input.topic,
      packetHash: "",
      roles: input.roles,
      taskBudget: input.taskBudget,
      contributions: input.contributions ?? [],
      verdict: input.verdict,
      ledgerReceiptId: 0,
      checkpointId: "",
      blockedReasons,
    };
  }

  const { packet } = buildAgentContextPacket(db, {
    goalId: input.goalId,
    actorAgentId: input.actorAgentId,
    lane: input.lane ?? "research",
    goalTitle: input.topic,
    now: input.now,
  });

  const councilId = stableCouncilId(input.goalId, input.topic, generatedAt);
  const contributions = input.contributions ?? [];

  let ledgerReceiptId = 0;
  let checkpointId = "";
  db.transaction(() => {
    ledgerReceiptId = writeHiveAction(db, {
      actorAgentId: input.actorAgentId,
      summary: `GSD discuss council ${input.verdict.decision}: ${input.topic}`,
      artifacts: {
        command: "discuss",
        councilId,
        goalId: input.goalId,
        topic: input.topic,
        roles: input.roles,
        taskBudget: input.taskBudget,
        contributions,
        verdict: input.verdict,
        packetHash: packet.packetHash,
      },
    });

    const checkpoint = createAgentCheckpoint(db, {
      runId: input.goalId,
      ownerAgentId: input.actorAgentId,
      objective: input.topic,
      completedSteps: ["discuss_council"],
      remainingSteps: input.verdict.actionItems,
      decisions: {
        councilId,
        verdict: input.verdict.decision,
        summary: input.verdict.summary,
        risks: input.verdict.risks,
      },
      verificationState: { validator_pass: input.verdict.validatorPass ? "verified" : "required" },
      nextSafeAction: input.verdict.actionItems[0] ?? "Resume from council verdict.",
      provenancePointers: [`hive_actions:${ledgerReceiptId}`],
    });
    checkpointId = checkpoint.id;
  })();

  return {
    councilId,
    goalId: input.goalId,
    topic: input.topic,
    packetHash: packet.packetHash,
    roles: input.roles,
    taskBudget: input.taskBudget,
    contributions,
    verdict: input.verdict,
    ledgerReceiptId,
    checkpointId,
    blockedReasons,
  };
}

import type Database from "better-sqlite3";

import { createOrResumeGsdGoal, runGsdShipcheck, buildGsdResume, buildGsdStandup } from "@/lib/agent-gsd-control";
import { buildAgentContextPacket } from "@/lib/agent-context-packet";
import { runBoundedDiscussCouncil } from "@/lib/gsd/discuss";
import { auditRegisteredSkills } from "@/lib/gsd/skill-boundary";
import { runGsdLaneEvalSuite } from "@/lib/gsd/lane-evals";
import { routeGsdModel } from "@/lib/gsd/model-routing-policy";

export type GsdAdapterId = "hermes" | "discord" | "telegram" | "codex" | "claude_code" | "cursor";

export const GSD_ADAPTER_CONTRACT = {
  ownsState: false as const,
  allowedActions: [
    "create_task",
    "request_context",
    "post_proof",
    "standup",
    "resume",
    "request_approval",
    "discuss",
    "skill_audit",
    "lane_eval",
    "model_route",
  ] as const,
  forbiddenOwnership: ["memory", "task_state", "proof_state", "policy_state", "model_routing_decisions"] as const,
};

export type GsdAdapterAction = (typeof GSD_ADAPTER_CONTRACT.allowedActions)[number];

export interface GsdAdapterRequest {
  adapterId: GsdAdapterId;
  actorAgentId: string;
  action: GsdAdapterAction;
  payload: Record<string, unknown>;
  now?: () => Date;
}

export interface GsdAdapterResult {
  adapterId: GsdAdapterId;
  action: GsdAdapterAction;
  ok: boolean;
  ownsState: false;
  result: unknown;
  contract: typeof GSD_ADAPTER_CONTRACT;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function executeGsdAdapterAction(db: Database.Database, input: GsdAdapterRequest): GsdAdapterResult {
  const payload = input.payload ?? {};

  switch (input.action) {
    case "create_task": {
      const result = createOrResumeGsdGoal(db, {
        goalId: asString(payload.goalId) ?? asString(payload.goal_id),
        title: asString(payload.title) ?? asString(payload.goal) ?? "",
        actorAgentId: input.actorAgentId,
        ownerAgentId: asString(payload.ownerAgentId) ?? asString(payload.owner),
        lane: payload.lane as never,
        acceptanceCriteria: Array.isArray(payload.acceptanceCriteria) ? (payload.acceptanceCriteria as string[]) : undefined,
        now: input.now,
      });
      return { adapterId: input.adapterId, action: input.action, ok: true, ownsState: false, result, contract: GSD_ADAPTER_CONTRACT };
    }
    case "request_context": {
      const goalId = asString(payload.goalId) ?? asString(payload.goal_id) ?? "";
      const result = buildAgentContextPacket(db, {
        goalId,
        actorAgentId: input.actorAgentId,
        lane: payload.lane as never,
        now: input.now,
      });
      return { adapterId: input.adapterId, action: input.action, ok: true, ownsState: false, result, contract: GSD_ADAPTER_CONTRACT };
    }
    case "post_proof": {
      const result = runGsdShipcheck(db, {
        goalId: asString(payload.goalId) ?? asString(payload.goal_id) ?? "",
        actorAgentId: input.actorAgentId,
        lane: payload.lane as never,
        proof: payload.proof as Record<string, unknown> | undefined,
        bypassReason: asString(payload.bypassReason),
        now: input.now,
      });
      return { adapterId: input.adapterId, action: input.action, ok: result.status !== "blocked", ownsState: false, result, contract: GSD_ADAPTER_CONTRACT };
    }
    case "resume": {
      const result = buildGsdResume(db, {
        goalId: asString(payload.goalId) ?? asString(payload.goal_id) ?? "",
        actorAgentId: input.actorAgentId,
        lane: payload.lane as never,
        now: input.now,
      });
      return { adapterId: input.adapterId, action: input.action, ok: true, ownsState: false, result, contract: GSD_ADAPTER_CONTRACT };
    }
    case "standup": {
      const result = buildGsdStandup(db, {
        goalId: asString(payload.goalId) ?? asString(payload.goal_id),
        actorAgentId: input.actorAgentId,
        lane: payload.lane as never,
        now: input.now,
      });
      return { adapterId: input.adapterId, action: input.action, ok: true, ownsState: false, result, contract: GSD_ADAPTER_CONTRACT };
    }
    case "request_approval": {
      const result = runBoundedDiscussCouncil(db, {
        goalId: asString(payload.goalId) ?? asString(payload.goal_id) ?? "",
        actorAgentId: input.actorAgentId,
        topic: asString(payload.topic) ?? "approval request",
        lane: payload.lane as never,
        roles: (payload.roles as never) ?? [
          { role: "chair", agentId: input.actorAgentId, mandate: "coordinate" },
          { role: "validator", agentId: input.actorAgentId, mandate: "validate" },
        ],
        taskBudget: (payload.taskBudget as never) ?? { maxRounds: 2, maxAgents: 4 },
        contributions: payload.contributions as never,
        verdict: (payload.verdict as never) ?? {
          decision: "needs_more_info",
          summary: "Approval requested via adapter.",
          actionItems: [],
          risks: [],
          validatorPass: false,
        },
        now: input.now,
      });
      return { adapterId: input.adapterId, action: input.action, ok: result.blockedReasons.length === 0, ownsState: false, result, contract: GSD_ADAPTER_CONTRACT };
    }
    case "discuss": {
      const result = runBoundedDiscussCouncil(db, {
        goalId: asString(payload.goalId) ?? asString(payload.goal_id) ?? "",
        actorAgentId: input.actorAgentId,
        topic: asString(payload.topic) ?? "",
        lane: payload.lane as never,
        roles: payload.roles as never,
        taskBudget: payload.taskBudget as never,
        contributions: payload.contributions as never,
        verdict: payload.verdict as never,
        now: input.now,
      });
      return { adapterId: input.adapterId, action: input.action, ok: result.blockedReasons.length === 0, ownsState: false, result, contract: GSD_ADAPTER_CONTRACT };
    }
    case "skill_audit": {
      const result = auditRegisteredSkills(db, { persistProposals: payload.persistProposals !== false, now: input.now });
      return { adapterId: input.adapterId, action: input.action, ok: true, ownsState: false, result, contract: GSD_ADAPTER_CONTRACT };
    }
    case "lane_eval": {
      const result = runGsdLaneEvalSuite(db, {
        caseIds: Array.isArray(payload.caseIds) ? (payload.caseIds as string[]) : undefined,
        persistReceipts: payload.persistReceipts !== false,
        now: input.now,
      });
      return { adapterId: input.adapterId, action: input.action, ok: result.failedCases === 0, ownsState: false, result, contract: GSD_ADAPTER_CONTRACT };
    }
    case "model_route": {
      const result = routeGsdModel(db, {
        taskClass: asString(payload.taskClass) ?? asString(payload.task_class) ?? "hard_reasoning",
        agentId: input.actorAgentId,
        taskId: asString(payload.taskId) ?? asString(payload.task_id),
        overrideTier: payload.overrideTier as never,
        overrideReason: asString(payload.overrideReason),
        sensitive: payload.sensitive === true,
        multimodal: payload.multimodal === true,
        highRisk: payload.highRisk === true,
      });
      return { adapterId: input.adapterId, action: input.action, ok: true, ownsState: false, result, contract: GSD_ADAPTER_CONTRACT };
    }
    default:
      throw new Error(`Unsupported adapter action: ${input.action}`);
  }
}

export function validateGsdAdapterContract(result: GsdAdapterResult): string[] {
  const violations: string[] = [];
  if (result.ownsState !== false) violations.push("adapter attempted to own state");
  if (!GSD_ADAPTER_CONTRACT.allowedActions.includes(result.action)) violations.push("adapter action outside contract");
  return violations;
}

import type { NextRequest } from "next/server";

import { authenticateAgentHeaders } from "@/lib/agent-registry";
import { runGsdAdapterSafetyCheck } from "@/lib/gsd/adapter-safety";
import {
  executeGsdAdapterAction,
  type GsdAdapterAction,
  type GsdAdapterId,
} from "@/lib/gsd/adapters";
import {
  isGsdAdapterPolicyAllowed,
  runGsdAdapterPolicyGate,
} from "@/lib/gsd/adapter-policy-gate";
import { gsdInputFromJson } from "@/lib/agent-gsd-control";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

const ADAPTER_IDS: GsdAdapterId[] = ["hermes", "discord", "telegram", "codex", "claude_code", "cursor"];
const ACTIONS: GsdAdapterAction[] = [
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
];

function asAdapterId(value: unknown): GsdAdapterId | undefined {
  return typeof value === "string" && (ADAPTER_IDS as string[]).includes(value) ? (value as GsdAdapterId) : undefined;
}

function asAction(value: unknown): GsdAdapterAction | undefined {
  return typeof value === "string" && (ACTIONS as string[]).includes(value) ? (value as GsdAdapterAction) : undefined;
}

export async function POST(req: NextRequest) {
  const body = gsdInputFromJson(await req.json().catch(() => ({})));
  const agentHint = typeof body.agent === "string" ? body.agent : typeof body.agentId === "string" ? body.agentId : undefined;
  const agent = authenticateAgentHeaders(req.headers, agentHint);
  if (!agent) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const adapterId = asAdapterId(body.adapterId) ?? asAdapterId(body.adapter_id);
  const action = asAction(body.action);
  if (!adapterId || !action) {
    return Response.json({ ok: false, error: "adapterId and action are required" }, { status: 400 });
  }

  const payload = gsdInputFromJson(body.payload);
  const safetyContent = typeof body.content === "string" ? body.content : typeof payload.content === "string" ? payload.content : "";
  const safety = runGsdAdapterSafetyCheck(getDb(), {
    action:
      body.destructive === true || payload.destructive === true
        ? "destructive"
        : action === "post_proof"
          ? "write"
          : "send",
    content: safetyContent,
    actorAgentId: agent.id,
    goalId: typeof payload.goalId === "string" ? payload.goalId : typeof payload.goal_id === "string" ? payload.goal_id : undefined,
    estimatedCostUsd: typeof body.estimatedCostUsd === "number" ? body.estimatedCostUsd : undefined,
    costCapUsd: typeof body.costCapUsd === "number" ? body.costCapUsd : undefined,
    sharedMode: body.sharedMode === true,
    requestedLocalGitFallback: body.requestedLocalGitFallback === true,
    destructive: body.destructive === true || payload.destructive === true,
    approvalGranted: body.approvalGranted === true || payload.approvalGranted === true,
  });

  if (!safety.allowed) {
    return Response.json(
      {
        ok: false,
        adapterId,
        action,
        safety,
        honestDegradation: safety.honestDegradation,
        timestamp: new Date().toISOString(),
      },
      { status: 403 }
    );
  }

  const policyEvaluation = runGsdAdapterPolicyGate(getDb(), {
    adapterId,
    action,
    actorAgentId: agent.id,
  });

  if (!isGsdAdapterPolicyAllowed(policyEvaluation)) {
    const receipt = policyEvaluation.receipt;
    return Response.json(
      {
        ok: false,
        adapterId,
        action,
        policyReceipt: {
          policyVersion: receipt.policyVersion,
          domain: receipt.domain,
          action: receipt.action,
          ruleMatched: receipt.ruleMatched,
          outcome: receipt.outcome,
          reason: receipt.reason,
          actorId: receipt.actorId,
          createdAt: receipt.createdAt,
        },
        timestamp: new Date().toISOString(),
      },
      { status: 403 }
    );
  }

  try {
    const result = executeGsdAdapterAction(getDb(), {
      adapterId,
      actorAgentId: agent.id,
      action,
      payload,
    });
    return Response.json({ actorAgentId: agent.id, safety, ...result, timestamp: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function GET(req: NextRequest) {
  const agent = authenticateAgentHeaders(req.headers);
  if (!agent) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  return Response.json({
    ok: true,
    actorAgentId: agent.id,
    contract: {
      adapters: ADAPTER_IDS,
      actions: ACTIONS,
      ownsState: false,
      forbiddenOwnership: ["memory", "task_state", "proof_state", "policy_state", "model_routing_decisions"],
    },
    timestamp: new Date().toISOString(),
  });
}

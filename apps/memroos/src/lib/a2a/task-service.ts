import crypto from "crypto";
import { getDb } from "@/lib/db";
import { scanIrisPreflight } from "@/lib/iris-scanner";
import { checkA2aSendPolicy } from "@/lib/security-policy";
import { writeAuditLogFromEntry as writeAuditLog } from "@/lib/store/audit";
import type { RegisteredAgent } from "@/types";
import { A2aError } from "./errors";
import type { A2aMessage, A2aTask } from "./types";
import {
  appendA2aTaskEvent,
  createA2aTask,
  getA2aTask,
  listA2aTasksForAgent,
  transitionA2aTask,
  type A2aStoredTaskEvent,
} from "./task-store";

const TERMINAL_STATES = new Set(["completed", "failed", "canceled"]);

interface SendA2aMessageInput {
  message?: A2aMessage;
  targetAgentId?: string | null;
  contextId?: string;
  taskId?: string;
  callerAgentId?: string;
  metadata?: Record<string, unknown>;
}

function requireAgent(agent: RegisteredAgent | null | undefined): RegisteredAgent {
  if (!agent) {
    throw new A2aError("UNAUTHENTICATED", "A2A bearer authentication required");
  }
  return agent;
}

function messageText(message: A2aMessage): string {
  return message.parts
    .map((part) => {
      if (part.kind === "text") return part.text ?? "";
      if (part.kind === "data") return JSON.stringify(part.data ?? {});
      return part.file?.name ?? part.file?.uri ?? "";
    })
    .join("\n");
}

function sanitizeMetadata(metadata: Record<string, unknown> | undefined): Record<string, unknown> {
  const copy = { ...(metadata ?? {}) };
  delete copy.callerAgentId;
  return copy;
}

function auditBlockedContent(agentId: string, matches: unknown[]): void {
  writeAuditLog(getDb(), {
    actor: agentId,
    action: "content_blocked",
    target: "a2a_task",
    detail: JSON.stringify(matches),
    severity: "high",
  });
}

function auditPolicyDenied(agentId: string, detail: Record<string, unknown>): void {
  writeAuditLog(getDb(), {
    actor: agentId,
    action: "policy_denied",
    target: "a2a_task",
    detail: JSON.stringify(detail),
    severity: "high",
  });
}

function assertTaskVisible(agent: RegisteredAgent, taskId: string) {
  const record = getA2aTask(taskId);
  if (!record || (record.callerAgentId !== agent.id && record.targetAgentId !== agent.id)) {
    throw new A2aError("NOT_FOUND", "A2A task not found");
  }
  return record;
}

export async function sendA2aMessage(
  authenticatedAgent: RegisteredAgent | null | undefined,
  input: SendA2aMessageInput
): Promise<A2aTask> {
  const agent = requireAgent(authenticatedAgent);
  if (!input.message) {
    throw new A2aError("INVALID_REQUEST", "message is required");
  }

  const scan = scanIrisPreflight(messageText(input.message));
  if (scan.blocked) {
    auditBlockedContent(agent.id, scan.matches);
    throw new A2aError("UNAUTHORIZED", "Content blocked by security scanner");
  }

  const policy = checkA2aSendPolicy(agent);
  if (!policy.allowed) {
    auditPolicyDenied(agent.id, { code: policy.code, ...(policy.detail ?? {}) });
    throw new A2aError("UNAUTHORIZED", policy.message ?? "Action denied by security policy");
  }

  const task = createA2aTask({
    taskId: input.taskId ?? crypto.randomUUID(),
    contextId: input.contextId ?? crypto.randomUUID(),
    callerAgentId: agent.id,
    targetAgentId: input.targetAgentId ?? null,
    message: input.message,
    metadata: sanitizeMetadata(input.metadata),
  });

  appendA2aTaskEvent(task.id, "task.created", { task });
  return task;
}

export async function streamA2aMessage(
  authenticatedAgent: RegisteredAgent | null | undefined,
  input: SendA2aMessageInput
): Promise<{ task: A2aTask; events: A2aStoredTaskEvent[] }> {
  const task = await sendA2aMessage(authenticatedAgent, input);
  const record = getA2aTask(task.id);
  return { task, events: record?.events ?? [] };
}

export async function getA2aTaskForAgent(
  authenticatedAgent: RegisteredAgent | null | undefined,
  taskId: string
): Promise<A2aTask> {
  const agent = requireAgent(authenticatedAgent);
  return assertTaskVisible(agent, taskId).task;
}

export async function listA2aTasks(authenticatedAgent: RegisteredAgent | null | undefined): Promise<A2aTask[]> {
  const agent = requireAgent(authenticatedAgent);
  return listA2aTasksForAgent(agent.id);
}

export async function cancelA2aTask(
  authenticatedAgent: RegisteredAgent | null | undefined,
  taskId: string
): Promise<A2aTask> {
  const agent = requireAgent(authenticatedAgent);
  const record = assertTaskVisible(agent, taskId);
  if (TERMINAL_STATES.has(record.task.status.state)) {
    throw new A2aError("INVALID_REQUEST", "Terminal A2A tasks cannot be canceled");
  }

  const canceled = transitionA2aTask(taskId, "canceled", { cancelRequestedAt: new Date().toISOString() });
  appendA2aTaskEvent(taskId, "task.canceled", { task: canceled });
  return canceled;
}

export async function subscribeA2aTask(
  authenticatedAgent: RegisteredAgent | null | undefined,
  taskId: string
): Promise<{ task: A2aTask; events: A2aStoredTaskEvent[] }> {
  const agent = requireAgent(authenticatedAgent);
  const record = assertTaskVisible(agent, taskId);
  return { task: record.task, events: record.events };
}

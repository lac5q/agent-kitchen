import { getRemoteAgents } from "@/lib/agent/registry";
import { sendMessageToA2aAgent } from "@/lib/a2a/client";
import { A2A_TASK_STATES, type A2aTask } from "@/lib/a2a/types";
import { appendA2aTaskEvent, getA2aTask, transitionA2aTask } from "@/lib/a2a/task-store";
import type { RemoteAgentConfig } from "@/types";
import type { AgentAdapter, DispatchResult, DispatchTask } from "./types";

const TASK_STATES = new Set<string>(A2A_TASK_STATES);

function resolveAgent(task: DispatchTask, agent?: RemoteAgentConfig): RemoteAgentConfig | null {
  return agent ?? getRemoteAgents().find((candidate) => candidate.id === task.to_agent) ?? null;
}

function remoteTaskFrom(result: DispatchResult): A2aTask | null {
  const remoteTask = result.evidence?.remoteTask;
  if (!remoteTask || typeof remoteTask !== "object" || Array.isArray(remoteTask)) return null;
  return remoteTask as A2aTask;
}

function mirrorRemoteTaskState(task: DispatchTask, remoteTask: A2aTask | null): void {
  const state = remoteTask?.status?.state;
  if (!state || !TASK_STATES.has(state)) return;

  const existing = getA2aTask(task.task_id);
  if (!existing) return;

  const updated = transitionA2aTask(task.task_id, state, {
    artifacts: remoteTask.artifacts,
    metadata: {
      ...(existing.task.metadata ?? {}),
      remoteA2a: {
        taskId: remoteTask.id ?? task.task_id,
        state,
        updatedAt: new Date().toISOString(),
      },
    },
  });
  appendA2aTaskEvent(task.task_id, "task.remote_update", { task: updated });
}

export const a2aAdapter: AgentAdapter = {
  name: "a2a",
  platform: ["gemini", "openclaw"],
  async dispatch(task: DispatchTask, agent?: RemoteAgentConfig): Promise<DispatchResult> {
    const remoteAgent = resolveAgent(task, agent);
    if (!remoteAgent) {
      return {
        accepted: false,
        mode: "rejected",
        detail: `Unknown A2A agent: ${task.to_agent}`,
      };
    }

    const result = await sendMessageToA2aAgent(remoteAgent, task);
    if (result.accepted) {
      mirrorRemoteTaskState(task, remoteTaskFrom(result));
    }
    return result;
  },
};

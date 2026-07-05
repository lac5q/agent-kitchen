import type { RemoteAgentConfig } from "@/types";
import type { AgentAdapter, DispatchTask, DispatchResult } from "./types";

function pollUrl(agentId: string): string {
  const baseUrl = process.env.HIVE_PUBLIC_URL ?? "/api/hive";
  const url = new URL(baseUrl, "http://localhost");
  url.searchParams.set("type", "delegation");
  url.searchParams.set("to_agent", agentId);
  url.searchParams.set("status", "pending");
  url.searchParams.set("limit", "1");
  return /^https?:\/\//.test(baseUrl) ? url.toString() : `${url.pathname}${url.search}`;
}

export const hivePollAdapter: AgentAdapter = {
  platform: ["claude", "codex", "qwen", "pi", "gemini"],
  name: "hive-poll",
  async dispatch(task: DispatchTask, agent?: RemoteAgentConfig): Promise<DispatchResult> {
    const url = pollUrl(task.to_agent);
    return {
      accepted: true,
      mode: "queued",
      detail: `Task ${task.task_id} queued in hive for ${agent?.name ?? task.to_agent}; no push transport is configured, so the agent must poll ${url}.`,
      evidence: {
        delivery: "poll_required",
        pollUrl: url,
      },
    };
  },
};

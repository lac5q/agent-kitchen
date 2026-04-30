import type { AgentAdapter, DispatchTask, DispatchResult } from "./types";

export const hivePollAdapter: AgentAdapter = {
  platform: ["claude", "codex", "qwen", "gemini"],
  name: "hive-poll",
  async dispatch(task: DispatchTask): Promise<DispatchResult> {
    return {
      accepted: true,
      mode: "queued",
      detail: `Task ${task.task_id} queued in hive for ${task.to_agent}; awaits poll.`,
    };
  },
};

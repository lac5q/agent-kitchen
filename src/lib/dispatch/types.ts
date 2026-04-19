import type { AgentPlatform } from "@/types";

export interface DispatchTask {
  task_id: string;
  context_id: string;
  from_agent: string;
  to_agent: string;
  task_summary: string;
  input?: Record<string, unknown>;
  priority: number;
  dispatched_at: string;
}

export interface DispatchResult {
  accepted: boolean;
  mode: "pushed" | "queued" | "rejected";
  detail: string;
  evidence?: Record<string, unknown>;
}

export interface AgentAdapter {
  readonly platform: AgentPlatform | AgentPlatform[];
  readonly name: string;
  dispatch(task: DispatchTask): Promise<DispatchResult>;
}

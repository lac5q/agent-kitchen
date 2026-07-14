import type { AgentPlatform, RemoteAgentConfig } from "@/types";

export interface DispatchTask {
  task_id: string;
  context_id: string;
  from_agent: string;
  to_agent: string;
  task_summary: string;
  input?: Record<string, unknown>;
  priority: number;
  dispatched_at: string;
  /** Optional governed skill name for registry-aware dispatch (SKILL-03). */
  skill_name?: string;
  /**
   * SKILLTRUST-01 (continued): explicit harness binding when the requested
   * skill name is non-empty. When omitted the dispatcher treats the request
   * as ambiguous (multiple harnesses may share the same name) and refuses
   * to silently pick one. The caller must supply source_harness to
   * deterministically bind the named skill to a single registry row.
   */
  source_harness?: string;
  /**
   * Optional version string for explicit version binding. When supplied the
   * dispatcher compares it to the registry row version column and denies
   * mismatches rather than silently picking a different version.
   */
  skill_version?: string;
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
  dispatch(task: DispatchTask, agent?: RemoteAgentConfig): Promise<DispatchResult>;
}

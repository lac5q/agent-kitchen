import type { RemoteAgentConfig } from "@/types";
import type { AgentAdapter } from "./types";
import { openclawAdapter } from "./openclaw-adapter";
import { hivePollAdapter } from "./hive-poll-adapter";

const ADAPTERS: AgentAdapter[] = [openclawAdapter, hivePollAdapter];

export function selectAdapter(agent: RemoteAgentConfig): AgentAdapter {
  const want = agent.platform;
  for (const a of ADAPTERS) {
    const p = a.platform;
    if (Array.isArray(p) ? p.includes(want) : p === want) return a;
  }
  return hivePollAdapter;
}

import { readFileSync } from "fs";
import type { RemoteAgentConfig } from "@/types";
import { findConfigFile } from "@/lib/paths";

function loadAgentRegistry(): RemoteAgentConfig[] {
  const configPath =
    process.env.AGENTS_CONFIG_PATH ||
    findConfigFile("agents.config.json");
  try {
    const raw = readFileSync(configPath, "utf-8");
    const config = JSON.parse(raw);
    return config.remoteAgents ?? [];
  } catch {
    return [];
  }
}

export function getRemoteAgents(): RemoteAgentConfig[] {
  return loadAgentRegistry();
}

export async function pollRemoteAgent(agent: RemoteAgentConfig): Promise<{
  id: string;
  reachable: boolean;
  latencyMs: number | null;
  data: Record<string, unknown> | null;
}> {
  const url =
    agent.location === "cloudflare" && agent.tunnelUrl
      ? `${agent.tunnelUrl}${agent.healthEndpoint}`
      : `http://${agent.host}:${agent.port}${agent.healthEndpoint}`;

  const start = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    const data = await res.json().catch(() => null);
    return { id: agent.id, reachable: res.ok, latencyMs: Date.now() - start, data };
  } catch {
    return { id: agent.id, reachable: false, latencyMs: null, data: null };
  }
}

export async function pollAllRemoteAgents() {
  const agents = getRemoteAgents();
  return Promise.all(agents.map(pollRemoteAgent));
}

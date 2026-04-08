import type { RemoteAgentConfig } from "@/types";

export const REMOTE_AGENTS: RemoteAgentConfig[] = [
  {
    id: "sophia",
    name: "Sophia",
    role: "Sous Chef (Marketing)",
    platform: "claude",
    location: "tailscale",
    host: "100.101.88.44",
    port: 18889,
    healthEndpoint: "/health",
  },
  {
    id: "maria",
    name: "Maria",
    role: "Pastry Chef (Content)",
    platform: "claude",
    location: "tailscale",
    host: "100.109.19.110",
    port: 8644,
    healthEndpoint: "/health",
  },
  {
    id: "lucia",
    name: "Lucia",
    role: "Kitchen Porter (Ops)",
    platform: "claude",
    location: "tailscale",
    host: "100.89.143.17",
    port: 18789,
    healthEndpoint: "/health",
  },
  {
    id: "alba",
    name: "Alba",
    role: "Head Chef (Coordinator)",
    platform: "claude",
    location: "cloudflare",
    host: "localhost",
    port: 18793,
    healthEndpoint: "/health",
    tunnelUrl: "https://alba.epiloguecapital.com",
  },
  {
    id: "gwen",
    name: "Gwen",
    role: "Pastry Chef (Social/Pinterest)",
    platform: "claude",
    location: "cloudflare",
    host: "localhost",
    port: 18792,
    healthEndpoint: "/health",
    tunnelUrl: "https://gwen.epiloguecapital.com",
  },
];

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
    return {
      id: agent.id,
      reachable: res.ok,
      latencyMs: Date.now() - start,
      data,
    };
  } catch {
    return { id: agent.id, reachable: false, latencyMs: null, data: null };
  }
}

export async function pollAllRemoteAgents() {
  return Promise.all(REMOTE_AGENTS.map(pollRemoteAgent));
}

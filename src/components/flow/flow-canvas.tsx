"use client";

import { useMemo } from "react";
import { FlowNodeComponent } from "./flow-node";
import { FlowEdgeComponent } from "./flow-edge";
import type { FlowNode, FlowEdge, HealthStatus } from "@/types";

// Node dimensions
const NODE_W = 70;
const NODE_H = 70;

interface RemoteAgentSummary {
  id: string;
  name: string;
  status: string;
  latencyMs: number | null;
  location: string;
}

interface FlowCanvasProps {
  services: HealthStatus[];
  agentCount: number;
  activeCount: number;
  memoryCount: number;
  knowledgeCount: number;
  skillCount: number;
  nodeActivity: Record<string, number>;
  highlightedNode?: string | null;
  // New: real named agents
  remoteAgents?: RemoteAgentSummary[];
  localActiveCount?: number;
  localTotalCount?: number;
}

// Key agents in display order
const KEY_AGENT_IDS = ["alba", "gwen", "sophia", "maria", "lucia"];

const AGENT_ICONS: Record<string, string> = {
  alba: "🤖",
  gwen: "🌸",
  sophia: "💼",
  maria: "✍️",
  lucia: "🔧",
};

function agentSubtitle(location: string): string {
  if (location === "tailscale") return "Tailscale";
  if (location === "cloudflare") return "CF";
  return "local";
}

function buildNodes(
  remoteAgents: RemoteAgentSummary[] = [],
  localTotal: number,
  localActive: number
): { nodes: (FlowNode & { agentStatus?: string })[]; agentNodeIds: string[] } {
  // Filter to key remote agents in defined order
  const keyRemote = KEY_AGENT_IDS
    .map((id) => remoteAgents.find((a) => a.id === id))
    .filter((a): a is RemoteAgentSummary => Boolean(a));

  const agentStartX = 200;
  const agentSpacing = 100;
  const agentY = 185;

  const agentNodes: (FlowNode & { agentStatus?: string })[] = keyRemote.map(
    (agent, i) => ({
      id: `agent-${agent.id}`,
      label: agent.name,
      subtitle: agentSubtitle(agent.location),
      icon: AGENT_ICONS[agent.id] ?? "🤖",
      x: agentStartX + i * agentSpacing,
      y: agentY,
      status: (agent.status === "active" ? "active" : "idle") as FlowNode["status"],
      stats: {
        Location: agentSubtitle(agent.location),
        ...(agent.latencyMs != null ? { Latency: `${agent.latencyMs}ms` } : {}),
      },
      agentStatus: agent.status,
    })
  );

  const localX = agentStartX + keyRemote.length * agentSpacing;
  const localNode: FlowNode & { agentStatus?: string } = {
    id: "local-agents",
    label: `${localActive} Active`,
    subtitle: `${localTotal} local chefs`,
    icon: "👨‍🍳",
    x: localX,
    y: agentY,
    status: (localActive > 0 ? "active" : "idle") as FlowNode["status"],
    stats: {
      Active: localActive,
      Total: localTotal,
    },
    agentStatus: localActive > 0 ? "active" : "idle",
  };

  const staticNodes: (FlowNode & { agentStatus?: string })[] = [
    {
      id: "request",
      label: "User / Telegram",
      subtitle: "input channel",
      icon: "📨",
      x: 20,
      y: 50,
      status: "active",
      stats: {},
    },
    {
      id: "gateways",
      label: "Gateways",
      subtitle: "Alba · Gwen · Sophia",
      icon: "🚪",
      x: 170,
      y: 50,
      status: "idle",
      stats: { Alba: "18793", Gwen: "18792", "Sophia/Maria": "Tailscale" },
    },
    {
      id: "manager",
      label: "Paperclip",
      subtitle: "task orchestrator",
      icon: "📞",
      x: 420,
      y: 50,
      status: "idle",
      stats: { Platform: "Paperclip", Port: "3100" },
    },
    {
      id: "output",
      label: "Response",
      subtitle: "Discord · Telegram",
      icon: "📤",
      x: 760,
      y: 50,
      status: "idle",
      stats: {},
    },
    {
      id: "tunnels",
      label: "CF Tunnels",
      subtitle: "your-tunnel.domain",
      icon: "📡",
      x: 170,
      y: 310,
      status: "idle",
      stats: {},
    },
    {
      id: "taskboard",
      label: "Task Board",
      subtitle: "Nerve Kanban",
      icon: "📋",
      x: 350,
      y: 310,
      status: "idle",
      stats: {},
    },
    {
      id: "notebooks",
      label: "mem0",
      subtitle: "semantic memory",
      icon: "🧠",
      x: 490,
      y: 310,
      status: "idle",
      stats: {},
    },
    {
      id: "librarian",
      label: "QMD",
      subtitle: "3,445 docs",
      icon: "🔍",
      x: 620,
      y: 310,
      status: "idle",
      stats: {},
    },
    {
      id: "cookbooks",
      label: "Skills",
      subtitle: "skillshare · 405+",
      icon: "📚",
      x: 350,
      y: 410,
      status: "idle",
      stats: {},
    },
    {
      id: "apo",
      label: "Agent Lightning",
      subtitle: "APO · hourly",
      icon: "⚡",
      x: 480,
      y: 410,
      status: "idle",
      stats: { Proposals: "pending", Cycle: "hourly", Mode: "QA" },
    },
    {
      id: "gitnexus",
      label: "GitNexus",
      subtitle: "code graph",
      icon: "🗺️",
      x: 610,
      y: 410,
      status: "idle",
      stats: { Repos: 8, Symbols: "75k+", Edges: "100k+" },
    },
    {
      id: "llmwiki",
      label: "LLM Wiki",
      subtitle: "knowledge wiki",
      icon: "📖",
      x: 740,
      y: 410,
      status: "idle",
      stats: { Domain: "6 topics", Status: "active", Maintainer: "Alba" },
    },
  ];

  const agentNodeIds = [...agentNodes.map((a) => a.id), "local-agents"];
  return { nodes: [...staticNodes, ...agentNodes, localNode], agentNodeIds };
}

function buildEdges(agentNodeIds: string[]): FlowEdge[] {
  const baseEdges: FlowEdge[] = [
    { from: "request", to: "gateways", type: "request" },
    { from: "gateways", to: "manager", type: "request" },
    { from: "manager", to: "output", type: "request" },
    { from: "gateways", to: "tunnels", type: "request" },
    { from: "manager", to: "taskboard", type: "request" },
  ];

  // Paperclip -> each agent
  const agentEdges: FlowEdge[] = agentNodeIds.map((id) => ({
    from: "manager",
    to: id,
    type: "request" as const,
  }));

  // Agents -> support systems (limit to avoid visual noise)
  const supportEdges: FlowEdge[] = agentNodeIds
    .flatMap((id) => [
      { from: id, to: "notebooks", type: "memory" as const },
      { from: id, to: "librarian", type: "knowledge" as const },
      { from: id, to: "cookbooks", type: "knowledge" as const },
    ])
    .slice(0, 9);

  const intelligenceEdges: FlowEdge[] = [
    { from: "local-agents", to: "gitnexus", type: "knowledge" },
    { from: "local-agents", to: "llmwiki", type: "knowledge" },
    { from: "apo", to: "cookbooks", type: "apo" },
    { from: "local-agents", to: "apo", type: "apo" },
  ];

  return [...baseEdges, ...agentEdges, ...supportEdges, ...intelligenceEdges];
}

function nodeCenterFromList(
  nodes: FlowNode[],
  nodeId: string
): { x: number; y: number } | null {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return null;
  return { x: node.x + NODE_W / 2, y: node.y + NODE_H / 2 };
}

function getNodeStatus(
  nodeId: string,
  nodeActivity: Record<string, number>,
  services: HealthStatus[],
  agentStatus?: string
): FlowNode["status"] {
  // Agent nodes: use real agent status
  if (nodeId.startsWith("agent-") || nodeId === "local-agents") {
    if (agentStatus === "active") return "active";
    if (agentStatus === "error") return "error";
    return "idle";
  }

  const minsAgo = nodeActivity[nodeId];
  if (minsAgo !== undefined && minsAgo < 5) return "active";
  if (minsAgo !== undefined && minsAgo < 60) return "idle";

  const svcMap: Record<string, string> = {
    gateways: "Agents",
    manager: "Paperclip",
    notebooks: "mem0",
    librarian: "QMD",
  };
  const svcName = svcMap[nodeId];
  if (!svcName) return "idle";
  const svc = services.find((s) => s.service === svcName);
  if (svc?.status === "up") return "active";
  if (svc?.status === "down") return "error";
  return "idle";
}

export function FlowCanvas({
  services,
  agentCount,
  activeCount,
  memoryCount,
  knowledgeCount,
  skillCount,
  nodeActivity,
  highlightedNode,
  remoteAgents = [],
  localActiveCount,
  localTotalCount,
}: FlowCanvasProps) {
  const localActive = localActiveCount ?? activeCount;
  const localTotal = localTotalCount ?? agentCount;

  const { nodes: rawNodes, agentNodeIds } = useMemo(
    () => buildNodes(remoteAgents, localTotal, localActive),
    [remoteAgents, localTotal, localActive]
  );

  const edges = useMemo(() => buildEdges(agentNodeIds), [agentNodeIds]);

  // Apply real-time status, stats overrides
  const nodes: FlowNode[] = rawNodes.map((raw) => {
    const status = getNodeStatus(
      raw.id,
      nodeActivity,
      services,
      raw.agentStatus
    );

    // Enrich static node stats with live data
    const stats = { ...raw.stats };
    if (raw.id === "notebooks") stats["Entries"] = memoryCount;
    if (raw.id === "librarian") {
      stats["Docs"] = knowledgeCount;
      stats["Collections"] = 15;
    }
    if (raw.id === "cookbooks") stats["Skills"] = skillCount || "405+";

    const svcMatch = services.find((s) =>
      s.service.toLowerCase().includes(raw.id.toLowerCase())
    );
    if (svcMatch?.latencyMs != null) {
      stats["latency"] = `${svcMatch.latencyMs}ms`;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { agentStatus: _drop, ...rest } = raw;
    return { ...rest, status, stats };
  });

  const resolvedEdges = edges.map((edge, i) => {
    const from = nodeCenterFromList(nodes, edge.from);
    const to = nodeCenterFromList(nodes, edge.to);
    return {
      ...edge,
      key: `${edge.from}-${edge.to}-${i}`,
      x1: from?.x ?? 0,
      y1: from?.y ?? 0,
      x2: to?.x ?? 0,
      y2: to?.y ?? 0,
    };
  });

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 overflow-x-auto">
      <svg
        viewBox="0 0 900 500"
        className="w-full"
        style={{ minWidth: 640, maxHeight: 520 }}
      >
        {/* Edges drawn first, under nodes */}
        {resolvedEdges.map((edge) => (
          <FlowEdgeComponent key={edge.key} edge={edge} />
        ))}

        {/* Nodes */}
        {nodes.map((node) => (
          <FlowNodeComponent
            key={node.id}
            node={node}
            highlighted={
              (nodeActivity[node.id] !== undefined &&
                nodeActivity[node.id] < 2) ||
              highlightedNode === node.id
            }
          />
        ))}
      </svg>
    </div>
  );
}

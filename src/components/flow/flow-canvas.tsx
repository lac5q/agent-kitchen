"use client";

import { FlowNodeComponent } from "./flow-node";
import { FlowEdgeComponent } from "./flow-edge";
import type { FlowNode, FlowEdge, HealthStatus } from "@/types";

// Node positions
const NODE_DEFS: Omit<FlowNode, "status" | "stats">[] = [
  // Row 1 - main flow
  { id: "request",    label: "User / Telegram", subtitle: "input channel",        icon: "📨", x: 20,  y: 50  },
  { id: "gateways",   label: "Gateways",         subtitle: "Alba · Gwen · Sophia", icon: "🚪", x: 170, y: 50  },
  { id: "manager",    label: "Paperclip",         subtitle: "task orchestrator",   icon: "📞", x: 350, y: 50  },
  { id: "agents",     label: "Chef Fleet",        subtitle: "22 local + 5 remote", icon: "👨‍🍳", x: 530, y: 50  },
  { id: "output",     label: "Response",          subtitle: "Discord · Telegram",  icon: "📤", x: 710, y: 50  },

  // Row 2 - support systems
  { id: "tunnels",    label: "CF Tunnels",        subtitle: "kitchen.epilogue...", icon: "📡", x: 170, y: 200 },
  { id: "taskboard",  label: "Task Board",        subtitle: "Nerve Kanban",        icon: "📋", x: 350, y: 200 },
  { id: "notebooks",  label: "mem0",              subtitle: "semantic memory",     icon: "🧠", x: 530, y: 200 },
  { id: "librarian",  label: "QMD",               subtitle: "3,445 docs",          icon: "🔍", x: 660, y: 200 },

  // Row 3 - intelligence layer
  { id: "cookbooks",  label: "Skills",            subtitle: "skillshare · 405+",   icon: "📚", x: 350, y: 330 },
  { id: "apo",        label: "Agent Lightning",   subtitle: "APO · self-learning", icon: "⚡", x: 480, y: 330 },
  { id: "gitnexus",   label: "GitNexus",          subtitle: "code graph",          icon: "🗺️", x: 610, y: 330 },
  { id: "llmwiki",    label: "LLM Wiki",          subtitle: "knowledge wiki",      icon: "📖", x: 740, y: 330 },
];

const EDGE_DEFS: FlowEdge[] = [
  // Main flow (top row)
  { from: "request",  to: "gateways",  type: "request"   },
  { from: "gateways", to: "manager",   type: "request"   },
  { from: "manager",  to: "agents",    type: "request"   },
  { from: "agents",   to: "output",    type: "request"   },

  // Vertical connections to support
  { from: "gateways", to: "tunnels",   type: "request"   },
  { from: "manager",  to: "taskboard", type: "request"   },
  { from: "agents",   to: "notebooks", type: "memory"    },
  { from: "agents",   to: "librarian", type: "knowledge" },

  // Agent to intelligence layer
  { from: "agents",   to: "cookbooks", type: "knowledge" },
  { from: "agents",   to: "gitnexus",  type: "knowledge" },
  { from: "agents",   to: "llmwiki",   type: "knowledge" },

  // APO loop
  { from: "apo",      to: "cookbooks", type: "apo"       },
  { from: "agents",   to: "apo",       type: "apo"       },
];

// Anchor center of each node (rect is 70x70)
const NODE_W = 70;
const NODE_H = 70;

function nodeCenter(nodeId: string): { x: number; y: number } | null {
  const def = NODE_DEFS.find((n) => n.id === nodeId);
  if (!def) return null;
  return { x: def.x + NODE_W / 2, y: def.y + NODE_H / 2 };
}

interface FlowCanvasProps {
  services: HealthStatus[];
  agentCount: number;
  activeCount: number;
  memoryCount: number;
  knowledgeCount: number;
  skillCount: number;
  nodeActivity: Record<string, number>; // minutesAgo for each node
  highlightedNode?: string | null;
}

function getNodeStatus(
  nodeId: string,
  nodeActivity: Record<string, number>,
  services: HealthStatus[]
): "active" | "idle" | "error" {
  const minsAgo = nodeActivity[nodeId];
  if (minsAgo !== undefined && minsAgo < 5) return "active";
  if (minsAgo !== undefined && minsAgo < 60) return "idle";
  // Fall back to service health for infra nodes
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
}: FlowCanvasProps) {
  // Build full FlowNode list with status and stats
  const nodes: FlowNode[] = NODE_DEFS.map((def) => {
    const status = getNodeStatus(def.id, nodeActivity, services);
    const stats: Record<string, string | number> = {};

    if (def.id === "agents")    { stats["Total"] = agentCount; stats["Active"] = activeCount; }
    if (def.id === "notebooks") stats["Entries"] = memoryCount;
    if (def.id === "librarian") { stats["Docs"] = knowledgeCount; stats["Collections"] = 15; }
    if (def.id === "cookbooks") stats["Skills"] = skillCount || "405+";
    if (def.id === "gateways")  { stats["Alba"] = "18793"; stats["Gwen"] = "18792"; stats["Sophia/Maria"] = "Tailscale"; }
    if (def.id === "manager")   { stats["Platform"] = "Paperclip"; stats["Port"] = "3100"; }
    if (def.id === "apo")       { stats["Proposals"] = "pending"; stats["Cycle"] = "hourly"; stats["Mode"] = "QA"; }
    if (def.id === "gitnexus")  { stats["Repos"] = 8; stats["Symbols"] = "75k+"; stats["Edges"] = "100k+"; }
    if (def.id === "llmwiki")   { stats["Domain"] = "6 topics"; stats["Status"] = "active"; stats["Maintainer"] = "Alba"; }

    const svcMatch = services.find((s) =>
      s.service.toLowerCase().includes(def.id.toLowerCase())
    );
    if (svcMatch?.latencyMs != null) {
      stats["latency"] = `${svcMatch.latencyMs}ms`;
    }

    return { ...def, status, stats };
  });

  // Build resolved edges with pixel coordinates
  const resolvedEdges = EDGE_DEFS.map((edge, i) => {
    const from = nodeCenter(edge.from);
    const to = nodeCenter(edge.to);
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
        viewBox="0 0 830 430"
        className="w-full"
        style={{ minWidth: 600, maxHeight: 450 }}
      >
        {/* Edges (drawn first, under nodes) */}
        {resolvedEdges.map((edge) => (
          <FlowEdgeComponent key={edge.key} edge={edge} />
        ))}

        {/* Nodes */}
        {nodes.map((node) => (
          <FlowNodeComponent
            key={node.id}
            node={node}
            highlighted={
              (nodeActivity[node.id] !== undefined && nodeActivity[node.id] < 2) ||
              highlightedNode === node.id
            }
          />
        ))}
      </svg>
    </div>
  );
}

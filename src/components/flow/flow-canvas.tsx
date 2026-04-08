"use client";

import { useState, useCallback } from "react";
import { FlowNodeComponent } from "./flow-node";
import { FlowEdgeComponent } from "./flow-edge";
import { DemoMode } from "./demo-mode";
import type { FlowNode, FlowEdge, HealthStatus } from "@/types";

// Node positions
const NODE_DEFS: Omit<FlowNode, "status" | "stats">[] = [
  { id: "request",   label: "Request",   subtitle: "incoming",     icon: "📥", x: 30,  y: 120 },
  { id: "gateways",  label: "Gateways",  subtitle: "discord/tg",   icon: "🚪", x: 180, y: 60  },
  { id: "manager",   label: "Manager",   subtitle: "orchestrator",  icon: "📞", x: 350, y: 120 },
  { id: "agents",    label: "Agents",    subtitle: "chefs",         icon: "👨‍🍳", x: 530, y: 120 },
  { id: "output",    label: "Output",    subtitle: "response",      icon: "📤", x: 700, y: 120 },
  { id: "tunnels",   label: "Tunnels",   subtitle: "tailscale",     icon: "📡", x: 180, y: 250 },
  { id: "taskboard", label: "Taskboard", subtitle: "PMO tasks",     icon: "📋", x: 350, y: 250 },
  { id: "cookbooks", label: "Cookbooks", subtitle: "skills",        icon: "📚", x: 480, y: 280 },
  { id: "notebooks", label: "Notebooks", subtitle: "mem0",          icon: "🧠", x: 580, y: 280 },
  { id: "librarian", label: "Librarian", subtitle: "knowledge",     icon: "🔍", x: 680, y: 280 },
];

const EDGE_DEFS: FlowEdge[] = [
  { from: "request",   to: "gateways",  type: "request"   },
  { from: "gateways",  to: "manager",   type: "request"   },
  { from: "manager",   to: "agents",    type: "request"   },
  { from: "agents",    to: "output",    type: "request"   },
  { from: "gateways",  to: "tunnels",   type: "request"   },
  { from: "manager",   to: "taskboard", type: "request"   },
  { from: "agents",    to: "cookbooks", type: "knowledge" },
  { from: "agents",    to: "notebooks", type: "memory"    },
  { from: "agents",    to: "librarian", type: "knowledge" },
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
  memoryCount: number;
  knowledgeCount: number;
  skillCount: number;
}

function deriveNodeStatus(
  nodeId: string,
  services: HealthStatus[]
): FlowNode["status"] {
  const SERVICE_MAP: Record<string, string[]> = {
    gateways:  ["discord", "telegram", "gateway"],
    manager:   ["manager", "opencode", "openclaw"],
    agents:    ["claude", "codex", "qwen", "gemini"],
    notebooks: ["mem0", "memory"],
    librarian: ["knowledge", "qdrant", "qmd"],
    tunnels:   ["tailscale", "tunnel"],
    taskboard: ["pmo", "taskboard"],
    cookbooks: ["skills", "cookbook"],
  };

  const keywords = SERVICE_MAP[nodeId];
  if (!keywords) return "active";

  const matched = services.filter((s) =>
    keywords.some((kw) => s.service.toLowerCase().includes(kw))
  );

  if (matched.length === 0) return "idle";
  if (matched.some((s) => s.status === "down")) return "error";
  if (matched.some((s) => s.status === "degraded")) return "idle";
  return "active";
}

export function FlowCanvas({
  services,
  agentCount,
  memoryCount,
  knowledgeCount,
  skillCount,
}: FlowCanvasProps) {
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const handleHighlight = useCallback((id: string | null) => {
    setHighlightedId(id);
  }, []);

  // Build full FlowNode list with status and stats
  const nodes: FlowNode[] = NODE_DEFS.map((def) => {
    const status = deriveNodeStatus(def.id, services);
    const stats: Record<string, string | number> = {};

    if (def.id === "agents") stats["agents"] = agentCount;
    if (def.id === "notebooks") stats["memories"] = memoryCount;
    if (def.id === "librarian") stats["docs"] = knowledgeCount;
    if (def.id === "cookbooks") stats["skills"] = skillCount;

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
    <div className="space-y-6">
      {/* SVG Canvas */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 overflow-x-auto">
        <svg
          viewBox="0 0 820 380"
          className="w-full"
          style={{ minWidth: 600, maxHeight: 420 }}
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
              highlighted={highlightedId === node.id}
            />
          ))}
        </svg>
      </div>

      {/* Demo mode */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-6 py-4">
        <DemoMode onHighlight={handleHighlight} />
      </div>
    </div>
  );
}

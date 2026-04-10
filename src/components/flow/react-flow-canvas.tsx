"use client";

import { useCallback, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type NodeTypes,
  Handle,
  Position,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { HealthStatus } from "@/types";

// Custom node component
function FlowNode({ data }: {
  data: {
    label: string;
    subtitle: string;
    icon: string;
    status: string;
    highlighted: boolean;
  }
}) {
  const STATUS_COLORS = { active: "#10b981", idle: "#f59e0b", dormant: "#64748b", error: "#f43f5e" };
  const color = STATUS_COLORS[data.status as keyof typeof STATUS_COLORS] || STATUS_COLORS.dormant;
  const isActive = data.status === "active" || data.highlighted;

  return (
    <div className="flex flex-col items-center" style={{ width: 90 }}>
      <Handle type="target" position={Position.Left} style={{ opacity: 0, top: 40 }} />
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div
        className="flex items-center justify-center rounded-2xl cursor-pointer"
        style={{
          width: 80,
          height: 80,
          background: "#0f172a",
          border: `2px solid ${data.highlighted ? "#f59e0b" : color}`,
          boxShadow: isActive ? `0 0 16px ${data.highlighted ? "#f59e0b" : color}60` : "none",
          transition: "all 0.2s",
        }}
      >
        <span style={{ fontSize: 28 }}>{data.icon}</span>
      </div>
      <p style={{ fontSize: 8, fontWeight: 700, color: "#f59e0b", marginTop: 4, textAlign: "center", maxWidth: 88, lineHeight: 1.2 }}>
        {data.label}
      </p>
      <p style={{ fontSize: 8, color: "#64748b", textAlign: "center", maxWidth: 88, lineHeight: 1.2 }}>
        {data.subtitle}
      </p>
      <Handle type="source" position={Position.Right} style={{ opacity: 0, top: 40 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

const nodeTypes: NodeTypes = { flowNode: FlowNode };

interface ReactFlowCanvasProps {
  services: HealthStatus[];
  agentCount: number;
  activeCount: number;
  memoryCount: number;
  knowledgeCount: number;
  skillCount: number;
  nodeActivity: Record<string, number>;
  highlightedNode?: string | null;
  remoteAgents?: Array<{ id: string; name: string; status: string; latencyMs: number | null; location: string }>;
  localActiveCount?: number;
  localTotalCount?: number;
  onNodeClick: (nodeId: string, nodeLabel: string, nodeIcon: string, nodeStats: Record<string, string | number>) => void;
}

const EDGE_COLORS = {
  request: "#f59e0b",
  knowledge: "#10b981",
  memory: "#0ea5e9",
  apo: "#8b5cf6",
};

export function ReactFlowCanvas({
  services,
  agentCount,
  activeCount,
  memoryCount,
  knowledgeCount,
  skillCount,
  nodeActivity,
  highlightedNode,
  remoteAgents = [],
  localActiveCount = 0,
  localTotalCount = 0,
  onNodeClick,
}: ReactFlowCanvasProps) {

  function getStatus(nodeId: string, agentStatus?: string): "active" | "idle" | "dormant" | "error" {
    if (agentStatus) return agentStatus === "active" ? "active" : "dormant";
    const minsAgo = nodeActivity[nodeId];
    if (minsAgo !== undefined && minsAgo < 5) return "active";
    if (minsAgo !== undefined && minsAgo < 60) return "idle";
    const svcMap: Record<string, string> = { gateways: "Agents", manager: "Paperclip", notebooks: "mem0", librarian: "QMD" };
    const svc = services.find(s => s.service === svcMap[nodeId]);
    if (svc?.status === "up") return "active";
    if (svc?.status === "down") return "error";
    return "idle";
  }

  function nodeStats(id: string): Record<string, string | number> {
    switch (id) {
      case "agents": return { "Total": agentCount, "Active": activeCount };
      case "notebooks": return { "Entries": memoryCount };
      case "librarian": return { "Docs": knowledgeCount, "Collections": 15 };
      case "cookbooks": return { "Skills": skillCount };
      case "gateways": return { "Alba": "18793", "Gwen": "18792" };
      case "manager": return { "Platform": "Paperclip", "Port": "3100" };
      case "apo": return { "Mode": "QA", "Cycle": "hourly" };
      case "gitnexus": return { "Repos": 8, "Symbols": "75k+" };
      case "llmwiki": return { "Topics": 6, "Maintainer": "Alba" };
      default: return {};
    }
  }

  // Build agent nodes dynamically from real remote agents
  const KEY_AGENTS = ["alba", "gwen", "sophia", "maria", "lucia"];
  const keyRemote = KEY_AGENTS.map(id => remoteAgents.find(a => a.id === id)).filter(Boolean) as typeof remoteAgents;
  const AGENT_ICONS: Record<string, string> = { alba: "🤖", gwen: "🌸", sophia: "💼", maria: "✍️", lucia: "🔧" };

  const agentSpacing = 120;
  const agentStartX = 100;
  const agentY = 280;

  const nodes: Node[] = useMemo(() => {
    const staticNodes: Node[] = [
      { id: "request",   position: { x: 20,  y: 100 }, data: { label: "User / Telegram", subtitle: "input channel",        icon: "📨", status: getStatus("request"),   highlighted: highlightedNode === "request"   }, type: "flowNode" },
      { id: "gateways",  position: { x: 160, y: 100 }, data: { label: "Gateways",         subtitle: "Alba · Gwen · Sophia", icon: "🚪", status: getStatus("gateways"),  highlighted: highlightedNode === "gateways"  }, type: "flowNode" },
      { id: "manager",   position: { x: 560, y: 100 }, data: { label: "Paperclip",        subtitle: "orchestrator",         icon: "📞", status: getStatus("manager"),   highlighted: highlightedNode === "manager"   }, type: "flowNode" },
      { id: "output",    position: { x: 720, y: 100 }, data: { label: "Response",         subtitle: "Discord · Telegram",   icon: "📤", status: getStatus("output"),    highlighted: highlightedNode === "output"    }, type: "flowNode" },
      { id: "tunnels",   position: { x: 20,  y: 420 }, data: { label: "CF Tunnels",       subtitle: "kitchen.epilogue...",  icon: "📡", status: getStatus("tunnels"),   highlighted: highlightedNode === "tunnels"   }, type: "flowNode" },
      { id: "taskboard", position: { x: 160, y: 420 }, data: { label: "Task Board",       subtitle: "Nerve Kanban",         icon: "📋", status: getStatus("taskboard"), highlighted: highlightedNode === "taskboard" }, type: "flowNode" },
      { id: "notebooks", position: { x: 460, y: 420 }, data: { label: "mem0",             subtitle: "semantic memory",      icon: "🧠", status: getStatus("notebooks"), highlighted: highlightedNode === "notebooks" }, type: "flowNode" },
      { id: "librarian", position: { x: 600, y: 420 }, data: { label: "QMD",              subtitle: "3,445 docs",           icon: "🔍", status: getStatus("librarian"), highlighted: highlightedNode === "librarian" }, type: "flowNode" },
      { id: "cookbooks", position: { x: 160, y: 560 }, data: { label: "Skills",           subtitle: "skillshare · 405+",   icon: "📚", status: getStatus("cookbooks"), highlighted: highlightedNode === "cookbooks" }, type: "flowNode" },
      { id: "apo",       position: { x: 320, y: 560 }, data: { label: "Agent Lightning",  subtitle: "APO · hourly",         icon: "⚡", status: getStatus("apo"),       highlighted: highlightedNode === "apo"       }, type: "flowNode" },
      { id: "gitnexus",  position: { x: 480, y: 560 }, data: { label: "GitNexus",         subtitle: "code graph",           icon: "🗺️", status: getStatus("gitnexus"),  highlighted: highlightedNode === "gitnexus"  }, type: "flowNode" },
      { id: "llmwiki",   position: { x: 640, y: 560 }, data: { label: "LLM Wiki",         subtitle: "knowledge wiki",       icon: "📖", status: getStatus("llmwiki"),   highlighted: highlightedNode === "llmwiki"   }, type: "flowNode" },
    ];

    const agentNodes: Node[] = keyRemote.map((agent, i) => ({
      id: `agent-${agent.id}`,
      position: { x: agentStartX + i * agentSpacing, y: agentY },
      data: {
        label: agent.name,
        subtitle: agent.location,
        icon: AGENT_ICONS[agent.id] || "🤖",
        status: agent.status === "active" ? "active" : "dormant",
        highlighted: highlightedNode === `agent-${agent.id}`,
      },
      type: "flowNode",
    }));

    const localNode: Node = {
      id: "local-agents",
      position: { x: agentStartX + keyRemote.length * agentSpacing, y: agentY },
      data: {
        label: `${localActiveCount} Active`,
        subtitle: `${localTotalCount} local chefs`,
        icon: "👨‍🍳",
        status: localActiveCount > 0 ? "active" : "idle",
        highlighted: highlightedNode === "local-agents",
      },
      type: "flowNode",
    };

    return [...staticNodes, ...agentNodes, localNode];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteAgents, nodeActivity, highlightedNode, localActiveCount, localTotalCount]);

  const allAgentIds = [...keyRemote.map(a => `agent-${a.id}`), "local-agents"];

  const edges: Edge[] = useMemo(() => {
    const base: Edge[] = [
      { id: "req-gw",  source: "request",  target: "gateways",  animated: true, style: { stroke: EDGE_COLORS.request,   strokeWidth: 2 } },
      { id: "gw-mgr", source: "gateways", target: "manager",   animated: true, style: { stroke: EDGE_COLORS.request,   strokeWidth: 2 } },
      { id: "mgr-out", source: "manager",  target: "output",    animated: true, style: { stroke: EDGE_COLORS.request,   strokeWidth: 2 } },
      { id: "gw-tun",  source: "gateways", target: "tunnels",   animated: true, style: { stroke: EDGE_COLORS.request,   strokeWidth: 2 } },
      { id: "mgr-tb",  source: "manager",  target: "taskboard", animated: true, style: { stroke: EDGE_COLORS.request,   strokeWidth: 2 } },
      { id: "apo-sk",  source: "apo",      target: "cookbooks", animated: true, style: { stroke: EDGE_COLORS.apo,       strokeWidth: 2 } },
    ];

    const agentEdges: Edge[] = allAgentIds.flatMap((id) => [
      { id: `mgr-${id}`,  source: "manager",   target: id,          animated: true, style: { stroke: EDGE_COLORS.request,   strokeWidth: 1.5 } },
      { id: `${id}-mem`,  source: id,           target: "notebooks", animated: true, style: { stroke: EDGE_COLORS.memory,    strokeWidth: 1 } },
      { id: `${id}-qmd`,  source: id,           target: "librarian", animated: true, style: { stroke: EDGE_COLORS.knowledge, strokeWidth: 1 } },
      { id: `${id}-sk`,   source: id,           target: "cookbooks", animated: true, style: { stroke: EDGE_COLORS.knowledge, strokeWidth: 1 } },
    ]).slice(0, 20);

    const extraEdges: Edge[] = [
      { id: "agents-apo",  source: "local-agents", target: "apo",      animated: true, style: { stroke: EDGE_COLORS.apo,       strokeWidth: 1.5 } },
      { id: "agents-gnx",  source: "local-agents", target: "gitnexus", animated: true, style: { stroke: EDGE_COLORS.knowledge, strokeWidth: 1.5 } },
      { id: "agents-wiki", source: "local-agents", target: "llmwiki",  animated: true, style: { stroke: EDGE_COLORS.knowledge, strokeWidth: 1.5 } },
    ];

    return [...base, ...agentEdges, ...extraEdges];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allAgentIds]);

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    const statsId = node.id.startsWith("agent-") ? node.id.replace("agent-", "") : node.id;
    const stats = nodeStats(statsId);
    onNodeClick(node.id, node.data.label as string, node.data.icon as string, stats);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onNodeClick]);

  return (
    <div style={{ width: "100%", height: 620, borderRadius: 12, overflow: "hidden", border: "1px solid #1e293b" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={handleNodeClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.3}
        maxZoom={2}
        attributionPosition="bottom-left"
        colorMode="dark"
      >
        <Background color="#1e293b" gap={24} variant={BackgroundVariant.Dots} />
        <Controls className="bg-slate-900 border border-slate-800" />
        <MiniMap
          style={{ background: "#0f172a", border: "1px solid #1e293b" }}
          nodeColor={(node) => {
            const status = (node.data as { status: string }).status;
            return status === "active" ? "#10b981" : status === "error" ? "#f43f5e" : "#475569";
          }}
        />
      </ReactFlow>
    </div>
  );
}

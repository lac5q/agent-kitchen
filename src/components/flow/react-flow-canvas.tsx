"use client";

import { useCallback, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  type NodeTypes,
  Handle,
  Position,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { HealthStatus } from "@/types";

// Group box node — rendered behind nodes as a visual cluster boundary
function GroupBoxNode({ data }: { data: { label: string; width: number; height: number } }) {
  return (
    <div
      style={{
        width: data.width,
        height: data.height,
        border: "1px solid #334155",
        borderRadius: 12,
        background: "rgba(30,41,59,0.35)",
        pointerEvents: "none",
        position: "relative",
      }}
    >
      <span style={{
        position: "absolute",
        top: 7,
        left: 14,
        fontSize: 9,
        fontWeight: 700,
        color: "#64748b",
        letterSpacing: "0.09em",
        textTransform: "uppercase",
      }}>
        {data.label}
      </span>
    </div>
  );
}

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

const nodeTypes: NodeTypes = { flowNode: FlowNode, groupBoxNode: GroupBoxNode };

type WireStatus = "connected" | "partial" | "not-wired";

interface DevToolStatus {
  id: string;
  name: string;
  mem0: WireStatus;
  qmd: WireStatus;
  overall: WireStatus;
}

interface SkillsStats {
  totalSkills: number;
  contributedByHermes: number;
  contributedByGwen: number;
  recentContributions: Array<{
    skill: string;
    contributor: string;
    timestamp: string;
    action: string;
  }>;
  lastPruned: string | null;
  staleCandidates: number;
  lastUpdated: string | null;
  timestamp: string;
}

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
  devToolsStatus?: DevToolStatus[];
  skillsStats?: SkillsStats | null;
  onNodeClick: (nodeId: string, nodeLabel: string, nodeIcon: string, nodeStats: Record<string, string | number>) => void;
}

const EDGE_COLORS = {
  request: "#f59e0b",
  knowledge: "#10b981",
  memory: "#0ea5e9",
  apo: "#8b5cf6",
  sync: "#06b6d4",
};

const KEY_AGENTS = ["alba", "gwen", "sophia", "maria", "lucia"];
const AGENT_ICONS: Record<string, string> = { alba: "🤖", gwen: "🌸", sophia: "💼", maria: "✍️", lucia: "🔧" };
const AGENT_SPACING = 120;
const AGENT_START_X = 100;
const AGENT_Y = 280;
const DEV_TOOL_Y = 740;
const DEV_TOOL_SPACING = 140;

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
  devToolsStatus = [],
  skillsStats = null,
  onNodeClick,
}: ReactFlowCanvasProps) {

  // Memoize devToolsMap so useMemo deps are stable
  const devToolsMap = useMemo(
    () => Object.fromEntries(devToolsStatus.map(t => [t.id, t])),
    [devToolsStatus]
  );

  const keyRemote = useMemo(
    () => KEY_AGENTS.map(id => remoteAgents.find(a => a.id === id)).filter(Boolean) as typeof remoteAgents,
    [remoteAgents]
  );

  function getStatus(nodeId: string, agentStatus?: string): "active" | "idle" | "dormant" | "error" {
    if (agentStatus) return agentStatus === "active" ? "active" : "dormant";
    const minsAgo = nodeActivity[nodeId];
    if (minsAgo !== undefined && minsAgo < 5) return "active";
    if (minsAgo !== undefined && minsAgo < 60) return "idle";
    const svcMap: Record<string, string> = {
      gateways: "Agents",
      manager: "Paperclip",
      notebooks: "mem0",
      librarian: "QMD",
      qdrant: "Qdrant",
      obsidian: "Obsidian",
      "knowledge-curator": "Curator",
    };
    const svc = services.find(s => s.service === svcMap[nodeId]);
    if (svc?.status === "up") return "active";
    if (svc?.status === "down") return "error";
    return "idle"; // "degraded" falls here → amber, which is correct for idle/warning states
  }

  const nodeStats = useCallback((id: string): Record<string, string | number> => {
    switch (id) {
      case "agents":              return { "Total": agentCount, "Active": activeCount };
      case "notebooks":           return { "Entries": memoryCount };
      case "librarian":           return { "Docs": knowledgeCount, "Collections": 15 };
      case "qdrant":              return { "Type": "Cloud", "Region": "AWS us-west-1", "Collections": 2 };
      case "cookbooks": return {
        "Skills":      skillsStats?.totalSkills ?? skillCount,
        "From Hermes": skillsStats?.contributedByHermes ?? 0,
        "From Gwen":   skillsStats?.contributedByGwen ?? 0,
        "Last Pruned": skillsStats?.lastPruned
          ? new Date(skillsStats.lastPruned).toLocaleDateString()
          : "Never",
        "Stale":       skillsStats?.staleCandidates ?? 0,
      };
      case "gateways":            return { "Alba": "18793", "Gwen": "18792" };
      case "manager":             return { "Platform": "Paperclip", "Port": "3100" };
      case "apo":                 return { "Mode": "QA", "Cycle": "hourly" };
      case "gitnexus":            return { "Repos": 8, "Symbols": "75k+" };
      case "llmwiki":             return { "Topics": 6, "Maintainer": "Alba" };
      case "knowledge-curator":   return { "Schedule": "nightly 2am", "Steps": 5 };
      case "obsidian":            return { "Type": "Knowledge Vault", "Docs": "3,400+" };
      case "claude-code": { const t = devToolsMap["claude-code"]; return t ? { "mem0": t.mem0, "QMD": t.qmd, "Status": t.overall } : { "mem0": "hook (read)", "QMD": "not wired", "Status": "partial" }; }
      case "qwen-cli":   { const t = devToolsMap["qwen-cli"];   return t ? { "mem0": t.mem0, "QMD": t.qmd, "Status": t.overall } : { "mem0": "MCP ✓", "QMD": "not wired", "Status": "partial" }; }
      case "gemini-cli": { const t = devToolsMap["gemini-cli"]; return t ? { "mem0": t.mem0, "QMD": t.qmd, "Status": t.overall } : { "mem0": "not wired", "QMD": "not wired", "Status": "gap" }; }
      case "codex":      { const t = devToolsMap["codex"];      return t ? { "mem0": t.mem0, "QMD": t.qmd, "Status": t.overall } : { "mem0": "not wired", "QMD": "not wired", "Status": "gap" }; }
      default:                    return {};
    }
  }, [agentCount, activeCount, memoryCount, knowledgeCount, skillCount, skillsStats, devToolsMap]);

  const nodes: Node[] = useMemo(() => {
    const DEV_TOOLS = [
      { id: "claude-code", label: "Claude Code", icon: "🔷" },
      { id: "qwen-cli",    label: "Qwen CLI",    icon: "🐉" },
      { id: "gemini-cli",  label: "Gemini CLI",  icon: "✨" },
      { id: "codex",       label: "Codex",       icon: "📝" },
    ];

    const wireStatusToNodeStatus: Record<WireStatus, "active" | "idle" | "dormant"> = {
      connected: "active",
      partial: "idle",
      "not-wired": "dormant",
    };

    // Group box dimensions
    const agentNodeCount = keyRemote.length + 1; // +1 for local-agents
    const agentBoxWidth = agentNodeCount * AGENT_SPACING + 90 + 20;
    const devToolBoxWidth = DEV_TOOLS.length * DEV_TOOL_SPACING + 20;

    const groupBoxNodes: Node[] = [
      {
        id: "group-agents",
        position: { x: AGENT_START_X - 15, y: AGENT_Y - 32 },
        data: { label: "Server Agents", width: agentBoxWidth, height: 142 },
        type: "groupBoxNode",
        zIndex: -1,
        selectable: false,
        draggable: false,
      },
      {
        id: "group-devtools",
        position: { x: 5, y: DEV_TOOL_Y - 32 },
        data: { label: "Dev Tools", width: devToolBoxWidth, height: 152 },
        type: "groupBoxNode",
        zIndex: -1,
        selectable: false,
        draggable: false,
      },
    ];

    const staticNodes: Node[] = [
      { id: "request",           position: { x: 20,  y: 100 }, data: { label: "User / Telegram",    subtitle: "input channel",          icon: "📨", status: getStatus("request"),           highlighted: highlightedNode === "request"           }, type: "flowNode" },
      { id: "gateways",          position: { x: 180, y: 100 }, data: { label: "Gateways",            subtitle: "Alba · Gwen · Sophia",   icon: "🚪", status: getStatus("gateways"),          highlighted: highlightedNode === "gateways"          }, type: "flowNode" },
      { id: "manager",           position: { x: 520, y: 100 }, data: { label: "Paperclip",           subtitle: "orchestrator",           icon: "📞", status: getStatus("manager"),           highlighted: highlightedNode === "manager"           }, type: "flowNode" },
      { id: "output",            position: { x: 680, y: 100 }, data: { label: "Response",            subtitle: "Discord · Telegram",     icon: "📤", status: getStatus("output"),            highlighted: highlightedNode === "output"            }, type: "flowNode" },
      { id: "tunnels",           position: { x: 20,  y: 440 }, data: { label: "CF Tunnels",          subtitle: "kitchen.epilogue...",    icon: "📡", status: getStatus("tunnels"),           highlighted: highlightedNode === "tunnels"           }, type: "flowNode" },
      { id: "taskboard",         position: { x: 160, y: 440 }, data: { label: "Task Board",          subtitle: "Nerve Kanban",           icon: "📋", status: getStatus("taskboard"),         highlighted: highlightedNode === "taskboard"         }, type: "flowNode" },
      { id: "notebooks",         position: { x: 380, y: 440 }, data: { label: "mem0",                subtitle: "semantic memory",        icon: "🧠", status: getStatus("notebooks"),         highlighted: highlightedNode === "notebooks"         }, type: "flowNode" },
      { id: "librarian",         position: { x: 520, y: 440 }, data: { label: "QMD",                 subtitle: "BM25 · keyword",         icon: "🔍", status: getStatus("librarian"),         highlighted: highlightedNode === "librarian"         }, type: "flowNode" },
      { id: "qdrant",            position: { x: 660, y: 440 }, data: { label: "Qdrant Cloud",        subtitle: "vector store · AWS",     icon: "🗄️", status: getStatus("qdrant"),            highlighted: highlightedNode === "qdrant"            }, type: "flowNode" },
      { id: "cookbooks",         position: { x: 20,  y: 580 }, data: { label: "Skills",              subtitle: `skillshare · ${skillCount}`,     icon: "📚", status: getStatus("cookbooks"),         highlighted: highlightedNode === "cookbooks"         }, type: "flowNode" },
      { id: "apo",               position: { x: 150, y: 580 }, data: { label: "Agent Lightning",     subtitle: "APO · hourly",           icon: "⚡", status: getStatus("apo"),               highlighted: highlightedNode === "apo"               }, type: "flowNode" },
      { id: "gitnexus",          position: { x: 280, y: 580 }, data: { label: "GitNexus",            subtitle: "code graph",             icon: "🗺️", status: getStatus("gitnexus"),          highlighted: highlightedNode === "gitnexus"          }, type: "flowNode" },
      { id: "llmwiki",           position: { x: 410, y: 580 }, data: { label: "LLM Wiki",            subtitle: "knowledge wiki",         icon: "📖", status: getStatus("llmwiki"),           highlighted: highlightedNode === "llmwiki"           }, type: "flowNode" },
      { id: "knowledge-curator", position: { x: 540, y: 580 }, data: { label: "Knowledge Curator",   subtitle: "nightly · curator",      icon: "🧹", status: getStatus("knowledge-curator"), highlighted: highlightedNode === "knowledge-curator" }, type: "flowNode" },
      { id: "obsidian",          position: { x: 670, y: 580 }, data: { label: "Obsidian",            subtitle: "knowledge vault",        icon: "📓", status: getStatus("obsidian"),          highlighted: highlightedNode === "obsidian"          }, type: "flowNode" },
    ];

    const devToolNodes: Node[] = DEV_TOOLS.map(({ id, label, icon }, i) => {
      const t = devToolsMap[id];
      const wireStatus: WireStatus = t ? t.overall : "not-wired";
      const subtitle = t ? `mem0: ${t.mem0} · qmd: ${t.qmd}` : "checking...";
      return {
        id,
        position: { x: 20 + i * DEV_TOOL_SPACING, y: DEV_TOOL_Y },
        data: { label, subtitle, icon, status: wireStatusToNodeStatus[wireStatus], highlighted: highlightedNode === id },
        type: "flowNode",
      };
    });

    const agentNodes: Node[] = keyRemote.map((agent, i) => ({
      id: `agent-${agent.id}`,
      position: { x: AGENT_START_X + i * AGENT_SPACING, y: AGENT_Y },
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
      position: { x: AGENT_START_X + keyRemote.length * AGENT_SPACING, y: AGENT_Y },
      data: {
        label: `${localActiveCount} Active`,
        subtitle: `${localTotalCount} local chefs`,
        icon: "👨‍🍳",
        status: localActiveCount > 0 ? "active" : "idle",
        highlighted: highlightedNode === "local-agents",
      },
      type: "flowNode",
    };

    // Group boxes must be first so they render behind everything else
    return [...groupBoxNodes, ...staticNodes, ...agentNodes, localNode, ...devToolNodes];
  }, [remoteAgents, keyRemote, nodeActivity, highlightedNode, localActiveCount, localTotalCount, devToolsMap, nodeStats]);

  const allAgentIds = useMemo(
    () => keyRemote.map(a => `agent-${a.id}`),
    [keyRemote]
  );

  const edges: Edge[] = useMemo(() => {
    const base: Edge[] = [
      { id: "req-gw",       source: "request",           target: "gateways",  animated: true, style: { stroke: EDGE_COLORS.request,   strokeWidth: 2 } },
      { id: "gw-mgr",       source: "gateways",          target: "manager",   animated: true, style: { stroke: EDGE_COLORS.request,   strokeWidth: 2 } },
      { id: "mgr-out",      source: "manager",           target: "output",    animated: true, style: { stroke: EDGE_COLORS.request,   strokeWidth: 2 } },
      { id: "gw-tun",       source: "gateways",          target: "tunnels",   animated: true, style: { stroke: EDGE_COLORS.request,   strokeWidth: 2 } },
      { id: "mgr-tb",       source: "manager",           target: "taskboard", animated: true, style: { stroke: EDGE_COLORS.request,   strokeWidth: 2 } },
      { id: "apo-sk",       source: "apo",               target: "cookbooks", animated: true, style: { stroke: EDGE_COLORS.apo,       strokeWidth: 2 } },
      { id: "mem-qdr",      source: "notebooks",         target: "qdrant",    animated: true, style: { stroke: EDGE_COLORS.memory,    strokeWidth: 1.5 } },
      { id: "curator-gnx",  source: "knowledge-curator", target: "gitnexus",  animated: true, style: { stroke: EDGE_COLORS.knowledge, strokeWidth: 1.5 } },
      { id: "curator-wiki", source: "knowledge-curator", target: "llmwiki",   animated: true, style: { stroke: EDGE_COLORS.knowledge, strokeWidth: 1.5 } },
      { id: "curator-mem",  source: "knowledge-curator", target: "notebooks", animated: true, style: { stroke: EDGE_COLORS.memory,    strokeWidth: 1.5 } },
      { id: "curator-qmd",  source: "knowledge-curator", target: "librarian", animated: true, style: { stroke: EDGE_COLORS.knowledge, strokeWidth: 1.5 } },
      { id: "lib-obs",      source: "librarian",         target: "obsidian",  animated: true, style: { stroke: EDGE_COLORS.knowledge, strokeWidth: 1.5 } },
      { id: "wiki-obs",     source: "llmwiki",           target: "obsidian",  animated: true, style: { stroke: EDGE_COLORS.knowledge, strokeWidth: 1.5 } },
      { id: "curator-obs",  source: "knowledge-curator", target: "obsidian",  animated: true, style: { stroke: EDGE_COLORS.knowledge, strokeWidth: 1.5 } },
      { id: "mem-qmd",      source: "notebooks",         target: "librarian", animated: true, style: { stroke: EDGE_COLORS.memory,    strokeWidth: 1 } },
      { id: "wiki-qmd",     source: "llmwiki",           target: "librarian", animated: true, style: { stroke: EDGE_COLORS.knowledge, strokeWidth: 1 } },
    ];

    const agentEdges: Edge[] = allAgentIds.flatMap((id) => [
      { id: `mgr-${id}`, source: "manager", target: id,          animated: true, style: { stroke: EDGE_COLORS.request,   strokeWidth: 1.5 } },
      { id: `${id}-mem`, source: id,        target: "notebooks", animated: true, style: { stroke: EDGE_COLORS.memory,    strokeWidth: 1 } },
      { id: `${id}-qmd`, source: id,        target: "librarian", animated: true, style: { stroke: EDGE_COLORS.knowledge, strokeWidth: 1 } },
      { id: `${id}-sk`,  source: id,        target: "cookbooks", animated: true, style: { stroke: EDGE_COLORS.knowledge, strokeWidth: 1 } },
    ]);

    // Dev tool edges — only add when actually wired
    const devToolEdges: Edge[] = ["claude-code", "qwen-cli", "gemini-cli", "codex"].flatMap(id => {
      const t = devToolsMap[id];
      const result: Edge[] = [];
      if (t && t.mem0 !== "not-wired") result.push({ id: `${id}-mem`, source: id, target: "notebooks", animated: true, style: { stroke: EDGE_COLORS.memory, strokeWidth: 1 } });
      if (t && t.qmd !== "not-wired")  result.push({ id: `${id}-qmd-edge`, source: id, target: "librarian", animated: true, style: { stroke: EDGE_COLORS.knowledge, strokeWidth: 1 } });
      return result;
    });

    const extraEdges: Edge[] = [
      { id: "agents-apo",  source: "local-agents", target: "apo",      animated: true, style: { stroke: EDGE_COLORS.apo,       strokeWidth: 1.5 } },
      { id: "agents-gnx",  source: "local-agents", target: "gitnexus", animated: true, style: { stroke: EDGE_COLORS.knowledge, strokeWidth: 1.5 } },
      { id: "agents-wiki", source: "local-agents", target: "llmwiki",  animated: true, style: { stroke: EDGE_COLORS.knowledge, strokeWidth: 1.5 } },
      { id: "agents-mem",  source: "local-agents", target: "notebooks", animated: true, style: { stroke: EDGE_COLORS.memory,    strokeWidth: 1 } },
      { id: "agents-qmd",  source: "local-agents", target: "librarian", animated: true, style: { stroke: EDGE_COLORS.knowledge, strokeWidth: 1 } },
      { id: "agents-sk",   source: "local-agents", target: "cookbooks", animated: true, style: { stroke: EDGE_COLORS.knowledge, strokeWidth: 1 } },
      ...devToolEdges,
    ];

    // Skill sync flow edges — dashed cyan, only when alba is in the remote agents graph
    // Use allAgentIds (already in deps) not keyRemote (not in deps — would cause stale closure)
    const albaInGraph = allAgentIds.includes("agent-alba");
    const skillSyncEdges: Edge[] = albaInGraph ? [
      {
        id: "alba-cookbooks-skill",
        source: "agent-alba",
        target: "cookbooks",
        animated: false,          // static dashed, not flowing
        style: {
          stroke: EDGE_COLORS.sync,
          strokeWidth: 1.5,
          strokeDasharray: "5,5",
        },
      },
      {
        id: "cookbooks-gateways-skill",
        source: "cookbooks",
        target: "gateways",
        animated: false,
        style: {
          stroke: EDGE_COLORS.sync,
          strokeWidth: 1.5,
          strokeDasharray: "5,5",
        },
      },
    ] : [];

    return [...base, ...agentEdges, ...extraEdges, ...skillSyncEdges];
  }, [allAgentIds, devToolsMap]);

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.type === "groupBoxNode") return;
    const statsId = node.id.startsWith("agent-") ? node.id.replace("agent-", "") : node.id;
    const stats = nodeStats(statsId);
    onNodeClick(node.id, node.data.label as string, node.data.icon as string, stats);
  }, [onNodeClick, nodeStats]);

  return (
    <div style={{ width: "100%", height: 900, borderRadius: 12, overflow: "hidden", border: "1px solid #1e293b" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={handleNodeClick}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.3}
        maxZoom={2}
        attributionPosition="bottom-left"
        colorMode="dark"
      >
        <Background color="#1e293b" gap={24} variant={BackgroundVariant.Dots} />
        <Controls className="bg-slate-900 border border-slate-800" />
      </ReactFlow>
    </div>
  );
}

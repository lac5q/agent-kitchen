"use client";

import { useState } from "react";
import { useHealth, useAgents, useKnowledge, useMemory, useActivity, useSkills, usePaperclipFleet, useToolAttention } from "@/lib/api-client";
import { ReactFlowCanvas } from "@/components/flow/react-flow-canvas";
import { ActivityFeed } from "@/components/flow/activity-feed";
import { NodeDetailPanel } from "@/components/flow/node-detail-panel";
import { VoicePanel } from "@/components/voice/VoicePanel";
import { TopologyCanvas } from "@/components/workflow/topology-canvas";
import { NodeDetailRail } from "@/components/workflow/node-detail-rail";
import { NOC, NOC_FONT_BODY, NOC_FONT_MONO } from "@/lib/noc-theme";

interface SelectedNode {
  id: string;
  label: string;
  icon: string;
  stats: Record<string, string | number>;
}

export default function FlowPage() {
  const { data: healthData } = useHealth();
  const { data: agentsData } = useAgents();
  const { data: knowledgeData } = useKnowledge();
  const { data: memoryData } = useMemory("claude");
  const { data: activityData } = useActivity();
  const { data: skillsData } = useSkills();
  const { data: toolAttentionData } = useToolAttention();
  const { data: paperclipFleet, isLoading: paperclipLoading } = usePaperclipFleet();
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [showFlow, setShowFlow] = useState(false);
  const [topoSelectedId, setTopoSelectedId] = useState<string | null>("memroos");
  // The canvas owns the topology fetch; it hands the selected node up so the
  // detail rail describes what is actually there rather than a fixed table.
  const [topoSelectedNode, setTopoSelectedNode] = useState<{
    label: string;
    sub: string;
  } | null>(null);

  const services = healthData?.services || [];
  const agentCount = agentsData?.agents.length || 0;
  const activeCount = agentsData?.agents.filter((a: { status: string }) => a.status === "active").length || 0;
  const memoryCount = Array.isArray(memoryData?.claude) ? memoryData.claude.length : 0;
  const knowledgeCount = knowledgeData?.totalDocs || 0;
  const nodeActivity = activityData?.nodeActivity || {};
  const events = activityData?.events || [];
  const registeredAgents = (agentsData?.agents || []).map((a) => ({
    id: a.id,
    name: a.name,
    status: a.status,
    latencyMs: a.latencyMs ?? null,
    location: a.location ?? "local",
    protocol: a.protocol,
    platform: a.platform,
    metadata: a.metadata,
    capabilities: a.capabilities,
    currentTask: a.currentTask,
  }));
  const localActiveCount = agentsData?.agents.filter((a: { status: string }) => a.status === "active").length || 0;
  const localTotalCount = agentsData?.agents.length || 0;
  const skillCount = skillsData?.totalSkills ?? 0;
  const coverageGapsCount = skillsData?.coverageGaps?.length ?? 0;
  const topFailureAgent = Object.entries(skillsData?.failuresByAgent ?? {}).sort((a, b) => (b[1] as number) - (a[1] as number))[0]?.[0] ?? null;
  const toolCapabilityCount = toolAttentionData?.summary.totalCapabilities ?? 0;
  const toolWorkspaceCount = toolAttentionData?.summary.workspaces ?? 0;

  function handleNodeClick(nodeId: string, nodeLabel: string, nodeIcon: string, nodeStats: Record<string, string | number>) {
    setSelectedNode(prev => prev?.id === nodeId ? null : { id: nodeId, label: nodeLabel, icon: nodeIcon, stats: nodeStats });
  }

  return (
    <div className="space-y-4">
      {/* Page header — NOC style */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 18 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.14em", color: NOC.terra, textTransform: "uppercase", fontFamily: NOC_FONT_BODY }}>
            Workflow Map
          </div>
          <h1 style={{ margin: "4px 0 2px", fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em", color: NOC.ink, fontFamily: NOC_FONT_BODY }}>
            How work actually flows
          </h1>
          <p style={{ fontSize: 13.5, color: NOC.muted, fontFamily: NOC_FONT_BODY }}>
            Sources arrive, MemroOS assembles memory + skills into a context pack, agents act, outcomes loop back as new memory. Edge thickness = live throughput.
          </p>
        </div>
        <button
          onClick={() => setShowFlow((v) => !v)}
          style={{
            background: showFlow ? NOC.paper : NOC.ink,
            color: showFlow ? NOC.ink : NOC.cream,
            border: `1px solid ${showFlow ? NOC.ruleStrong : NOC.ink}`,
            padding: "6px 14px",
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            fontFamily: NOC_FONT_BODY,
            cursor: "pointer",
          }}
        >
          {showFlow ? "Topology view" : "Open in Flow"}
        </button>
      </div>

      {/* Primary view: topology (default) or ReactFlow (toggle) */}
      {!showFlow ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 14 }}>
          <TopologyCanvas
            selectedId={topoSelectedId}
            onSelect={setTopoSelectedId}
            onSelectNode={setTopoSelectedNode}
          />
          <NodeDetailRail nodeId={topoSelectedId} node={topoSelectedNode} />
        </div>
      ) : (
        <div className="relative">
          <ReactFlowCanvas
            services={services}
            agentCount={agentCount}
            activeCount={activeCount}
            memoryCount={memoryCount}
            knowledgeCount={knowledgeCount}
            skillCount={skillCount}
            coverageGapsCount={coverageGapsCount}
            toolCapabilityCount={toolCapabilityCount}
            toolWorkspaceCount={toolWorkspaceCount}
            topFailureAgent={topFailureAgent}
            nodeActivity={nodeActivity}
            highlightedNode={hoveredNode || selectedNode?.id}
            registeredAgents={registeredAgents}
            localActiveCount={localActiveCount}
            localTotalCount={localTotalCount}
            onNodeClick={handleNodeClick}
          />
          <NodeDetailPanel
            nodeId={selectedNode?.id || null}
            nodeLabel={selectedNode?.label || ""}
            nodeIcon={selectedNode?.icon || ""}
            nodeStats={selectedNode?.stats || {}}
            events={events}
            onClose={() => setSelectedNode(null)}
            paperclipFleet={paperclipFleet ?? null}
            paperclipLoading={paperclipLoading}
            registeredAgents={registeredAgents}
          />
        </div>
      )}

      <VoicePanel />

      <div style={{ background: NOC.paper, border: `1px solid ${NOC.rule}`, borderRadius: 8, padding: "12px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: NOC.muted, fontFamily: NOC_FONT_MONO, textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Live Activity
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: NOC.success }} />
            <span style={{ fontSize: 11, color: NOC.soft, fontFamily: NOC_FONT_MONO }}>polling every 15s</span>
          </div>
        </div>
        <ActivityFeed events={events} onNodeHover={setHoveredNode} highlightedNode={hoveredNode} />
      </div>

      <div style={{ display: "flex", gap: 24, fontSize: 11.5, color: NOC.soft, fontFamily: NOC_FONT_MONO }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ height: 8, width: 24, borderRadius: 4, background: NOC.cold }} /> Source feeds</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ height: 8, width: 24, borderRadius: 4, background: NOC.ink }} /> Context assembly</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ height: 8, width: 24, borderRadius: 4, background: NOC.terra }} /> Pack delivery</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ height: 8, width: 24, borderRadius: 4, background: NOC.success }} /> Outcomes</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ height: 8, width: 24, borderRadius: 4, background: NOC.info }} /> Memory loop</div>
      </div>
    </div>
  );
}

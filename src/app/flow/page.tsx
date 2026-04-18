"use client";

import { useState } from "react";
import { useHealth, useAgents, useKnowledge, useMemory, useActivity, useRemoteAgents, useSkills, usePaperclipFleet } from "@/lib/api-client";
import { ReactFlowCanvas } from "@/components/flow/react-flow-canvas";
import { ActivityFeed } from "@/components/flow/activity-feed";
import { NodeDetailPanel } from "@/components/flow/node-detail-panel";
import { VoicePanel } from "@/components/voice/VoicePanel";

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
  const { data: remoteData } = useRemoteAgents();
  const { data: skillsData } = useSkills();
  const { data: paperclipFleet, isLoading: paperclipLoading } = usePaperclipFleet();
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const services = healthData?.services || [];
  const agentCount = agentsData?.agents.length || 0;
  const activeCount = agentsData?.agents.filter((a: { status: string }) => a.status === "active").length || 0;
  const memoryCount = Array.isArray(memoryData?.claude) ? memoryData.claude.length : 0;
  const knowledgeCount = knowledgeData?.totalDocs || 0;
  const nodeActivity = activityData?.nodeActivity || {};
  const events = activityData?.events || [];
  const remoteAgents = (remoteData?.agents || []).map((a) => ({
    id: a.id, name: a.name, status: a.status, latencyMs: a.latencyMs, location: a.location,
  }));
  const localActiveCount = agentsData?.agents.filter((a: { status: string }) => a.status === "active").length || 0;
  const localTotalCount = agentsData?.agents.length || 0;
  const skillCount = skillsData?.totalSkills ?? 0;
  const coverageGapsCount = skillsData?.coverageGaps?.length ?? 0;
  const topFailureAgent = Object.entries(skillsData?.failuresByAgent ?? {}).sort((a, b) => (b[1] as number) - (a[1] as number))[0]?.[0] ?? null;

  function handleNodeClick(nodeId: string, nodeLabel: string, nodeIcon: string, nodeStats: Record<string, string | number>) {
    setSelectedNode(prev => prev?.id === nodeId ? null : { id: nodeId, label: nodeLabel, icon: nodeIcon, stats: nodeStats });
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-amber-500">The Flow</h1>
        <p className="text-sm text-slate-400">Live system — drag nodes, zoom, click to drill down</p>
      </div>

      <div className="relative">
        <ReactFlowCanvas
          services={services}
          agentCount={agentCount}
          activeCount={activeCount}
          memoryCount={memoryCount}
          knowledgeCount={knowledgeCount}
          skillCount={skillCount}
          coverageGapsCount={coverageGapsCount}
          topFailureAgent={topFailureAgent}
          nodeActivity={nodeActivity}
          highlightedNode={hoveredNode || selectedNode?.id}
          remoteAgents={remoteAgents}
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
        />
      </div>

      <VoicePanel />

      <div className="rounded-xl border border-slate-800 bg-slate-900/30 px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-slate-500">Live Activity</p>
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs text-slate-600">polling every 15s</span>
          </div>
        </div>
        <ActivityFeed events={events} onNodeHover={setHoveredNode} highlightedNode={hoveredNode} />
      </div>

      <div className="flex gap-6 text-xs text-slate-500">
        <div className="flex items-center gap-1.5"><div className="h-2 w-6 rounded-full bg-amber-500" /> Request</div>
        <div className="flex items-center gap-1.5"><div className="h-2 w-6 rounded-full bg-emerald-500" /> Knowledge</div>
        <div className="flex items-center gap-1.5"><div className="h-2 w-6 rounded-full bg-sky-500" /> Memory</div>
        <div className="flex items-center gap-1.5"><div className="h-2 w-6 rounded-full bg-purple-500" /> APO</div>
      </div>
    </div>
  );
}

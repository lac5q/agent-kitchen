"use client";

import { useHealth, useAgents, useKnowledge, useMemory, useActivity } from "@/lib/api-client";
import { FlowCanvas } from "@/components/flow/flow-canvas";
import { ActivityFeed } from "@/components/flow/activity-feed";

export default function FlowPage() {
  const { data: healthData } = useHealth();
  const { data: agentsData } = useAgents();
  const { data: knowledgeData } = useKnowledge();
  const { data: memoryData } = useMemory("claude");
  const { data: activityData } = useActivity();

  const services = healthData?.services || [];
  const agentCount = agentsData?.agents.length || 0;
  const activeCount = agentsData?.agents.filter((a: { status: string }) => a.status === "active").length || 0;
  const memoryCount = Array.isArray(memoryData?.claude) ? memoryData.claude.length : 0;
  const knowledgeCount = knowledgeData?.totalDocs || 0;
  const nodeActivity = activityData?.nodeActivity || {};
  const events = activityData?.events || [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-amber-500">The Flow</h1>
        <p className="text-sm text-slate-400">Live system activity — Knowledge Restaurant in motion</p>
      </div>

      <FlowCanvas
        services={services}
        agentCount={agentCount}
        activeCount={activeCount}
        memoryCount={memoryCount}
        knowledgeCount={knowledgeCount}
        skillCount={405}
        nodeActivity={nodeActivity}
      />

      {/* Live event feed */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/30 px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-slate-500">Live Activity</p>
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs text-slate-600">polling every 15s</span>
          </div>
        </div>
        <ActivityFeed events={events} />
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

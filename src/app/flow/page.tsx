"use client";

import { useHealth, useAgents, useKnowledge, useMemory } from "@/lib/api-client";
import { FlowCanvas } from "@/components/flow/flow-canvas";

const LEGEND = [
  { color: "#f59e0b", label: "Request" },
  { color: "#10b981", label: "Knowledge" },
  { color: "#0ea5e9", label: "Memory" },
];

export default function FlowPage() {
  const { data: healthData } = useHealth();
  const { data: agentsData } = useAgents();
  const { data: knowledgeData } = useKnowledge();
  const { data: memoryData } = useMemory();

  const services = healthData?.services ?? [];
  const agentCount = agentsData?.agents?.length ?? 0;
  const activeCount = agentsData?.agents?.filter((a: { status: string }) => a.status === "active").length ?? 0;
  const knowledgeCount = knowledgeData?.totalDocs ?? 0;

  // Count memory entries from claude source
  const claudeMemories = memoryData?.claude ?? [];
  const memoryCount = Array.isArray(claudeMemories) ? claudeMemories.length : 0;

  // Skill count: sum of docs in "shared" or skill-related collections
  const skillCount = knowledgeData?.collections?.filter(
    (c) => c.category === "agents" || c.name.toLowerCase().includes("skill")
  ).reduce((acc, c) => acc + c.docCount, 0) ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-amber-500">The Flow</h1>
        <p className="text-sm text-slate-400">
          Animated architecture of the Knowledge Restaurant system
        </p>
      </div>

      {/* Canvas */}
      <FlowCanvas
        services={services}
        agentCount={agentCount}
        activeCount={activeCount}
        memoryCount={memoryCount}
        knowledgeCount={knowledgeCount}
        skillCount={skillCount}
      />

      {/* Legend */}
      <div className="flex items-center gap-6 px-2">
        {LEGEND.map(({ color, label }) => (
          <div key={label} className="flex items-center gap-2">
            <span
              className="inline-block h-0.5 w-8 rounded"
              style={{ backgroundColor: color }}
            />
            <span className="text-xs text-slate-400">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

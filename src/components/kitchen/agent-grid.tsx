"use client";

import { useState } from "react";
import { AgentCard } from "./agent-card";
import { AgentDrawer } from "./agent-drawer";
import type { Agent } from "@/types";

interface AgentGridProps {
  agents: Agent[];
}

export function AgentGrid({ agents }: AgentGridProps) {
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  function handleAgentClick(agent: Agent) {
    setSelectedAgent(agent);
    setDrawerOpen(true);
  }

  function handleDrawerOpenChange(open: boolean) {
    setDrawerOpen(open);
    if (!open) setSelectedAgent(null);
  }

  if (agents.length === 0) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500 text-sm">
        No agents found.
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {agents.map((agent) => (
          <AgentCard key={agent.id} agent={agent} onClick={handleAgentClick} />
        ))}
      </div>
      <AgentDrawer
        agent={selectedAgent}
        open={drawerOpen}
        onOpenChange={handleDrawerOpenChange}
      />
    </>
  );
}

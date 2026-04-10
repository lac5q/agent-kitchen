"use client";

import { useState } from "react";
import { AgentCard } from "./agent-card";
import { AgentDrawer } from "./agent-drawer";
import type { Agent } from "@/types";

interface AgentGridProps {
  agenticAgents: Agent[];
  devToolAgents: Agent[];
}

export function AgentGrid({ agenticAgents, devToolAgents }: AgentGridProps) {
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

  return (
    <>
      {/* Agentic Agents */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
            Agentic Agents
          </h2>
          <span className="text-xs text-slate-600">{agenticAgents.length}</span>
        </div>
        {agenticAgents.length === 0 ? (
          <p className="text-sm text-slate-500 py-4">No agents found.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {agenticAgents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} onClick={handleAgentClick} />
            ))}
          </div>
        )}
      </section>

      {/* Dev Tools */}
      <section className="mt-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="h-2 w-2 rounded-full bg-blue-500" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-blue-400">
            Dev Tools
          </h2>
          <span className="text-xs text-slate-600">{devToolAgents.length}</span>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {devToolAgents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} onClick={handleAgentClick} />
          ))}
        </div>
      </section>

      <AgentDrawer
        agent={selectedAgent}
        open={drawerOpen}
        onOpenChange={handleDrawerOpenChange}
      />
    </>
  );
}

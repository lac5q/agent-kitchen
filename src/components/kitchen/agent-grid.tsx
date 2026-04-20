"use client";

import { useState } from "react";
import { AgentCard } from "./agent-card";
import { AgentDrawer } from "./agent-drawer";
import type { Agent } from "@/types";

export interface AgentSection {
  title: string;
  agents: Agent[];
}

interface AgentGridProps {
  agents?: Agent[];
  sections?: AgentSection[];
}

export function AgentGrid({ agents, sections }: AgentGridProps) {
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

  // Flat agents mode
  if (agents !== undefined) {
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

  // Sections mode
  if (!sections || sections.length === 0) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500 text-sm">
        No agents found.
      </div>
    );
  }

  return (
    <>
      {sections.map((section) => (
        <div key={section.title} className="mb-8">
          <h2 className="text-lg font-semibold text-slate-300 mb-4">{section.title}</h2>
          {section.agents.length === 0 ? (
            <p className="text-slate-600 text-sm">No agents in this group</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {section.agents.map((agent) => (
                <AgentCard key={agent.id} agent={agent} onClick={handleAgentClick} />
              ))}
            </div>
          )}
        </div>
      ))}
      <AgentDrawer
        agent={selectedAgent}
        open={drawerOpen}
        onOpenChange={handleDrawerOpenChange}
      />
    </>
  );
}

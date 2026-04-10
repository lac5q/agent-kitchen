"use client";

import { useState } from "react";
import { AgentCard } from "./agent-card";
import { AgentDrawer } from "./agent-drawer";
import type { Agent } from "@/types";

interface AgentGridProps {
  agenticAgents: Agent[];
  devToolAgents: Agent[];
}

function SectionHeader({
  label,
  count,
  dotColor,
  textColor,
  open,
  onToggle,
}: {
  label: string;
  count: number;
  dotColor: string;
  textColor: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center gap-2 mb-3 w-full text-left group"
    >
      <span className={`h-2 w-2 rounded-full ${dotColor}`} />
      <h2 className={`text-xs font-semibold uppercase tracking-wider ${textColor}`}>{label}</h2>
      <span className="text-xs text-slate-600">{count}</span>
      <span className={`ml-auto text-slate-500 transition-transform duration-200 ${open ? "" : "-rotate-90"}`}>
        ▾
      </span>
    </button>
  );
}

const STATUS_ORDER: Record<string, number> = { active: 0, idle: 1, dormant: 2, error: 0 };
function sortByStatus(agents: Agent[]) {
  return [...agents].sort((a, b) => (STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3));
}

export function AgentGrid({ agenticAgents, devToolAgents }: AgentGridProps) {
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [devToolsOpen, setDevToolsOpen] = useState(true);
  const [agenticOpen, setAgenticOpen] = useState(true);

  const sortedDevTools = sortByStatus(devToolAgents);
  const sortedAgentic = sortByStatus(agenticAgents);

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
      {/* Dev Tools — top */}
      <section>
        <SectionHeader
          label="Dev Tools"
          count={devToolAgents.length}
          dotColor="bg-blue-500"
          textColor="text-blue-400"
          open={devToolsOpen}
          onToggle={() => setDevToolsOpen(o => !o)}
        />
        {devToolsOpen && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {sortedDevTools.map((agent) => (
              <AgentCard key={agent.id} agent={agent} onClick={handleAgentClick} />
            ))}
          </div>
        )}
      </section>

      {/* Agentic Agents — below */}
      <section className="mt-6">
        <SectionHeader
          label="Agentic Agents"
          count={agenticAgents.length}
          dotColor="bg-emerald-500"
          textColor="text-emerald-400"
          open={agenticOpen}
          onToggle={() => setAgenticOpen(o => !o)}
        />
        {agenticOpen && (
          agenticAgents.length === 0 ? (
            <p className="text-sm text-slate-500 py-4">No agents found.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {sortedAgentic.map((agent) => (
                <AgentCard key={agent.id} agent={agent} onClick={handleAgentClick} />
              ))}
            </div>
          )
        )}
      </section>

      <AgentDrawer
        agent={selectedAgent}
        open={drawerOpen}
        onOpenChange={handleDrawerOpenChange}
      />
    </>
  );
}

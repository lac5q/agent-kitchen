"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PLATFORM_LABELS, STATUS_COLORS } from "@/lib/ui-constants";
import type { RegisteredAgent } from "@/types";

interface AgentRegistryTableProps {
  agents: RegisteredAgent[];
  onSelect: (agent: RegisteredAgent) => void;
  onDeregister: (agentId: string) => void;
  isDeregistering?: boolean;
}

function formatHeartbeat(value: string | null): string {
  if (!value) return "never";
  return new Date(value).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function a2aMetadata(agent: RegisteredAgent): Record<string, unknown> {
  const metadata = agent.metadata.a2a;
  return isRecord(metadata) ? metadata : {};
}

function isAdkAgent(agent: RegisteredAgent): boolean {
  return a2aMetadata(agent).source === "adk";
}

export function AgentRegistryTable({
  agents,
  onSelect,
  onDeregister,
  isDeregistering = false,
}: AgentRegistryTableProps) {
  if (agents.length === 0) {
    return (
      <div className="border border-stone-200 bg-white/90 px-4 py-10 text-center text-sm text-stone-500">
        No registered agents match this view.
      </div>
    );
  }

  return (
    <div className="overflow-hidden border border-stone-200 bg-white/90">
      <div className="grid grid-cols-[1.2fr_0.7fr_0.7fr_0.7fr_1fr_1fr_0.6fr] border-b border-stone-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
        <span>Agent</span>
        <span>Protocol</span>
        <span>Platform</span>
        <span>Status</span>
        <span>Last Heartbeat</span>
        <span>Capabilities</span>
        <span className="text-right">Action</span>
      </div>
      {agents.map((agent) => (
        <div
          key={agent.id}
          className="grid grid-cols-[1.2fr_0.7fr_0.7fr_0.7fr_1fr_1fr_0.6fr] items-center border-b border-stone-200 px-3 py-3 text-sm last:border-b-0 hover:bg-stone-100"
        >
          <button
            className="min-w-0 text-left"
            onClick={() => onSelect(agent)}
          >
            <span className="block truncate font-medium text-stone-950">{agent.name}</span>
            <span className="block truncate text-xs text-stone-500">{agent.role}</span>
          </button>
          <div className="flex flex-wrap gap-1">
            {agent.protocol === "a2a" ? (
              <Badge variant="outline" className="border-sky-700 text-sky-300">A2A</Badge>
            ) : (
              <span className="text-stone-600">{agent.protocol}</span>
            )}
            {isAdkAgent(agent) && (
              <Badge variant="outline" className="border-sky-700 text-sky-300">ADK</Badge>
            )}
          </div>
          <span className="text-stone-600">{PLATFORM_LABELS[agent.platform] ?? agent.platform}</span>
          <span style={{ color: STATUS_COLORS[agent.status] }}>{agent.status}</span>
          <span className="text-xs text-stone-500">{formatHeartbeat(agent.lastHeartbeat)}</span>
          <div className="flex min-w-0 flex-wrap gap-1">
            {agent.capabilities.slice(0, 2).map((capability) => (
              <Badge key={capability.id} variant="outline" className="border-stone-300 text-stone-600">
                {capability.name}
              </Badge>
            ))}
            {agent.capabilities.length > 2 && (
              <Badge variant="outline" className="border-stone-300 text-stone-500">
                +{agent.capabilities.length - 2}
              </Badge>
            )}
          </div>
          <div className="flex justify-end">
            <Button
              variant="destructive"
              size="sm"
              disabled={isDeregistering}
              onClick={() => onDeregister(agent.id)}
            >
              Deregister
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

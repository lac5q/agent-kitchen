"use client";

import { useState } from "react";

import { useUpdateAgentDetailsMutation } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AgentLivenessBadge } from "@/components/agents/agent-liveness-badge";
import { PLATFORM_LABELS, STATUS_COLORS } from "@/lib/ui-constants";
import type { RegisteredAgent } from "@/types";
import type { LivenessObservation } from "@/lib/agent-liveness";

export interface RegistryAgentRow extends RegisteredAgent {
  liveness?: LivenessObservation;
}

interface AgentRegistryTableProps {
  agents: RegistryAgentRow[];
  onSelect: (agent: RegistryAgentRow) => void;
  onDeregister: (agentId: string) => void;
  /** Fired after a successful rename so the parent can refetch. */
  onAgentUpdated?: (agent: RegisteredAgent) => void;
  isDeregistering?: boolean;
  emptyTitle?: string;
  emptyReason?: string;
}

/**
 * Inline rename for the agent's display fields.
 *
 * Names are auto-detected from the host (`scripts/sync-host-agents.sh`), which
 * makes them accurate but not always useful — "Claude Code" says what the
 * harness is, not what this instance does. Only name and description are
 * editable: host, port, platform and protocol describe where the agent
 * physically is and stay derived, so the registry can never be hand-edited
 * into disagreeing with the machine. The sync script omits name/role from its
 * upsert, so a rename survives re-detection.
 */
function InlineAgentEditor({
  agent,
  onDone,
  onSaved,
}: {
  agent: RegisteredAgent;
  onDone: () => void;
  onSaved?: (agent: RegisteredAgent) => void;
}) {
  const [name, setName] = useState(agent.name);
  const [role, setRole] = useState(agent.role);
  const [error, setError] = useState<string | null>(null);
  const mutation = useUpdateAgentDetailsMutation();
  const saving = mutation.isPending;

  function save() {
    setError(null);
    mutation.mutate(
      { agentId: agent.id, name: name.trim(), role: role.trim() },
      {
        onSuccess: (result) => {
          onSaved?.(result.agent);
          onDone();
        },
        onError: (e: unknown) =>
          setError(e instanceof Error ? e.message : "Save failed"),
      }
    );
  }

  const invalid = !name.trim() || !role.trim();

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <input
        aria-label="Agent name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="border border-stone-300 px-1 py-0.5 text-sm font-medium text-stone-950"
      />
      <input
        aria-label="Agent description"
        value={role}
        onChange={(e) => setRole(e.target.value)}
        className="border border-stone-300 px-1 py-0.5 text-xs text-stone-600"
      />
      {error && <span className="text-xs text-red-700">{error}</span>}
      <div className="flex gap-1">
        <Button size="sm" disabled={saving || invalid} onClick={save}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button size="sm" variant="outline" disabled={saving} onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
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
  onAgentUpdated,
  isDeregistering = false,
  emptyTitle = "No registered agents match this view.",
  emptyReason,
}: AgentRegistryTableProps) {
  const [editingId, setEditingId] = useState<string | null>(null);

  if (agents.length === 0) {
    return (
      <div
        className="border border-stone-200 bg-white/90 px-4 py-10 text-center text-sm text-stone-500"
        data-status-block="empty-agents"
      >
        <p className="font-medium text-stone-700">{emptyTitle}</p>
        {emptyReason ? <p className="mt-1 text-xs text-stone-500">{emptyReason}</p> : null}
      </div>
    );
  }

  return (
    <div className="overflow-hidden border border-stone-200 bg-white/90">
      <div className="grid grid-cols-[1.2fr_0.7fr_0.7fr_0.9fr_1fr_1fr_0.7fr_0.6fr] border-b border-stone-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
        <span>Agent</span>
        <span>Protocol</span>
        <span>Platform</span>
        <span>Status</span>
        <span>Liveness</span>
        <span>Last Heartbeat</span>
        <span>Capabilities</span>
        <span className="text-right">Action</span>
      </div>
      {agents.map((agent) => (
        <div
          key={agent.id}
          className="grid grid-cols-[1.2fr_0.7fr_0.7fr_0.9fr_1fr_1fr_0.7fr_0.6fr] items-center border-b border-stone-200 px-3 py-3 text-sm last:border-b-0 hover:bg-stone-100"
          data-agent-id={agent.id}
          data-agent-protocol={agent.protocol}
          data-agent-status={agent.status}
          data-agent-liveness={agent.liveness?.state ?? "unknown"}
        >
          {editingId === agent.id ? (
            <InlineAgentEditor
              agent={agent}
              onDone={() => setEditingId(null)}
              onSaved={onAgentUpdated}
            />
          ) : (
            <button
              className="min-w-0 text-left"
              onClick={() => onSelect(agent)}
            >
              <span className="block truncate font-medium text-stone-950">{agent.name}</span>
              <span className="block truncate text-xs text-stone-500">{agent.role}</span>
            </button>
          )}
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
          <div className="flex">
            {agent.liveness ? <AgentLivenessBadge observation={agent.liveness} /> : <span className="text-xs text-stone-500">unknown</span>}
          </div>
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
          <div className="flex justify-end gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={isDeregistering || editingId === agent.id}
              onClick={() => setEditingId(agent.id)}
              data-testid={`edit-agent-${agent.id}`}
            >
              Edit
            </Button>
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

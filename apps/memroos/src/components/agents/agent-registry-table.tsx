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
  /**
   * Resolved server-side by /api/agents so the row can name a person rather than
   * an opaque user id — and so a non-admin viewer can see who owns a shared
   * agent without the admin-only /api/users route.
   */
  owner?: { ownerId: string; email: string; displayName: string } | null;
  isOwnedByViewer?: boolean;
}

interface AgentRegistryTableProps {
  agents: RegistryAgentRow[];
  onSelect: (agent: RegistryAgentRow) => void;
  onDeregister: (agentId: string) => void;
  /** Permanent removal. Distinct from deregister, which keeps the row. */
  onDelete?: (agentId: string) => void;
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

/**
 * One definition for the header and the rows, so they cannot drift apart.
 *
 * Every track has a `minmax()` floor rather than a bare `fr`. Bare fractions let
 * a column shrink below the width of its content, and the content then paints
 * over its neighbour — which is how capability badges ended up drawn on top of
 * the Action buttons. A floor makes the table scroll instead of overlap.
 */
const COLUMNS =
  "lg:grid-cols-[minmax(11rem,1.3fr)_minmax(8rem,1fr)_minmax(5rem,0.6fr)_minmax(6rem,0.7fr)_minmax(5rem,0.6fr)_minmax(6rem,0.8fr)_minmax(8rem,0.9fr)_minmax(7rem,0.9fr)_minmax(9rem,auto)]";

/**
 * A cell that names itself below the table breakpoint.
 *
 * The card layout has no column headers, so an unlabelled value like "dormant"
 * or "never" is unreadable out of context.
 */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-baseline gap-2 lg:block">
      <span className="w-28 shrink-0 text-xs font-medium uppercase tracking-wide text-stone-500 lg:hidden">
        {label}
      </span>
      {children}
    </div>
  );
}

export function AgentRegistryTable({
  agents,
  onSelect,
  onDeregister,
  onDelete,
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
      {/* Column headers only exist in the table layout. Below lg each row is a
          card and carries its own inline labels, so a separate header would be
          meaningless there. */}
      <div
        className={`hidden border-b border-stone-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-stone-500 lg:grid ${COLUMNS}`}
      >
        <span>Agent</span>
        <span>Owner</span>
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
          className={`flex flex-col gap-3 border-b border-stone-200 px-3 py-3 text-sm last:border-b-0 hover:bg-stone-100 lg:grid lg:items-center lg:gap-x-3 lg:gap-y-0 ${COLUMNS}`}
          data-agent-id={agent.id}
          data-agent-protocol={agent.protocol}
          data-agent-status={agent.status}
          data-agent-liveness={agent.liveness?.state ?? "unknown"}
        >
          {editingId === agent.id ? (
            // The editor needs room for two inputs and two buttons; squeezing it
            // into one column is what made it unusable at narrow widths.
            <div className="lg:col-span-9">
              <InlineAgentEditor
                agent={agent}
                onDone={() => setEditingId(null)}
                onSaved={onAgentUpdated}
              />
            </div>
          ) : (
            <>
              <button className="min-w-0 text-left" onClick={() => onSelect(agent)}>
                <span className="block truncate font-medium text-stone-950">{agent.name}</span>
                <span className="block truncate text-xs text-stone-500">{agent.role}</span>
              </button>

              {/* Ownership. The owner's name is always shown rather than "You",
                  because a column reading "You" on every row tells the viewer
                  nothing about how agents are distributed across people. Who the
                  viewer is stays visible as a secondary marker. */}
              <Field label="Owner">
                {agent.owner ? (
                  <span className="min-w-0">
                    <span className="block truncate text-stone-700" title={agent.owner.email}>
                      {agent.owner.displayName}
                      {agent.isOwnedByViewer && (
                        <span className="ml-1 text-[11px] font-medium text-stone-500">(you)</span>
                      )}
                    </span>
                    {agent.isShared && (
                      <span className="block text-[11px] font-medium text-sky-700">
                        Shared with everyone
                      </span>
                    )}
                  </span>
                ) : (
                  <span
                    className="text-xs font-medium text-amber-700"
                    title="No accountable human — admin-only until claimed"
                  >
                    Unowned
                  </span>
                )}
              </Field>

              <Field label="Protocol">
                <span className="flex min-w-0 flex-wrap gap-1">
                  {agent.protocol === "a2a" ? (
                    <Badge variant="outline" className="border-sky-700 text-sky-300">A2A</Badge>
                  ) : (
                    <span className="text-stone-600">{agent.protocol}</span>
                  )}
                  {isAdkAgent(agent) && (
                    <Badge variant="outline" className="border-sky-700 text-sky-300">ADK</Badge>
                  )}
                </span>
              </Field>

              <Field label="Platform">
                <span className="truncate text-stone-600">
                  {PLATFORM_LABELS[agent.platform] ?? agent.platform}
                </span>
              </Field>

              <Field label="Status">
                <span className="truncate" style={{ color: STATUS_COLORS[agent.status] }}>
                  {agent.status}
                </span>
              </Field>

              <Field label="Liveness">
                {agent.liveness ? (
                  <AgentLivenessBadge observation={agent.liveness} />
                ) : (
                  <span className="text-xs text-stone-500">unknown</span>
                )}
              </Field>

              <Field label="Last heartbeat">
                <span className="truncate text-xs text-stone-500">
                  {formatHeartbeat(agent.lastHeartbeat)}
                </span>
              </Field>

              {/* Capability names are unbounded ("Write Episodic Memory"), so the
                  badges must be allowed to shrink and clip. Without min-w-0 and a
                  truncating label they overflowed the column and drew on top of
                  the Action buttons. */}
              <Field label="Capabilities">
                <span className="flex min-w-0 flex-wrap gap-1 overflow-hidden">
                  {agent.capabilities.slice(0, 2).map((capability) => (
                    <Badge
                      key={capability.id}
                      variant="outline"
                      className="max-w-full truncate border-stone-300 text-stone-600"
                      title={capability.name}
                    >
                      {capability.name}
                    </Badge>
                  ))}
                  {agent.capabilities.length > 2 && (
                    <Badge variant="outline" className="border-stone-300 text-stone-500">
                      +{agent.capabilities.length - 2}
                    </Badge>
                  )}
                </span>
              </Field>

              <div className="flex flex-wrap gap-1 lg:justify-end">
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
                  variant="outline"
                  size="sm"
                  disabled={isDeregistering}
                  onClick={() => onDeregister(agent.id)}
                >
                  Deregister
                </Button>
                {onDelete && (
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={isDeregistering}
                    onClick={() => onDelete(agent.id)}
                  >
                    Delete
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

"use client";

import { useState } from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { AgentLivenessBadge } from "@/components/agents/agent-liveness-badge";
import { PLATFORM_LABELS } from "@/lib/ui-constants";
import type { RegisteredAgent } from "@/types";
import type { LivenessObservation } from "@/lib/agent-liveness";

/**
 * Inline editor for an agent's display fields.
 *
 * Only name / role / company are editable. Host, port, platform and protocol
 * describe where the agent physically is and stay derived — hand-editing those
 * would let the registry disagree with the machine, which is exactly the class
 * of bug this area has been fighting. `scripts/sync-host-agents.sh` re-detects
 * on every run and deliberately does not overwrite name/role, so a rename made
 * here survives the next sync.
 */
function AgentDetailsEditor({
  agent,
  onSaved,
}: {
  agent: RegisteredAgent;
  onSaved: (updated: RegisteredAgent) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(agent.name);
  const [role, setRole] = useState(agent.role);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed the form when the drawer switches to a different agent, or when a
  // sync brings in a new name/role. Done during render via a previous-value
  // tracker rather than in an effect: an effect re-seeds *after* painting the
  // stale values, which is both a visible flash and a cascading re-render.
  // This is React's documented "adjusting state when a prop changes" pattern.
  const seedKey = `${agent.id} ${agent.name} ${agent.role}`;
  const [seededFrom, setSeededFrom] = useState(seedKey);
  if (seededFrom !== seedKey) {
    setSeededFrom(seedKey);
    setName(agent.name);
    setRole(agent.role);
    setEditing(false);
    setError(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(agent.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), role: role.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      onSaved(body.agent as RegisteredAgent);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="self-start border border-stone-300 px-2 py-1 text-xs uppercase tracking-wide text-stone-600 hover:bg-stone-50"
        data-testid="edit-agent-details"
      >
        Edit name & description
      </button>
    );
  }

  const unchanged = name.trim() === agent.name && role.trim() === agent.role;
  const invalid = name.trim().length === 0 || role.trim().length === 0;

  return (
    <div className="flex flex-col gap-2 border border-stone-200 p-3">
      <label className="text-xs uppercase tracking-wide text-stone-500" htmlFor="agent-name">
        Name
      </label>
      <input
        id="agent-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="border border-stone-300 px-2 py-1 text-sm text-stone-900"
      />
      <label className="text-xs uppercase tracking-wide text-stone-500" htmlFor="agent-role">
        Description
      </label>
      <input
        id="agent-role"
        value={role}
        onChange={(e) => setRole(e.target.value)}
        className="border border-stone-300 px-2 py-1 text-sm text-stone-900"
      />
      {error && <p className="text-xs text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving || invalid || unchanged}
          className="border border-stone-800 bg-stone-900 px-3 py-1 text-xs uppercase tracking-wide text-white disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => {
            setName(agent.name);
            setRole(agent.role);
            setEditing(false);
            setError(null);
          }}
          disabled={saving}
          className="border border-stone-300 px-3 py-1 text-xs uppercase tracking-wide text-stone-600"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

interface AgentRegistryDrawerProps {
  agent: RegisteredAgent | null;
  liveness?: LivenessObservation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired after a successful rename so the parent list can refresh. */
  onAgentUpdated?: (agent: RegisteredAgent) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function a2aMetadata(agent: RegisteredAgent): Record<string, unknown> {
  const metadata = agent.metadata.a2a;
  return isRecord(metadata) ? metadata : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function stringList(value: unknown): string {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string").join(", ") : "unknown";
}

function redactUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    return rawUrl.replace(/\/\/[^/@\s]+@/, "//");
  }
}

function urlHost(rawUrl: unknown): string {
  if (typeof rawUrl !== "string") return "unknown";
  try {
    return new URL(redactUrl(rawUrl)).host;
  } catch {
    return redactUrl(rawUrl);
  }
}

function securitySummary(value: unknown): string {
  if (!isRecord(value)) return "unknown";
  const labels = Object.values(value)
    .filter(isRecord)
    .map((scheme) => {
      const type = stringValue(scheme.type) ?? "scheme";
      const detail = stringValue(scheme.scheme) ?? stringValue(scheme.in);
      return detail ? `${type} ${detail}` : type;
    });
  return labels.length > 0 ? labels.join(", ") : "unknown";
}

function sourceLabel(value: unknown): string {
  return value === "adk" ? "ADK" : stringValue(value)?.toUpperCase() ?? "A2A";
}

function streamingLabel(value: unknown): string {
  if (typeof value === "boolean") return value ? "supported" : "not declared";
  return "unknown";
}

function MetadataRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-1 text-xs uppercase tracking-wide text-stone-500">{label}</p>
      <p className="break-words text-stone-700">{value}</p>
    </div>
  );
}

export function AgentRegistryDrawer({ agent, liveness, open, onOpenChange, onAgentUpdated }: AgentRegistryDrawerProps) {
  // `local` exists so an in-drawer save shows immediately without waiting for
  // the parent to refetch. Synced from the prop during render rather than in an
  // effect, so switching agents never paints the previous one's details for a
  // frame before correcting itself.
  const [local, setLocal] = useState<RegisteredAgent | null>(agent);
  const [syncedFrom, setSyncedFrom] = useState(agent);
  if (syncedFrom !== agent) {
    setSyncedFrom(agent);
    setLocal(agent);
  }

  const shown = local ?? agent;
  if (!shown) return null;
  const a2a = a2aMetadata(shown);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="border-stone-200 bg-white text-stone-950 sm:max-w-md">
        <SheetHeader className="border-b border-stone-200 pb-4">
          <SheetTitle className="text-stone-950">{shown.name}</SheetTitle>
          <SheetDescription className="text-stone-500">{shown.role}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-5 p-4 text-sm">
          <AgentDetailsEditor
            agent={shown}
            onSaved={(updated) => {
              setLocal(updated);
              onAgentUpdated?.(updated);
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="border-stone-300 text-stone-600">{shown.protocol}</Badge>
            {shown.protocol === "a2a" && (
              <Badge variant="outline" className="border-sky-700 text-sky-300">A2A</Badge>
            )}
            {a2a.source === "adk" && (
              <Badge variant="outline" className="border-sky-700 text-sky-300">ADK</Badge>
            )}
            <Badge variant="outline" className="border-stone-300 text-stone-600">
              {PLATFORM_LABELS[shown.platform] ?? shown.platform}
            </Badge>
            <Badge variant="outline" className="border-stone-300 text-stone-600">{shown.status}</Badge>
            {liveness ? <AgentLivenessBadge observation={liveness} showObserved /> : null}
          </div>
          <div className="border border-stone-200 bg-white/90 p-3">
            <p className="mb-1 text-xs uppercase tracking-wide text-stone-500">Last heartbeat</p>
            <p className="text-stone-700">{shown.lastHeartbeat ?? "never"}</p>
            {liveness ? (
              <p className="mt-2 text-xs text-stone-500" data-liveness-source>
                source={liveness.source}
                {liveness.observedAt ? ` · observed at ${liveness.observedAt}` : ""}
                {liveness.freshnessMs !== null ? ` · age ${Math.round(liveness.freshnessMs / 1000)}s` : ""}
              </p>
            ) : null}
            {liveness ? (
              <p className="mt-1 text-xs text-stone-500" data-liveness-reason>{liveness.reason}</p>
            ) : null}
          </div>
          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-stone-500">Capabilities</p>
            <div className="flex flex-wrap gap-2">
              {shown.capabilities.length === 0 ? (
                <span className="text-stone-500">None declared</span>
              ) : (
                shown.capabilities.map((capability) => (
                  <Badge key={capability.id} variant="outline" className="border-stone-300 text-stone-600">
                    {capability.name}
                  </Badge>
                ))
              )}
            </div>
          </div>
          {shown.currentTask && (
            <div>
              <p className="mb-1 text-xs uppercase tracking-wide text-stone-500">Current task</p>
              <p className="text-stone-700">{shown.currentTask}</p>
            </div>
          )}
          {shown.protocol === "a2a" && (
            <div className="border border-stone-200 bg-white/90 p-3">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-sky-400">A2A connection</p>
              <div className="grid gap-3">
                <MetadataRow label="Endpoint host" value={urlHost(a2a.endpointUrl)} />
                <MetadataRow label="Card URL" value={redactUrl(String(a2a.cardUrl ?? "unknown"))} />
                <MetadataRow label="A2A version" value={stringValue(a2a.version) ?? "unknown"} />
                <MetadataRow label="Security scheme" value={securitySummary(a2a.securitySchemes)} />
                <MetadataRow label="Input modes" value={stringList(a2a.inputModes)} />
                <MetadataRow label="Output modes" value={stringList(a2a.outputModes)} />
                <MetadataRow label="Last validation" value={stringValue(a2a.lastFetchedAt) ?? "unknown"} />
                <MetadataRow label="Validation" value={stringValue(a2a.validationStatus) ?? "unknown"} />
                <MetadataRow label="Streaming" value={streamingLabel(a2a.streaming)} />
                <MetadataRow label="Source" value={sourceLabel(a2a.source)} />
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { PLATFORM_LABELS } from "@/lib/ui-constants";
import type { RegisteredAgent } from "@/types";

interface AgentRegistryDrawerProps {
  agent: RegisteredAgent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

export function AgentRegistryDrawer({ agent, open, onOpenChange }: AgentRegistryDrawerProps) {
  if (!agent) return null;
  const a2a = a2aMetadata(agent);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="border-stone-200 bg-white text-stone-950 sm:max-w-md">
        <SheetHeader className="border-b border-stone-200 pb-4">
          <SheetTitle className="text-stone-950">{agent.name}</SheetTitle>
          <SheetDescription className="text-stone-500">{agent.role}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-5 p-4 text-sm">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="border-stone-300 text-stone-600">{agent.protocol}</Badge>
            {agent.protocol === "a2a" && (
              <Badge variant="outline" className="border-sky-700 text-sky-300">A2A</Badge>
            )}
            {a2a.source === "adk" && (
              <Badge variant="outline" className="border-sky-700 text-sky-300">ADK</Badge>
            )}
            <Badge variant="outline" className="border-stone-300 text-stone-600">
              {PLATFORM_LABELS[agent.platform] ?? agent.platform}
            </Badge>
            <Badge variant="outline" className="border-stone-300 text-stone-600">{agent.status}</Badge>
          </div>
          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-stone-500">Last heartbeat</p>
            <p className="text-stone-700">{agent.lastHeartbeat ?? "never"}</p>
          </div>
          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-stone-500">Capabilities</p>
            <div className="flex flex-wrap gap-2">
              {agent.capabilities.length === 0 ? (
                <span className="text-stone-500">None declared</span>
              ) : (
                agent.capabilities.map((capability) => (
                  <Badge key={capability.id} variant="outline" className="border-stone-300 text-stone-600">
                    {capability.name}
                  </Badge>
                ))
              )}
            </div>
          </div>
          {agent.currentTask && (
            <div>
              <p className="mb-1 text-xs uppercase tracking-wide text-stone-500">Current task</p>
              <p className="text-stone-700">{agent.currentTask}</p>
            </div>
          )}
          {agent.protocol === "a2a" && (
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

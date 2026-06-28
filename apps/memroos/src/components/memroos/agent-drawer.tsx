"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { STATUS_COLORS, PLATFORM_LABELS } from "@/lib/ui-constants";
import type { Agent } from "@/types";

const STATUS_RING: Record<string, string> = {
  active: "ring-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.7)]",
  idle: "ring-amber-500",
  dormant: "ring-slate-500",
  error: "ring-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.7)]",
};

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "Never";
  return new Date(dateStr).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

interface AgentDrawerProps {
  agent: Agent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AgentDrawer({ agent, open, onOpenChange }: AgentDrawerProps) {
  if (!agent) return null;

  const ringClass = STATUS_RING[agent.status] ?? "ring-slate-500";
  const platformLabel = PLATFORM_LABELS[agent.platform] ?? agent.platform;
  const statusColor = STATUS_COLORS[agent.status] ?? "#64748b";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="border-stone-200 bg-white text-stone-900 w-80 sm:max-w-sm"
      >
        <SheetHeader className="pb-4 border-b border-stone-200">
          <div className="flex items-center gap-4">
            {/* Avatar with status ring */}
            <div
              className={`h-14 w-14 shrink-0 rounded-full ring-2 ${ringClass} flex items-center justify-center bg-stone-100 text-lg font-bold text-stone-800 uppercase`}
            >
              {agent.name.slice(0, 2)}
            </div>
            <div>
              <SheetTitle className="text-stone-900">{agent.name}</SheetTitle>
              <SheetDescription className="text-stone-500 text-xs mt-0.5">
                {agent.role}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="p-4 space-y-4">
          {/* Platform + Status */}
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-stone-300 text-stone-500 text-xs">
              {platformLabel}
            </Badge>
            <Badge
              variant="outline"
              className="border-stone-300 text-xs"
              style={{ color: statusColor, borderColor: statusColor + "55" }}
            >
              {agent.status}
            </Badge>
          </div>

          {/* Current Task */}
          <div>
            <p className="text-xs text-stone-500 uppercase tracking-wide mb-1">
              Current Task
            </p>
            <p className="text-sm text-stone-800">
              {agent.currentTask ?? (
                <span className="text-stone-500 italic">No active task</span>
              )}
            </p>
          </div>

          {/* Last Heartbeat */}
          <div>
            <p className="text-xs text-stone-500 uppercase tracking-wide mb-1">
              Last Heartbeat
            </p>
            <p className="text-sm text-stone-800">
              {formatDateTime(agent.lastHeartbeat)}
            </p>
          </div>

          {/* Stats */}
          {!agent.isRemote && (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-md border border-stone-200 bg-white/85 p-3">
                <p className="text-xs text-stone-500">Lessons</p>
                <p className="text-xl font-bold text-amber-500">
                  {agent.lessonsCount}
                </p>
              </div>
              <div className="rounded-md border border-stone-200 bg-white/85 p-3">
                <p className="text-xs text-stone-500">Today&apos;s Memories</p>
                <p className="text-xl font-bold text-sky-500">
                  {agent.todayMemoryCount}
                </p>
              </div>
            </div>
          )}

          {/* Remote Connection */}
          {agent.isRemote && (
            <>
              <Separator className="bg-stone-100" />
              <div>
                <p className="text-xs font-medium text-stone-500 mb-2">Remote Connection</p>
                <div className="space-y-1 text-sm text-stone-500">
                  <p><span className="text-stone-500">Location:</span> {agent.location}</p>
                  <p><span className="text-stone-500">Latency:</span> {agent.latencyMs ? `${agent.latencyMs}ms` : "N/A"}</p>
                  <p><span className="text-stone-500">Last seen:</span> {agent.lastHeartbeat ? new Date(agent.lastHeartbeat).toLocaleTimeString() : "Unreachable"}</p>
                </div>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

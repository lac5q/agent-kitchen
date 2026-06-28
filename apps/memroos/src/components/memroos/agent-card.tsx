import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { STATUS_COLORS, PLATFORM_LABELS } from "@/lib/ui-constants";
import type { Agent } from "@/types";

export function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return "never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const STATUS_RING: Record<string, string> = {
  active: "ring-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]",
  idle: "ring-amber-500",
  dormant: "ring-slate-500",
  error: "ring-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]",
};

const STATUS_DOT: Record<string, string> = {
  active: "bg-emerald-500",
  idle: "bg-amber-500",
  dormant: "bg-slate-500",
  error: "bg-rose-500",
};

interface AgentCardProps {
  agent: Agent;
  onClick: (agent: Agent) => void;
  harnessName?: string;
  childCount?: number;
}

export function AgentCard({ agent, onClick, harnessName, childCount = 0 }: AgentCardProps) {
  const ringClass = STATUS_RING[agent.status] ?? "ring-slate-500";
  const dotClass = STATUS_DOT[agent.status] ?? "bg-slate-500";
  const platformLabel = PLATFORM_LABELS[agent.platform] ?? agent.platform;
  const timeAgo = formatTimeAgo(agent.lastHeartbeat);
  const isSubagent = Boolean(agent.masterId);
  const isHarness = childCount > 0;

  return (
    <Card
      className={`cursor-pointer border bg-white/85 p-4 transition-colors hover:border-stone-300 hover:bg-stone-100 ${
        isSubagent
          ? "border-amber-700/50"
          : isHarness
            ? "border-sky-700/60 shadow-[0_0_18px_rgba(14,165,233,0.08)]"
            : "border-stone-200"
      }`}
      onClick={() => onClick(agent)}
    >
      <div className="flex items-start gap-3">
        {/* Status ring avatar */}
        <div
          className={`h-10 w-10 shrink-0 rounded-full ring-2 ${ringClass} flex items-center justify-center bg-stone-100 text-sm font-bold text-stone-800 uppercase`}
        >
          {agent.isRemote ? "🌐" : agent.name.slice(0, 2)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold text-stone-900 text-sm">
              {agent.name}
            </span>
            <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} />
          </div>
          <p className="text-xs text-stone-500 truncate">{agent.role}</p>

          {(harnessName || isHarness) && (
            <div className="mt-2 rounded-lg border border-stone-200 bg-white/90 px-2 py-1.5 text-xs">
              {isSubagent ? (
                <p className="truncate text-amber-300">
                  <span className="text-stone-500">Subagent of</span> {harnessName ?? agent.masterId}
                </p>
              ) : isHarness ? (
                <p className="truncate text-sky-300">
                  <span className="text-stone-500">Harness for</span> {childCount} subagent{childCount === 1 ? "" : "s"}
                </p>
              ) : (
                <p className="truncate text-stone-500">
                  <span className="text-stone-500">Harness</span> {harnessName}
                </p>
              )}
            </div>
          )}

          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-xs border-stone-300 text-stone-500">
              {platformLabel}
            </Badge>
            {isHarness && (
              <Badge variant="outline" className="text-xs border-sky-700 text-sky-300">
                harness
              </Badge>
            )}
            {isSubagent && (
              <Badge variant="outline" className="text-xs border-amber-700 text-amber-400">
                sub-agent
              </Badge>
            )}
            {agent.isRemote && (
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                agent.location === "tailscale"
                  ? "bg-sky-500/20 text-sky-400"
                  : "bg-orange-500/20 text-orange-400"
              }`}>
                {agent.location === "tailscale" ? "Tailscale" : "CF Tunnel"}
              </span>
            )}
            <span
              className="text-xs font-medium"
              style={{ color: STATUS_COLORS[agent.status] }}
            >
              {agent.status}
            </span>
          </div>

          {agent.currentTask && (
            <p className="mt-2 text-xs text-stone-500 truncate">
              <span className="text-amber-500">Task:</span> {agent.currentTask}
            </p>
          )}

          <div className="mt-2 flex items-center justify-between text-xs text-stone-500">
            <span>Heartbeat: {timeAgo}</span>
            <div className="flex items-center gap-2">
              {agent.isRemote && agent.latencyMs ? (
                <span className="text-sky-500">~{agent.latencyMs}ms</span>
              ) : (
                <>
                  <span>{agent.lessonsCount} lessons</span>
                  <span>{agent.todayMemoryCount} mem</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

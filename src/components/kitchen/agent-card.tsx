import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { STATUS_COLORS, PLATFORM_LABELS } from "@/lib/constants";
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
}

export function AgentCard({ agent, onClick }: AgentCardProps) {
  const ringClass = STATUS_RING[agent.status] ?? "ring-slate-500";
  const dotClass = STATUS_DOT[agent.status] ?? "bg-slate-500";
  const platformLabel = PLATFORM_LABELS[agent.platform] ?? agent.platform;
  const timeAgo = formatTimeAgo(agent.lastHeartbeat);

  return (
    <Card
      className="border-slate-800 bg-slate-900/50 p-4 cursor-pointer hover:border-slate-700 hover:bg-slate-800/60 transition-colors"
      onClick={() => onClick(agent)}
    >
      <div className="flex items-start gap-3">
        {/* Status ring avatar */}
        <div
          className={`h-10 w-10 shrink-0 rounded-full ring-2 ${ringClass} flex items-center justify-center bg-slate-800 text-sm font-bold text-slate-200 uppercase`}
        >
          {agent.isRemote ? "🌐" : agent.name.slice(0, 2)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold text-slate-100 text-sm">
              {agent.name}
            </span>
            <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} />
          </div>
          <p className="text-xs text-slate-400 truncate">{agent.role}</p>

          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-xs border-slate-700 text-slate-300">
              {platformLabel}
            </Badge>
            {agent.masterId && (
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
            <p className="mt-2 text-xs text-slate-400 truncate">
              <span className="text-amber-500">Task:</span> {agent.currentTask}
            </p>
          )}

          <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
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

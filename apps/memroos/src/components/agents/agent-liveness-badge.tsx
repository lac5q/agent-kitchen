"use client";

import type { LivenessObservation } from "@/lib/agent/liveness";

const STATE_TONE: Record<
  LivenessObservation["state"],
  { label: string; background: string; color: string; border: string }
> = {
  live: {
    label: "live",
    background: "rgba(16, 185, 129, 0.12)",
    color: "#10b981",
    border: "rgba(16, 185, 129, 0.4)",
  },
  stale: {
    label: "stale",
    background: "rgba(245, 158, 11, 0.12)",
    color: "#f59e0b",
    border: "rgba(245, 158, 11, 0.4)",
  },
  never: {
    label: "never",
    background: "rgba(244, 114, 182, 0.12)",
    color: "#f472b6",
    border: "rgba(244, 114, 182, 0.4)",
  },
  missing: {
    label: "missing",
    background: "rgba(148, 163, 184, 0.16)",
    color: "#94a3b8",
    border: "rgba(148, 163, 184, 0.4)",
  },
  error: {
    label: "error",
    background: "rgba(244, 63, 94, 0.16)",
    color: "#f43f5e",
    border: "rgba(244, 63, 94, 0.4)",
  },
};

function formatObserved(observedAt: string | null): string {
  if (!observedAt) return "never observed";
  try {
    return new Date(observedAt).toLocaleString();
  } catch {
    return observedAt;
  }
}

export interface AgentLivenessBadgeProps {
  observation: LivenessObservation;
  showObserved?: boolean;
}

export function AgentLivenessBadge({ observation, showObserved = false }: AgentLivenessBadgeProps) {
  const tone = STATE_TONE[observation.state];
  return (
    <span
      className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium"
      style={{ background: tone.background, color: tone.color, borderColor: tone.border }}
      data-state={observation.state}
      data-observed-at={observation.observedAt ?? ""}
      title={`${observation.reason} (source=${observation.source}${observation.freshnessMs !== null ? `, age=${Math.round(observation.freshnessMs / 1000)}s` : ""})`}
    >
      {tone.label}
      {showObserved ? (
        <span style={{ opacity: 0.75 }}>· {formatObserved(observation.observedAt)}</span>
      ) : null}
    </span>
  );
}

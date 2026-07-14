"use client";

import { useState } from "react";
import {
  useModelRoutingDashboard,
  useModelRoutingEvals,
  useModelRoutingRecommendations,
} from "@/lib/api-client";

const TASK_TYPES = ["engineering", "product", "sales", "support"] as const;
const STRATEGIES = ["balanced", "quality", "cost", "latency"] as const;

function percent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "N/A";
  return `${Math.round(value * 100)}%`;
}

function score(value: number | null | undefined): string {
  if (value === null || value === undefined) return "N/A";
  return value.toFixed(2);
}

export function ModelRoutingPanel() {
  const [taskType, setTaskType] = useState<(typeof TASK_TYPES)[number]>("engineering");
  const [strategy, setStrategy] = useState<(typeof STRATEGIES)[number]>("balanced");
  const dashboard = useModelRoutingDashboard(8);
  const recommendations = useModelRoutingRecommendations(taskType, strategy);
  const evals = useModelRoutingEvals();

  const summary = dashboard.data?.summary;
  const recs = recommendations.data?.recommendations ?? [];
  const dashboardLive =
    !dashboard.isLoading && !dashboard.isError && dashboard.data !== undefined;
  const dash = "—";

  return (
    <div className="rounded-xl border border-stone-200 bg-white/90 p-5">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div>
          <h3 className="text-lg font-semibold text-stone-700">Model Routing</h3>
          <p className="mt-1 text-xs text-stone-500">Telemetry, recommendations, and eval coverage</p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {TASK_TYPES.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTaskType(item)}
              className={`border px-2.5 py-1 text-xs ${taskType === item ? "border-amber-500 text-amber-300" : "border-stone-300 text-stone-500"}`}
            >
              {item}
            </button>
          ))}
          {STRATEGIES.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setStrategy(item)}
              className={`border px-2.5 py-1 text-xs ${strategy === item ? "border-sky-500 text-sky-300" : "border-stone-300 text-stone-500"}`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="border border-stone-200 bg-white p-3">
          <p className="text-xs text-stone-500">Runs</p>
          <p className="mt-1 text-2xl font-semibold text-stone-950">
            {dashboardLive && summary ? summary.totalRuns : dash}
          </p>
        </div>
        <div className="border border-stone-200 bg-white p-3">
          <p className="text-xs text-stone-500">Success</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-300">{percent(summary?.successRate)}</p>
        </div>
        <div className="border border-stone-200 bg-white p-3">
          <p className="text-xs text-stone-500">Quality</p>
          <p className="mt-1 text-2xl font-semibold text-sky-300">{score(summary?.averageQuality)}</p>
        </div>
        <div className="border border-stone-200 bg-white p-3">
          <p className="text-xs text-stone-500">Latency</p>
          <p className="mt-1 text-2xl font-semibold text-amber-300">
            {summary?.averageLatencyMs ? `${summary.averageLatencyMs}ms` : "N/A"}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="border border-stone-200 bg-white p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500">Recommendations</p>
          {recommendations.isLoading ? (
            <p className="py-5 text-center text-sm text-stone-500">Loading recommendations...</p>
          ) : (
            <div className="space-y-2">
              {recs.map((rec) => (
                <div key={`${rec.provider}:${rec.model}`} className="grid gap-2 border-b border-stone-200 pb-2 last:border-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-stone-700">{rec.model}</span>
                    <span className="rounded border border-stone-300 bg-stone-100 px-1.5 py-0.5 text-xs text-stone-500">
                      {rec.provider}
                    </span>
                    <span className="ml-auto tabular-nums text-sm text-amber-300">{rec.score.toFixed(3)}</span>
                  </div>
                  <p className="text-xs text-stone-500">
                    {rec.label} - {rec.observations} observations - quality {score(rec.averageQuality)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border border-stone-200 bg-white p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500">Eval Dimensions</p>
          <div className="space-y-2">
            {(evals.data?.dimensions ?? []).map((dimension) => (
              <div key={dimension.id} className="border-b border-stone-200 pb-2 last:border-0 last:pb-0">
                <p className="text-sm font-medium text-stone-700">{dimension.label}</p>
                <p className="mt-1 text-xs leading-5 text-stone-500">{dimension.rubric}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

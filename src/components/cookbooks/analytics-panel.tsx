"use client";

import { useState } from "react";
import { useTimeSeries, type TimeSeriesWindow } from "@/lib/api-client";
import { TimeSeriesChart } from "@/components/shared/time-series-chart";
import { COLORS } from "@/lib/constants";

export function CookbooksAnalyticsPanel() {
  const [window, setWindow] = useState<TimeSeriesWindow>("week");

  const executions = useTimeSeries("skill_executions", window);
  const failures = useTimeSeries("skill_failures", window);

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-slate-200">Usage Trends</h3>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <TimeSeriesChart
            title="Skill Executions"
            points={executions.data?.points ?? []}
            window={window}
            onWindowChange={setWindow}
            isLoading={executions.isLoading}
            lineColor={COLORS.accent}
          />
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <TimeSeriesChart
            title="Failure Rate"
            points={failures.data?.points ?? []}
            window={window}
            onWindowChange={setWindow}
            isLoading={failures.isLoading}
            lineColor={COLORS.danger}
          />
        </div>
      </div>
    </div>
  );
}

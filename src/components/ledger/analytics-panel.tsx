"use client";

import { useState } from "react";
import { useTimeSeries, type TimeSeriesWindow } from "@/lib/api-client";
import { TimeSeriesChart } from "@/components/shared/time-series-chart";
import { COLORS } from "@/lib/constants";

export function LedgerAnalyticsPanel() {
  const [window, setWindow] = useState<TimeSeriesWindow>("week");

  const docsIngested = useTimeSeries("docs_ingested", window);
  const memoryWrites = useTimeSeries("memory_writes", window);
  const recallQueries = useTimeSeries("recall_queries", window);

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-slate-200">Usage Trends</h3>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <TimeSeriesChart
            title="Docs Ingested"
            points={docsIngested.data?.points ?? []}
            window={window}
            onWindowChange={setWindow}
            isLoading={docsIngested.isLoading}
            lineColor={COLORS.accent}
          />
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <TimeSeriesChart
            title="Memory Writes"
            points={memoryWrites.data?.points ?? []}
            window={window}
            onWindowChange={setWindow}
            isLoading={memoryWrites.isLoading}
            lineColor={COLORS.info}
          />
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <TimeSeriesChart
            title="Recall Queries"
            points={recallQueries.data?.points ?? []}
            window={window}
            onWindowChange={setWindow}
            isLoading={recallQueries.isLoading}
            lineColor={COLORS.success}
          />
        </div>
      </div>
    </div>
  );
}

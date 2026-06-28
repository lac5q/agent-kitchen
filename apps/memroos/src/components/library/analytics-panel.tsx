"use client";

import { useState } from "react";
import { useTimeSeries, type TimeSeriesWindow } from "@/lib/api-client";
import { TimeSeriesChart } from "@/components/shared/time-series-chart";
import { COLORS } from "@/lib/ui-constants";

export function LibraryAnalyticsPanel() {
  const [window, setWindow] = useState<TimeSeriesWindow>("week");

  const ingestRate = useTimeSeries("docs_ingested", window);
  const collectionGrowth = useTimeSeries("collection_growth", window);

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-stone-700">Usage Trends</h3>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-stone-200 bg-white/90 p-4">
          <TimeSeriesChart
            title="Document Ingest Rate"
            points={ingestRate.data?.points ?? []}
            window={window}
            onWindowChange={setWindow}
            isLoading={ingestRate.isLoading}
            lineColor={COLORS.accent}
          />
        </div>
        <div className="rounded-xl border border-stone-200 bg-white/90 p-4">
          <TimeSeriesChart
            title="Collection Growth"
            points={collectionGrowth.data?.points ?? []}
            window={window}
            onWindowChange={setWindow}
            isLoading={collectionGrowth.isLoading}
            lineColor={COLORS.info}
          />
        </div>
      </div>
    </div>
  );
}

"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { TimeSeriesWindow } from "@/lib/api-client";
import { COLORS } from "@/lib/constants";

interface TimeSeriesChartProps {
  title: string;
  points: Array<{ bucket: string; value: number }>;
  window: TimeSeriesWindow;
  onWindowChange: (w: TimeSeriesWindow) => void;
  isLoading?: boolean;
  lineColor?: string;
}

const WINDOWS: { label: string; value: TimeSeriesWindow }[] = [
  { label: "Day", value: "day" },
  { label: "Week", value: "week" },
  { label: "Month", value: "month" },
];

function DarkTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-medium text-slate-200">{label}</p>
      <p className="text-amber-400">{payload[0].value.toLocaleString()}</p>
    </div>
  );
}

function TimeSeriesChart({
  title,
  points,
  window,
  onWindowChange,
  isLoading = false,
  lineColor,
}: TimeSeriesChartProps) {
  const color = lineColor ?? COLORS.accent;

  return (
    <div className="space-y-3">
      {/* Header: title + window toggle */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-300">{title}</span>
        <div className="flex gap-1">
          {WINDOWS.map((w) => (
            <button
              key={w.value}
              onClick={() => onWindowChange(w.value)}
              className={[
                "px-2 py-0.5 text-xs rounded transition-colors",
                w.value === window
                  ? "text-amber-500 bg-amber-500/10"
                  : "text-slate-500 hover:text-slate-300",
              ].join(" ")}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="h-48 flex items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && points.length === 0 && (
        <div className="h-48 flex items-center justify-center">
          <p className="text-slate-500 text-sm">No data for this period</p>
        </div>
      )}

      {/* Chart */}
      {!isLoading && points.length > 0 && (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart
            data={points}
            margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(148,163,184,0.1)"
            />
            <XAxis
              dataKey="bucket"
              tick={{ fill: "#64748b", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "#64748b", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip content={<DarkTooltip />} />
            <Line
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: color }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export { TimeSeriesChart };

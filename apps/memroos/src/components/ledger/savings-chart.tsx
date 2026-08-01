"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { NOC, NOC_FONT_MONO } from "@/lib/noc-theme";
import type { MetricEnvelope } from "@/lib/metric-status";

interface SavingsDataPoint {
  command: string;
  tokensUsed: number;
  tokensSaved: number;
}

interface SavingsChartProps {
  data: SavingsDataPoint[];
  envelope?: MetricEnvelope<number>;
}

function formatK(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return String(value);
}

function DarkTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border px-3 py-2 text-xs shadow-xl" style={{ borderColor: NOC.ruleStrong, background: NOC.paper }}>
      <p className="mb-1 font-medium" style={{ color: NOC.muted }}>{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} style={{ color: entry.color }}>
          {entry.name}: {formatK(entry.value)}
        </p>
      ))}
    </div>
  );
}

export function SavingsChart({ data, envelope }: SavingsChartProps) {
  const status = envelope?.status;
  const isNonLive = status && status !== "live" && status !== "zero";

  return (
    <div data-savings-source={envelope?.source ?? "/api/tokens?section=commandBreakdown"}>
      {isNonLive && (
        <div
          className="mb-2 rounded border px-2 py-1 text-xs"
          style={{
            borderColor: status === "error" ? NOC.terra : NOC.warn,
            background: status === "error" ? NOC.peach : NOC.warnBg,
            color: status === "error" ? NOC.terra : NOC.warn,
            fontFamily: NOC_FONT_MONO,
          }}
          data-savings-status={status}
        >
          <span className="font-semibold uppercase tracking-wide">{status}</span>
          {envelope?.reason && <span className="ml-2">{envelope.reason}</span>}
        </div>
      )}
      {data.length === 0 ? (
        <div
          className="flex h-64 items-center justify-center text-sm"
          style={{ color: NOC.soft }}
          data-savings-empty
        >
          {status === "blocked"
            ? "Loading savings breakdown..."
            : status === "error" || status === "unavailable"
              ? "Savings breakdown unavailable (see status above)."
              : "No per-command savings available in the selected window."}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart
            layout="vertical"
            data={data}
            margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
          >
            <XAxis
              type="number"
              tickFormatter={formatK}
              tick={{ fill: NOC.soft, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="command"
              width={90}
              tick={{ fill: NOC.soft, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<DarkTooltip />} cursor={{ fill: NOC.fog }} />
            <Legend
              wrapperStyle={{ fontSize: 12, color: NOC.soft }}
              iconType="square"
            />
            <Bar dataKey="tokensUsed" name="Tokens Used" fill={NOC.info} stackId="a" radius={[0, 0, 0, 0]} />
            <Bar dataKey="tokensSaved" name="Tokens Saved" fill={NOC.success} stackId="a" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

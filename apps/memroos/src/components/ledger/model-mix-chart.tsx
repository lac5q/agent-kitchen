"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { NOC, NOC_FONT_MONO } from "@/lib/noc-theme";
import type { MetricEnvelope } from "@/lib/metric-status";

interface ModelMixDataPoint {
  name: string;
  value: number;
}

interface ModelMixChartProps {
  data: ModelMixDataPoint[];
  envelope?: MetricEnvelope<number>;
}

const DONUT_COLORS = [NOC.warn, NOC.info, NOC.success, NOC.terra];

function DarkTooltip({ active, payload }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload: { percent: number } }>;
}) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  return (
    <div className="rounded-lg border px-3 py-2 text-xs shadow-xl" style={{ borderColor: NOC.ruleStrong, background: NOC.paper }}>
      <p className="font-medium" style={{ color: NOC.muted }}>{entry.name}</p>
      <p style={{ color: NOC.soft }}>
        {entry.value.toLocaleString()} tokens ({(entry.payload.percent * 100).toFixed(1)}%)
      </p>
    </div>
  );
}

export function ModelMixChart({ data, envelope }: ModelMixChartProps) {
  const status = envelope?.status;
  const isNonLive = status && status !== "live" && status !== "zero";

  return (
    <div data-model-mix-source={envelope?.source ?? "/api/model-usage"}>
      {isNonLive && (
        <div
          className="mb-2 rounded border px-2 py-1 text-xs"
          style={{
            borderColor: status === "error" ? NOC.terra : NOC.warn,
            background: status === "error" ? NOC.peach : NOC.warnBg,
            color: status === "error" ? NOC.terra : NOC.warn,
            fontFamily: NOC_FONT_MONO,
          }}
          data-model-mix-status={status}
        >
          <span className="font-semibold uppercase tracking-wide">{status}</span>
          {envelope?.reason && <span className="ml-2">{envelope.reason}</span>}
        </div>
      )}
      {data.length === 0 ? (
        <div
          className="flex h-64 items-center justify-center text-sm"
          style={{ color: NOC.soft }}
          data-model-mix-empty
        >
          {status === "blocked"
            ? "Loading model mix..."
            : status === "error"
              ? "Model mix unavailable (see status above)."
              : "No model usage recorded for the selected window."}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={3}
              dataKey="value"
            >
              {data.map((_, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={DONUT_COLORS[index % DONUT_COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip content={<DarkTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 12, color: NOC.soft }}
              iconType="circle"
            />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

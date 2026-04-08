"use client";

import { Treemap, Tooltip, ResponsiveContainer } from "recharts";
import type { KnowledgeCollection } from "@/types";
import type { TreemapNode } from "recharts/types/chart/Treemap";

const CATEGORY_FILL: Record<KnowledgeCollection["category"], string> = {
  business: "#0ea5e9",
  agents: "#10b981",
  marketing: "#f59e0b",
  product: "#a855f7",
  other: "#64748b",
};

interface TreemapDatum {
  name: string;
  size: number;
  fill: string;
  docCount: number;
  [key: string]: unknown;
}

interface CollectionTreemapProps {
  collections: KnowledgeCollection[];
}

function CustomContent(props: TreemapNode) {
  const { x, y, width, height, name, fill, docCount } = props as TreemapNode & {
    fill: string;
    docCount: number;
  };
  const showLabel = width >= 40 && height >= 30;

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={fill}
        fillOpacity={0.75}
        stroke="#1e293b"
        strokeWidth={2}
        rx={4}
      />
      {showLabel && (
        <>
          <text
            x={x + width / 2}
            y={y + height / 2 - 6}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={11}
            fontWeight={600}
            fill="#f8fafc"
            style={{ pointerEvents: "none" }}
          >
            {name}
          </text>
          <text
            x={x + width / 2}
            y={y + height / 2 + 9}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={10}
            fill="#cbd5e1"
            style={{ pointerEvents: "none" }}
          >
            {docCount} docs
          </text>
        </>
      )}
    </g>
  );
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: TreemapDatum }>;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs shadow-xl">
      <p className="font-semibold text-slate-100">{item.name}</p>
      <p className="text-slate-400 mt-0.5">{item.docCount} docs</p>
    </div>
  );
}

export function CollectionTreemap({ collections }: CollectionTreemapProps) {
  const data: TreemapDatum[] = collections
    .filter((c) => c.docCount > 0)
    .map((c) => ({
      name: c.name,
      size: c.docCount,
      fill: CATEGORY_FILL[c.category],
      docCount: c.docCount,
    }));

  return (
    <ResponsiveContainer width="100%" height={340}>
      <Treemap
        data={data}
        dataKey="size"
        nameKey="name"
        content={CustomContent as unknown as (props: TreemapNode) => React.ReactElement}
        isAnimationActive={false}
      >
        <Tooltip content={<CustomTooltip />} />
      </Treemap>
    </ResponsiveContainer>
  );
}

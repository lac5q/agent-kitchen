"use client";

import { memo, useMemo, useState } from "react";

export interface SkillHeatmapProps {
  contributionHistory: Array<{ skill: string; date: string; count: number }>;
  days?: number;
  className?: string;
}

interface HeatmapCellProps {
  count: number;
  date: string;
  skill: string;
}

// Color intensity buckets — static Tailwind classes only (no dynamic JIT class names)
function intensityClass(count: number): string {
  if (count === 0) return "bg-neutral-100 dark:bg-neutral-800";
  if (count <= 2) return "bg-green-200 dark:bg-green-900";
  if (count <= 5) return "bg-green-400 dark:bg-green-700";
  if (count <= 10) return "bg-green-600 dark:bg-green-500";
  return "bg-green-800 dark:bg-green-300";
}

const HeatmapCell = memo(function HeatmapCell({ count, date, skill }: HeatmapCellProps) {
  const [isHovered, setIsHovered] = useState(false);
  return (
    <div
      className={`h-3 w-3 rounded-sm ${intensityClass(count)}${isHovered ? " ring-2 ring-blue-500" : ""}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title={`${skill} — ${date}: ${count} contribution${count === 1 ? "" : "s"}`}
      data-testid={`heatmap-cell-${skill}-${date}`}
      data-count={count}
    />
  );
});

export function SkillHeatmap({ contributionHistory, days = 30, className }: SkillHeatmapProps) {
  // Build last-N-days date axis (oldest on the left, newest on the right)
  const dateColumns = useMemo(() => {
    const cols: string[] = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
      cols.push(d.toISOString().slice(0, 10));
    }
    return cols;
  }, [days]);

  // Distinct skills sorted alphabetically for stable ordering
  const skillRows = useMemo(() => {
    return Array.from(new Set(contributionHistory.map(e => e.skill))).sort();
  }, [contributionHistory]);

  // Lookup map for O(1) cell access
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of contributionHistory) m.set(`${e.skill}|${e.date}`, e.count);
    return m;
  }, [contributionHistory]);

  // Empty-state guard: clamp column count to >= 1 per SKILL-08 spec
  const columnCount = Math.max(1, dateColumns.length);

  if (skillRows.length === 0) {
    return (
      <section className={className} aria-label="Contribution Activity">
        <h3 className="text-sm font-medium mb-2">Contribution Activity</h3>
        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
          data-testid="heatmap-grid-empty"
        >
          {/* Single placeholder cell so the grid renders with at least 1 column */}
          <div className="h-3 w-3 rounded-sm bg-neutral-100 dark:bg-neutral-800" />
        </div>
        <p className="text-xs text-neutral-500 mt-2">
          No contributions in the last {days} days.
        </p>
      </section>
    );
  }

  return (
    <section className={className} aria-label="Contribution Activity">
      <h3 className="text-sm font-medium mb-2">Contribution Activity</h3>
      <div className="space-y-1 overflow-x-auto">
        {skillRows.map(skill => (
          <div
            key={skill}
            className="grid gap-1 items-center"
            style={{ gridTemplateColumns: `8rem repeat(${columnCount}, minmax(0, 1fr))` }}
          >
            <span
              className="text-xs truncate text-neutral-600 dark:text-neutral-300"
              title={skill}
            >
              {skill}
            </span>
            {dateColumns.map(date => (
              <HeatmapCell
                key={`${skill}|${date}`}
                skill={skill}
                date={date}
                count={counts.get(`${skill}|${date}`) ?? 0}
              />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

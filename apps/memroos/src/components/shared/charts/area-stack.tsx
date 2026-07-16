import { NOC, NOC_FONT_MONO } from "@/lib/noc-theme";

interface AreaSeries {
  color: string;
  /**
   * Per-bucket values. `null` represents a non-measured bucket — the
   * source did not return a value for that interval. Non-measured
   * buckets are rendered as a visible gap in the SVG path and DO NOT
   * contribute to the chart's y-scale max, so they can never be
   * confused with a measured zero.
   */
  values: (number | null)[];
}

interface AreaStackProps {
  series: AreaSeries[];
  labels: string[];
  w?: number;
  h?: number;
}

/**
 * Render an SVG <path> for one series. The path consists of one or
 * more closed subpaths; each subpath is a contiguous run of measured
 * buckets. Non-measured buckets (null values) close the current
 * subpath so a visible gap appears between measured intervals.
 *
 * `cumulativeBefore` is the per-bucket cumulative of every prior
 * series at each index. For bucket `i`, the top of this series is
 * `cumulativeBefore[i] + s.values[i]` and the bottom is
 * `cumulativeBefore[i]`. Null buckets omit both and force a new
 * subpath on the next measured bucket.
 */
function buildSeriesPath(
  s: AreaSeries,
  cumulativeBefore: number[],
  px: (i: number) => number,
  py: (v: number) => number
): string {
  const segments: string[] = [];
  let openTop: Array<readonly [number, number]> = [];
  let openBot: Array<readonly [number, number]> = [];

  function flush() {
    if (openTop.length === 0) {
      openTop = [];
      openBot = [];
      return;
    }
    const pieces: string[] = [];
    pieces.push(`M${openTop[0][0].toFixed(1)} ${openTop[0][1].toFixed(1)}`);
    for (let i = 1; i < openTop.length; i += 1) {
      pieces.push(`L${openTop[i][0].toFixed(1)} ${openTop[i][1].toFixed(1)}`);
    }
    for (let i = openBot.length - 1; i >= 0; i -= 1) {
      pieces.push(`L${openBot[i][0].toFixed(1)} ${openBot[i][1].toFixed(1)}`);
    }
    pieces.push("Z");
    segments.push(pieces.join(" "));
    openTop = [];
    openBot = [];
  }

  s.values.forEach((value, i) => {
    if (value === null || value === undefined || Number.isNaN(value)) {
      flush();
      return;
    }
    const base = cumulativeBefore[i] ?? 0;
    const x = px(i);
    openTop.push([x, py(base + value)]);
    openBot.push([x, py(base)]);
  });
  flush();
  return segments.join(" ");
}

function isMeasured(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && !Number.isNaN(value);
}

function AreaStack({ series, labels, w = 640, h = 200 }: AreaStackProps) {
  const n = labels.length;
  // Per-bucket measured sums: only count buckets that have at least one
  // non-null series value. Null buckets are NOT counted as zero — they
  // are non-measurements and must never contribute to max.
  const measuredValues = series.flatMap((s) =>
    s.values.filter(isMeasured),
  );
  const sums = new Array<number>(n).fill(0);
  for (const s of series) {
    s.values.forEach((value, i) => {
      if (isMeasured(value)) sums[i] += value;
    });
  }
  const max = Math.max(1, ...sums, ...measuredValues);
  const px = (i: number) =>
    n <= 1 ? (w - 40) / 2 + 32 : (i / (n - 1)) * (w - 40) + 32;
  const py = (v: number) => h - 28 - (v / max) * (h - 48);

  // Per-bucket cumulative of every PRIOR series at index i. Series are
  // stacked in declaration order, so series k contributes on top of
  // series 0..k-1.
  const cumulativeBefore: number[] = new Array<number>(n).fill(0);
  const paths: Array<{ d: string; color: string }> = [];
  for (const s of series) {
    const d = buildSeriesPath(s, cumulativeBefore, px, py);
    paths.push({ d, color: s.color });
    for (let i = 0; i < n; i += 1) {
      const v = s.values[i];
      if (isMeasured(v)) cumulativeBefore[i] += v;
    }
  }

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width="100%"
      height={h}
      preserveAspectRatio="none"
      style={{ display: "block" }}
      data-area-stack="true"
    >
      {[0, 0.25, 0.5, 0.75, 1].map((g, i) => (
        <line
          key={i}
          x1="32"
          x2={w}
          y1={py(max * g)}
          y2={py(max * g)}
          stroke={NOC.rule}
          strokeDasharray={i ? "2 4" : undefined}
        />
      ))}
      {[0, 0.5, 1].map((g, i) => (
        <text
          key={i}
          x="0"
          y={py(max * g) + 4}
          fontSize="9.5"
          fontFamily={NOC_FONT_MONO}
          fill={NOC.soft}
        >
          {Math.round(max * g)}
        </text>
      ))}
      {paths.map((p, i) =>
        p.d ? <path key={i} d={p.d} fill={p.color} opacity={0.85} /> : null,
      )}
      {labels.map(
        (l, i) =>
          i % Math.ceil(n / 8) === 0 && (
            <text
              key={i}
              x={px(i)}
              y={h - 8}
              fontSize="9.5"
              fontFamily={NOC_FONT_MONO}
              fill={NOC.soft}
              textAnchor="middle"
            >
              {l}
            </text>
          ),
      )}
    </svg>
  );
}

export { AreaStack };
export type { AreaStackProps, AreaSeries };

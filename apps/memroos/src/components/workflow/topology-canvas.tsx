"use client";

import { useEffect, useState } from "react";

import { NOC, NOC_FONT_BODY, NOC_FONT_MONO } from "@/lib/noc-theme";
import type {
  EdgeKind,
  NodeType,
  TopoEdge,
  TopoNode,
  Topology,
} from "@/lib/workflow/topology";

/**
 * The node/edge sets used to be hardcoded literals here — five fixed agent
 * names at hand-typed pixel coordinates, with edge weights that rendered like
 * telemetry but were invented. On any host whose registry held different
 * agents (cordant-hermes-01 holds none) the map showed the wrong ones
 * confidently. Everything now comes from /api/flow/topology.
 */

const KPI_STRIP: [string, string][] = [];

const LEGEND_ITEMS: [string, string][] = [
  [NOC.cold,    "Source feeds"],
  [NOC.ink,     "Context assembly"],
  [NOC.terra,   "Pack delivered to agent"],
  [NOC.success, "Outcome captured"],
  [NOC.info,    "Memory loop (outcomes → memory)"],
];

function nodeFill(t: NodeType): string {
  if (t === "core")  return NOC.peach;
  if (t === "gate")  return NOC.infoBg;
  if (t === "store") return NOC.fog;
  if (t === "sink")  return NOC.successBg;
  return NOC.paper;
}

function edgeColor(k: EdgeKind): string {
  if (k === "pack") return NOC.terra;
  if (k === "ctx")  return NOC.ink;
  if (k === "fb")   return NOC.success;
  if (k === "loop") return NOC.info;
  return NOC.cold;
}

function midY(n: TopoNode) { return n.y + n.h / 2; }

function makePath(a: TopoNode, b: TopoNode): string {
  const x1 = a.x + a.w, y1 = midY(a);
  const x2 = b.x,        y2 = midY(b);
  const dx = Math.max(40, (x2 - x1) / 2);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

function makeLoopPath(a: TopoNode, b: TopoNode): string {
  const x1 = a.x + a.w / 2, y1 = a.y;
  const x2 = b.x + b.w / 2, y2 = b.y + b.h;
  return `M ${x1} ${y1} C ${x1} ${y1 - 70}, ${x2} ${y2 + 70}, ${x2} ${y2}`;
}

interface TopologyCanvasProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Emits the live node so the detail rail can describe the real thing. */
  onSelectNode?: (node: { label: string; sub: string } | null) => void;
}

export function TopologyCanvas({ selectedId, onSelect, onSelectNode }: TopologyCanvasProps) {
  const [topology, setTopology] = useState<Topology | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/flow/topology", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((t: Topology) => !cancelled && setTopology(t))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div style={{ background: NOC.paper, border: `1px solid ${NOC.rule}`, padding: 24, color: NOC.soft, fontFamily: NOC_FONT_MONO, fontSize: 12 }}>
        Workflow map unavailable: {error}
      </div>
    );
  }
  if (!topology) {
    return (
      <div style={{ background: NOC.paper, border: `1px solid ${NOC.rule}`, padding: 24, color: NOC.soft, fontFamily: NOC_FONT_MONO, fontSize: 12 }}>
        Loading live topology…
      </div>
    );
  }

  const { nodes, edges, columns, notices, canvas } = topology;
  const byId: Record<string, TopoNode> = Object.fromEntries(
    nodes.map((n) => [n.id, n]),
  );
  // Animate only edges backed by a real measurement — a pulse on an invented
  // weight is the same false signal the hardcoded map gave.
  const pulses: TopoEdge[] = edges.filter((e) => e.measured).slice(0, 4);

  return (
    <div style={{ background: NOC.paper, border: `1px solid ${NOC.rule}`, padding: 12 }}>
      {/* Legend */}
      <div style={{ display: "flex", gap: 16, fontSize: 11.5, color: NOC.muted, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
        {LEGEND_ITEMS.map(([c, l]) => (
          <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 14, height: 3, background: c, display: "inline-block" }} />
            {l}
          </span>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 11, color: NOC.soft, fontFamily: NOC_FONT_MONO }}>
          click any node for live detail · {nodes.length} nodes · {edges.length} edges
        </span>
      </div>

      {/* SVG topology — explicit aspect-ratio avoids CSS-grid height collapse;
          overflow-x lets phones scroll a wide agent grid instead of crushing it. */}
      <div
        data-topology-scroll
        style={{
          width: "100%",
          overflowX: "auto",
          WebkitOverflowScrolling: "touch",
          border: `1px solid ${NOC.rule}`,
          background: "#fbfaf6",
        }}
      >
      <svg
        viewBox={`0 0 ${canvas.width} ${canvas.height}`}
        width="100%"
        height="auto"
        preserveAspectRatio="xMinYMid meet"
        role="img"
        aria-label={`Workflow topology with ${nodes.length} nodes and ${edges.length} edges`}
        style={{
          display: "block",
          minWidth: 720,
          minHeight: 280,
          aspectRatio: `${canvas.width} / ${canvas.height}`,
          background: "#fbfaf6",
          backgroundImage: "radial-gradient(#e4e4dd 1px, transparent 1px)",
          backgroundSize: "16px 16px",
        }}
      >
        {/* Column headers */}
        {columns.map(({ x, label }) => (
          <text
            key={label}
            x={x}
            y={32}
            fontSize={10}
            fontFamily={NOC_FONT_MONO}
            fill={NOC.soft}
            textAnchor="middle"
            letterSpacing={2}
          >
            {label}
          </text>
        ))}

        {/* Edges */}
        {edges.map((e, i) => {
          const { from, to, weight: throughput, kind } = e;
          const a = byId[from], b = byId[to];
          if (!a || !b) return null;
          const d = kind === "loop" ? makeLoopPath(a, b) : makePath(a, b);
          return (
            <path
              key={i}
              d={d}
              stroke={edgeColor(kind)}
              strokeWidth={0.8 + throughput * 3.6}
              fill="none"
              opacity={0.25 + throughput * 0.55}
              {...(kind === "loop" ? { strokeDasharray: "4 4" } : {})}
            />
          );
        })}

        {/* Animated pulse dots on key edges */}
        {pulses.map((e, i) => {
          const a = byId[e.from], b = byId[e.to];
          if (!a || !b) return null;
          return (
            <circle key={`${e.from}-${e.to}`} r={3.5} fill={edgeColor(e.kind)}>
              <animateMotion
                dur={`${2 + i * 0.6}s`}
                repeatCount="indefinite"
                path={makePath(a, b)}
              />
            </circle>
          );
        })}

        {/* Nodes */}
        {nodes.map((n) => {
          const id = n.id;
          const isSel = selectedId === id;
          const stroke = isSel ? NOC.terra : n.t === "core" ? NOC.terra : NOC.ruleStrong;
          return (
            <g key={id} style={{ cursor: "pointer" }} onClick={() => { onSelect(id); onSelectNode?.({ label: n.label, sub: n.sub }); }}>
              <rect
                x={n.x} y={n.y}
                width={n.w} height={n.h}
                fill={nodeFill(n.t)}
                stroke={stroke}
                strokeWidth={isSel ? 2 : 1}
              />
              <text
                x={n.x + (n.h < 44 ? 7 : 12)}
                y={n.y + (n.h < 44 ? n.h / 2 + 4 : 22)}
                fontSize={n.h < 44 ? 10 : 13}
                fontFamily={NOC_FONT_BODY}
                fontWeight="600"
                fill={NOC.ink}
              >
                {n.label}
              </text>
              {n.sub && (
                <text x={n.x + 12} y={n.y + 38} fontSize={10.5} fontFamily={NOC_FONT_MONO} fill={NOC.soft}>
                  {n.sub}
                </text>
              )}

              {/* Agent status dot — wired to real agent state when available */}
              {n.t === "agent" && (
                <circle
                  cx={n.x + n.w - 12}
                  cy={n.y + 12}
                  r={3.5}
                  fill={NOC.cold}
                />
              )}

              {/* MemroOS core stage labels */}
              {n.t === "core" && (
                <>
                  <text x={n.x + n.w / 2} y={n.y + 70} fontSize={10} fontFamily={NOC_FONT_MONO} fill={NOC.terraDeep} textAnchor="middle">
                    capture → consolidate
                  </text>
                  <text x={n.x + n.w / 2} y={n.y + 90} fontSize={10} fontFamily={NOC_FONT_MONO} fill={NOC.terraDeep} textAnchor="middle">
                    retrieve → act → improve
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>
      </div>

      {/* Notices — an empty column must say why, not render blank */}
      {notices.length > 0 && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
          {notices.map((n) => (
            <div
              key={n}
              style={{
                fontSize: 11.5,
                fontFamily: NOC_FONT_MONO,
                color: NOC.terraDeep,
                background: NOC.peach,
                border: `1px solid ${NOC.rule}`,
                padding: "6px 10px",
              }}
            >
              {n}
            </div>
          ))}
        </div>
      )}

      {/* KPI stats strip */}
      <div
        style={{
          marginTop: 12,
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 10,
          padding: "10px 4px 0",
          borderTop: `1px solid ${NOC.rule}`,
        }}
      >
        {KPI_STRIP.map(([k, v]) => (
          <div key={k}>
            <div style={{ fontSize: 10, color: NOC.soft, letterSpacing: "0.12em", fontWeight: 600, textTransform: "uppercase" }}>
              {k}
            </div>
            <div style={{ fontFamily: NOC_FONT_MONO, fontSize: 18, color: NOC.ink, marginTop: 2 }}>
              {v}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

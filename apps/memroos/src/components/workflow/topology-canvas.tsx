"use client";

import { NOC, NOC_FONT_BODY, NOC_FONT_MONO } from "@/lib/noc-theme";

type NodeType = "src" | "gate" | "core" | "store" | "agent" | "sink";
type EdgeKind = "flow" | "ctx" | "pack" | "fb" | "loop";

interface TopoNode {
  x: number;
  y: number;
  w: number;
  h: number;
  t: NodeType;
  label: string;
  sub: string;
}

const NODES: Record<string, TopoNode> = {
  telegram: { x: 90,  y: 80,  w: 130, h: 56,  t: "src",   label: "Telegram",               sub: "inbound" },
  email:    { x: 90,  y: 160, w: 130, h: 56,  t: "src",   label: "Email",                  sub: "inbound" },
  slack:    { x: 90,  y: 240, w: 130, h: 56,  t: "src",   label: "Slack",                  sub: "inbound" },
  gong:     { x: 90,  y: 320, w: 130, h: 56,  t: "src",   label: "Calls (Gong)",           sub: "inbound" },
  repo:     { x: 90,  y: 400, w: 130, h: 56,  t: "src",   label: "Repos · CI",             sub: "events" },
  gateway:  { x: 300, y: 240, w: 140, h: 72,  t: "gate",  label: "Gateway",                sub: "Iris preflight" },
  memroos:  { x: 510, y: 200, w: 200, h: 150, t: "core",  label: "MemroOS",                sub: "memory · skills · context packs" },
  memory:   { x: 770, y: 140, w: 140, h: 56,  t: "store", label: "Memory",                 sub: "live inventory" },
  skills:   { x: 770, y: 220, w: 140, h: 56,  t: "store", label: "Skills",                 sub: "registry" },
  knowledge:{ x: 770, y: 300, w: 140, h: 56,  t: "store", label: "Knowledge",              sub: "corpus" },
  sophia:   { x: 980, y: 80,  w: 130, h: 50,  t: "agent", label: "Sophia",                 sub: "marketing" },
  maria:    { x: 980, y: 140, w: 130, h: 50,  t: "agent", label: "Maria",                  sub: "content" },
  alba:     { x: 980, y: 200, w: 130, h: 50,  t: "agent", label: "Alba",                   sub: "engineering" },

  gwen:     { x: 980, y: 320, w: 130, h: 50,  t: "agent", label: "Gwen",                   sub: "social" },
  cto:      { x: 980, y: 380, w: 130, h: 50,  t: "agent", label: "Cto",                    sub: "eng" },
  outcomes: { x: 510, y: 410, w: 200, h: 56,  t: "sink",  label: "Outcomes → Memory loop", sub: "feedback" },
};

const EDGES: [string, string, number, EdgeKind][] = [
  ["telegram", "gateway",  0.3, "flow"],
  ["email",    "gateway",  0.5, "flow"],
  ["slack",    "gateway",  0.9, "flow"],
  ["gong",     "gateway",  0.2, "flow"],
  ["repo",     "gateway",  0.7, "flow"],
  ["gateway",  "memroos",  0.9, "flow"],
  ["memroos",  "memory",   0.85, "ctx"],
  ["memroos",  "skills",   0.7,  "ctx"],
  ["memroos",  "knowledge",0.6,  "ctx"],
  ["memory",   "sophia",   0.5,  "pack"],
  ["memory",   "maria",    0.45, "pack"],
  ["memory",   "alba",     0.3,  "pack"],

  ["skills",   "sophia",   0.4,  "pack"],
  ["skills",   "alba",     0.6,  "pack"],

  ["skills",   "cto",      0.2,  "pack"],
  ["knowledge","maria",    0.5,  "pack"],
  ["knowledge","gwen",     0.3,  "pack"],
  ["sophia",   "outcomes", 0.4,  "fb"],
  ["maria",    "outcomes", 0.3,  "fb"],
  ["alba",     "outcomes", 0.5,  "fb"],

  ["gwen",     "outcomes", 0.2,  "fb"],
  ["outcomes", "memroos",  0.7,  "loop"],
];

const PULSE_EDGES: [string, string, string][] = [
  ["gateway", "memroos", NOC.ink],
  ["memory",  "sophia",  NOC.terra],
  ["skills",  "alba",    NOC.terra],
  ["alba",    "outcomes",NOC.success],
];

const COLUMN_HEADERS: [number, string][] = [
  [155, "SOURCES"],
  [370, "GATEWAY"],
  [610, "MEMROOS"],
  [840, "STORES"],
  [1045, "AGENTS"],
];

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
}

export function TopologyCanvas({ selectedId, onSelect }: TopologyCanvasProps) {
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
          click any node for live detail · {Object.keys(NODES).length} nodes · {EDGES.length} active edges
        </span>
      </div>

      {/* SVG topology */}
      <svg
        viewBox="0 0 1180 520"
        width="100%"
        style={{
          display: "block",
          background: "#fbfaf6",
          backgroundImage: "radial-gradient(#e4e4dd 1px, transparent 1px)",
          backgroundSize: "16px 16px",
        }}
      >
        {/* Column headers */}
        {COLUMN_HEADERS.map(([x, label]) => (
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
        {EDGES.map(([from, to, throughput, kind], i) => {
          const a = NODES[from], b = NODES[to];
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
        {PULSE_EDGES.map(([from, to, color], i) => {
          const a = NODES[from], b = NODES[to];
          if (!a || !b) return null;
          return (
            <circle key={i} r={3.5} fill={color}>
              <animateMotion
                dur={`${2 + i * 0.6}s`}
                repeatCount="indefinite"
                path={makePath(a, b)}
              />
            </circle>
          );
        })}

        {/* Nodes */}
        {Object.entries(NODES).map(([id, n]) => {
          const isSel = selectedId === id;
          const stroke = isSel ? NOC.terra : n.t === "core" ? NOC.terra : NOC.ruleStrong;
          return (
            <g key={id} style={{ cursor: "pointer" }} onClick={() => onSelect(id)}>
              <rect
                x={n.x} y={n.y}
                width={n.w} height={n.h}
                fill={nodeFill(n.t)}
                stroke={stroke}
                strokeWidth={isSel ? 2 : 1}
              />
              <text x={n.x + 12} y={n.y + 22} fontSize={13} fontFamily={NOC_FONT_BODY} fontWeight="600" fill={NOC.ink}>
                {n.label}
              </text>
              <text x={n.x + 12} y={n.y + 38} fontSize={10.5} fontFamily={NOC_FONT_MONO} fill={NOC.soft}>
                {n.sub}
              </text>

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

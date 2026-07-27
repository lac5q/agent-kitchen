/**
 * Workflow-map topology, assembled from live state.
 *
 * The map used to be a hand-written literal in `topology-canvas.tsx`: five
 * agent names at fixed pixel coordinates, plus edge weights that looked like
 * telemetry but were typed by hand. On any host whose registry held different
 * agents it displayed the wrong ones confidently, and the literal had already
 * drifted (a deleted node left a 120px gap in the y-coordinates).
 *
 * What is derived vs declared, deliberately:
 *
 *   AGENTS  — derived from `registered_agents`.
 *   STORES  — derived: counted rows from the live tables they represent.
 *   SOURCES — derived from live Nango connections (the connected providers).
 *   Gateway / MemroOS / Outcomes — DECLARED. These are structural: there is
 *     exactly one of each and they exist whether or not anything is connected.
 *     Deriving them would invent a lookup for a constant.
 *
 * Layout is computed, not stored. Columns keep their hand-tuned x positions —
 * those are design, and worth preserving — while y is distributed evenly by
 * how many nodes the column actually holds, so N agents never overlap.
 */

import type Database from "better-sqlite3";

export type NodeType = "src" | "gate" | "core" | "store" | "agent" | "sink";
export type EdgeKind = "flow" | "ctx" | "pack" | "fb" | "loop";
export type ColumnId = "sources" | "gateway" | "memroos" | "stores" | "agents";

export interface TopoNode {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  t: NodeType;
  label: string;
  sub: string;
  /** True when this node came from live state rather than the structural skeleton. */
  live: boolean;
}

export interface TopoEdge {
  from: string;
  to: string;
  /**
   * 0..1 visual weight. Derived from observed activity where a real signal
   * exists; otherwise UNIFORM_WEIGHT. Never a hand-picked number that would
   * read as telemetry.
   */
  weight: number;
  kind: EdgeKind;
  /** False when `weight` is the uniform default rather than a measurement. */
  measured: boolean;
}

export interface Topology {
  nodes: TopoNode[];
  edges: TopoEdge[];
  columns: Array<{ x: number; label: string }>;
  /** Populated when a column is legitimately empty, so the UI can say so. */
  notices: string[];
  generatedAt: string;
}

/** Weight used when no activity signal exists. Flat by design. */
export const UNIFORM_WEIGHT = 0.35;

const COLUMN_X: Record<ColumnId, number> = {
  sources: 90,
  gateway: 300,
  memroos: 510,
  stores: 770,
  agents: 980,
};

const COLUMN_HEADER_X: Array<{ x: number; label: string }> = [
  { x: 155, label: "SOURCES" },
  { x: 370, label: "GATEWAY" },
  { x: 610, label: "MEMROOS" },
  { x: 840, label: "STORES" },
  { x: 1045, label: "AGENTS" },
];

const CANVAS_TOP = 80;
const CANVAS_BOTTOM = 460;

/**
 * Distribute n nodes down a column. Even spacing computed from the count is
 * what keeps the map correct as the registry grows or shrinks — the old
 * literal hardcoded y per node and had already drifted out of alignment.
 */
function layoutColumn(count: number, h: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [(CANVAS_TOP + CANVAS_BOTTOM - h) / 2];
  const span = CANVAS_BOTTOM - CANVAS_TOP - h;
  const step = span / (count - 1);
  return Array.from({ length: count }, (_, i) => CANVAS_TOP + i * step);
}

function tableExists(db: Database.Database, table: string): boolean {
  try {
    const row = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = ? AND name = ?`)
      .get("table", table);
    return Boolean(row);
  } catch {
    return false;
  }
}

function countRows(db: Database.Database, table: string): number {
  try {
    const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as
      | { n: number }
      | undefined;
    return row?.n ?? 0;
  } catch {
    // Table absent on an older schema — report zero rather than failing the map.
    return 0;
  }
}

export interface TopologyInput {
  agents: Array<{ id: string; name: string; role: string; status?: string }>;
  /** Connected providers, from Nango. Empty is normal and rendered as such. */
  sources: Array<{ id: string; label: string; sub: string }>;
  /** Per-agent activity counts, when available, for edge weighting. */
  agentActivity?: Record<string, number>;
}

export function buildTopology(
  db: Database.Database,
  input: TopologyInput,
): Topology {
  const nodes: TopoNode[] = [];
  const edges: TopoEdge[] = [];
  const notices: string[] = [];

  // ---- SOURCES (live: connected providers) --------------------------------
  const srcY = layoutColumn(input.sources.length, 56);
  input.sources.forEach((s, i) => {
    nodes.push({
      id: `src:${s.id}`,
      x: COLUMN_X.sources,
      y: srcY[i],
      w: 130,
      h: 56,
      t: "src",
      label: s.label,
      sub: s.sub,
      live: true,
    });
  });
  if (input.sources.length === 0) {
    notices.push("No connected sources — connect a provider in Settings → Integrations.");
  }

  // ---- Structural spine (declared, not derived) ---------------------------
  nodes.push({
    id: "gateway",
    x: COLUMN_X.gateway,
    y: 240,
    w: 140,
    h: 72,
    t: "gate",
    label: "Gateway",
    sub: "Iris preflight",
    live: false,
  });
  nodes.push({
    id: "memroos",
    x: COLUMN_X.memroos,
    y: 200,
    w: 200,
    h: 150,
    t: "core",
    label: "MemroOS",
    sub: "memory · skills · context packs",
    live: false,
  });
  nodes.push({
    id: "outcomes",
    x: COLUMN_X.memroos,
    y: 410,
    w: 200,
    h: 56,
    t: "sink",
    label: "Outcomes → Memory loop",
    sub: "feedback",
    live: false,
  });

  // ---- STORES (live counts) ------------------------------------------------
  // Table names verified against the live oracle-1 database 2026-07-27. There
  // is no `skills` or `knowledge_documents` table — naming one would render a
  // confident "0 documents" for a store that simply is not there, which is the
  // same class of lie the hardcoded map told.
  const stores = [
    { id: "memory", label: "Memory", table: "messages", unit: "records" },
    { id: "skills", label: "Skills", table: "proposed_skills", unit: "proposed" },
    { id: "knowledge", label: "Knowledge", table: "vault_artifacts", unit: "artifacts" },
  ];
  const storeY = layoutColumn(stores.length, 56);
  stores.forEach((s, i) => {
    const n = countRows(db, s.table);
    nodes.push({
      id: s.id,
      x: COLUMN_X.stores,
      y: storeY[i],
      w: 140,
      h: 56,
      t: "store",
      label: s.label,
      // `countRows` returns 0 for an absent table, so distinguish "table is
      // there and empty" from "unavailable" rather than implying a real zero.
      sub: tableExists(db, s.table) ? `${n.toLocaleString()} ${s.unit}` : "unavailable",
      live: tableExists(db, s.table),
    });
  });

  // ---- AGENTS (live registry) ---------------------------------------------
  const agentY = layoutColumn(input.agents.length, 50);
  input.agents.forEach((a, i) => {
    nodes.push({
      id: `agent:${a.id}`,
      x: COLUMN_X.agents,
      y: agentY[i],
      w: 130,
      h: 50,
      t: "agent",
      label: a.name,
      sub: a.role,
      live: true,
    });
  });
  if (input.agents.length === 0) {
    notices.push(
      "No agents registered on this host — the registry is empty, so the AGENTS column has nothing to draw.",
    );
  }

  // ---- Edges ---------------------------------------------------------------
  for (const s of input.sources) {
    edges.push({ from: `src:${s.id}`, to: "gateway", weight: UNIFORM_WEIGHT, kind: "flow", measured: false });
  }
  edges.push({ from: "gateway", to: "memroos", weight: UNIFORM_WEIGHT, kind: "flow", measured: false });
  for (const s of stores) {
    edges.push({ from: "memroos", to: s.id, weight: UNIFORM_WEIGHT, kind: "ctx", measured: false });
  }

  // Store → agent edges. Weight is scaled by observed activity when the caller
  // supplied counts; otherwise flat. The old map asserted "memory feeds Sophia
  // at 0.5" with nothing behind it.
  const activity = input.agentActivity ?? {};
  const maxActivity = Math.max(1, ...Object.values(activity));
  for (const a of input.agents) {
    const observed = activity[a.id];
    const measured = typeof observed === "number";
    const weight = measured
      ? Math.max(0.15, Math.min(1, observed / maxActivity))
      : UNIFORM_WEIGHT;
    edges.push({ from: "memory", to: `agent:${a.id}`, weight, kind: "pack", measured });
    edges.push({ from: `agent:${a.id}`, to: "outcomes", weight, kind: "fb", measured });
  }
  edges.push({ from: "outcomes", to: "memroos", weight: UNIFORM_WEIGHT, kind: "loop", measured: false });

  return {
    nodes,
    edges,
    columns: COLUMN_HEADER_X,
    notices,
    generatedAt: new Date().toISOString(),
  };
}

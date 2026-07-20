/**
 * Light wiki graph loader (WIKISURF-07..08).
 */
import fs from "node:fs";
import path from "node:path";

import { getWikiRoot, resolveWikiPath, wikiRootExists } from "@/lib/wiki-vault";

export interface WikiGraphNode {
  id: string;
  label: string;
  path?: string;
}

export interface WikiGraphEdge {
  source: string;
  target: string;
  type?: string;
}

export interface WikiGraph {
  exists: boolean;
  path: string | null;
  generatedAt: string | null;
  nodes: WikiGraphNode[];
  edges: WikiGraphEdge[];
  reason?: string;
}

export function getWikiGraphPath(wikiRoot: string): string {
  return path.join(wikiRoot, "graph", "knowledge-graph.json");
}

export function loadWikiGraph(options: {
  knowledgeBasePath?: string;
  wikiRoot?: string;
} = {}): WikiGraph {
  const wikiRoot = getWikiRoot(options);
  const graphPath = getWikiGraphPath(wikiRoot);
  if (!wikiRootExists(wikiRoot)) {
    return {
      exists: false,
      path: null,
      generatedAt: null,
      nodes: [],
      edges: [],
      reason: "wiki_root_missing",
    };
  }
  if (!fs.existsSync(graphPath)) {
    return {
      exists: false,
      path: graphPath,
      generatedAt: null,
      nodes: [],
      edges: [],
      reason: "graph_missing",
    };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(graphPath, "utf8")) as {
      generatedAt?: string;
      nodes?: unknown[];
      edges?: unknown[];
    };
    const nodes: WikiGraphNode[] = [];
    for (const node of Array.isArray(raw.nodes) ? raw.nodes : []) {
      const n = node as Record<string, unknown>;
      const id = String(n.id ?? "");
      if (!id) continue;
      const nodePath = typeof n.path === "string" ? n.path : undefined;
      if (nodePath) {
        const resolved = resolveWikiPath(wikiRoot, nodePath);
        if (!resolved) continue;
      }
      nodes.push({
        id,
        label: String(n.label ?? n.name ?? id),
        path: nodePath,
      });
    }
    const edges: WikiGraphEdge[] = [];
    for (const edge of Array.isArray(raw.edges) ? raw.edges : []) {
      const e = edge as Record<string, unknown>;
      const source = String(e.source ?? e.from ?? "");
      const target = String(e.target ?? e.to ?? "");
      if (!source || !target) continue;
      edges.push({
        source,
        target,
        type: typeof e.type === "string" ? e.type : undefined,
      });
    }
    return {
      exists: true,
      path: graphPath,
      generatedAt: typeof raw.generatedAt === "string" ? raw.generatedAt : null,
      nodes,
      edges,
    };
  } catch (err) {
    return {
      exists: false,
      path: graphPath,
      generatedAt: null,
      nodes: [],
      edges: [],
      reason: err instanceof Error ? err.message : "graph_parse_failed",
    };
  }
}

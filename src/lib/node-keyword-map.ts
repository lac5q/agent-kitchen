/**
 * node-keyword-map.ts
 *
 * Pure module (no React, no I/O) for mapping canvas node IDs to activity events.
 * Used by NodeDetailPanel to fan-out event matching beyond strict event.node equality.
 *
 * Exports:
 *   NODE_KEYWORD_MAP   — keyword + alias registry for all mapped canvas nodes
 *   matchEventsForNode — filter events for a given canvas nodeId
 *   isSparseNode       — true for nodes with no event instrumentation (show limited-data indicator)
 */

/** Minimal event shape matching ActivityEvent from /api/activity */
export interface NodeEvent {
  id: string;
  timestamp: string;
  node: string;
  type: string;
  message: string;
  severity: string;
}

export interface NodeKeywordEntry {
  /** Other event.node values that map to this canvas node */
  aliases: string[];
  /** Regexes matched case-insensitively against event.message */
  keywords: RegExp[];
}

/**
 * Keyword registry for all non-sparse canvas nodes.
 * Keys = canonical canvas node IDs (from react-flow-canvas.tsx).
 *
 * NOTE: Sparse nodes (qdrant, obsidian, etc.) are listed in SPARSE_NODES below.
 * They MAY optionally have entries here for keyword routing, but their absence
 * from NODE_KEYWORD_MAP still results in keyword matches when entries do exist
 * (e.g. qdrant has keywords so it CAN return events — it's just documented sparse
 * when those events don't exist).
 */
export const NODE_KEYWORD_MAP: Record<string, NodeKeywordEntry> = {
  // Row 1: request flow
  request: { aliases: [], keywords: [] },
  gateways: {
    aliases: ["gateway"],
    keywords: [/gateway/i, /telegram/i, /discord/i],
  },
  manager: {
    aliases: ["paperclip"],
    keywords: [/paperclip/i, /orchestrator/i],
  },
  output: { aliases: [], keywords: [] },

  // Row 2: agents group
  "local-agents": {
    aliases: ["agents"],
    keywords: [/\bagent(s)?\b/i, /heartbeat/i, /chef/i],
  },
  "agent-alba": {
    aliases: ["alba", "hermes"],
    keywords: [/\balba\b/i, /hermes/i],
  },
  "agent-gwen": {
    aliases: ["gwen"],
    keywords: [/\bgwen\b/i],
  },
  "agent-sophia": {
    aliases: ["sophia"],
    keywords: [/\bsophia\b/i],
  },
  "agent-maria": {
    aliases: ["maria"],
    keywords: [/\bmaria\b/i],
  },
  "agent-lucia": {
    aliases: ["lucia"],
    keywords: [/\blucia\b/i],
  },

  // Row 3: infra
  tunnels: {
    aliases: ["cf-tunnel", "tunnel"],
    keywords: [/tunnel/i, /cloudflare/i],
  },
  taskboard: {
    aliases: ["kanban", "nerve"],
    keywords: [/task ?board/i, /kanban/i, /nerve/i],
  },
  notebooks: {
    aliases: ["mem0", "memory"],
    keywords: [/mem0/i, /\bmemory\b/i, /remember/i],
  },
  librarian: {
    aliases: ["qmd"],
    keywords: [/\bqmd\b/i, /BM25/i, /keyword search/i],
  },
  qdrant: {
    aliases: ["qdrant-cloud"],
    keywords: [/qdrant/i, /vector (store|search|db)/i, /embedding/i],
  },

  // Row 4: knowledge + skills
  cookbooks: {
    aliases: ["skills", "cookbook", "skill"],
    keywords: [/\bskill(s)?\b/i, /cookbook/i, /APO/i, /proposal/i],
  },
  apo: {
    aliases: ["agent-lightning", "lightning"],
    keywords: [/\bAPO\b/i, /agent lightning/i, /proposal/i, /\bcycle\b/i],
  },
  gitnexus: {
    aliases: [],
    keywords: [/gitnexus/i, /code graph/i],
  },
  llmwiki: {
    aliases: ["wiki"],
    keywords: [/llm[ -]?wiki/i, /wiki/i],
  },
  "knowledge-curator": {
    aliases: ["curator", "knowledge_curator"],
    keywords: [/curator/i, /knowledge-curator/i, /nightly (ingest|sync)/i],
  },
  obsidian: {
    aliases: ["vault"],
    keywords: [/obsidian/i, /vault/i, /journal/i],
  },

  // Dev tools
  "claude-code": { aliases: [], keywords: [] },
  "qwen-cli": { aliases: [], keywords: [] },
  "gemini-cli": { aliases: [], keywords: [] },
  codex: { aliases: [], keywords: [] },
};

/**
 * Nodes with no event instrumentation in the current activity API.
 * When these nodes have zero matched events, the panel shows a documented
 * "Limited activity data for this node type" indicator instead of the generic
 * empty state.
 */
const SPARSE_NODES = new Set([
  "qdrant",
  "obsidian",
  "knowledge-curator",
  "tunnels",
  "gitnexus",
  "llmwiki",
  "claude-code",
  "qwen-cli",
  "gemini-cli",
  "codex",
  "request",
  "output",
]);

/**
 * Returns true for nodes with no event instrumentation in the current activity API.
 * These nodes show the "Limited activity data" indicator when their event list is empty.
 */
export function isSparseNode(nodeId: string): boolean {
  return SPARSE_NODES.has(nodeId);
}

/**
 * Returns events that belong to the given canvas nodeId.
 *
 * Matching rules (any one sufficient):
 * 1. event.node === nodeId (exact match)
 * 2. event.node is in that nodeId's aliases list
 * 3. Any keyword regex matches event.message
 *
 * Preserves input array order. Does NOT slice — caller applies the cap.
 * Does NOT mutate the input array.
 */
export function matchEventsForNode(nodeId: string, events: NodeEvent[]): NodeEvent[] {
  const entry = NODE_KEYWORD_MAP[nodeId];
  if (!entry) {
    // Unknown node or no entry — fall back to exact match only
    return events.filter(e => e.node === nodeId);
  }

  const aliasSet = new Set([nodeId, ...entry.aliases]);

  return events.filter(event => {
    // Rule 1 + 2: exact node match or alias match
    if (aliasSet.has(event.node)) return true;
    // Rule 3: keyword match in message
    return entry.keywords.some(kw => kw.test(event.message));
  });
}

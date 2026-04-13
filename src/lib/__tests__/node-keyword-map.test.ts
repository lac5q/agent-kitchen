// @vitest-environment node
import { describe, it, expect } from "vitest";
import { matchEventsForNode, isSparseNode, NODE_KEYWORD_MAP } from "../node-keyword-map";

// Local Event type matching ActivityEvent shape (no import cycle)
interface Event {
  id: string;
  timestamp: string;
  node: string;
  type: "request" | "knowledge" | "memory" | "error" | "apo";
  message: string;
  severity: "info" | "warn" | "error";
}

function makeEvent(overrides: Partial<Event> & { node: string; message: string }): Event {
  return {
    id: `e-${Math.random().toString(36).slice(2)}`,
    timestamp: new Date().toISOString(),
    type: "knowledge",
    severity: "info",
    ...overrides,
  };
}

// T1: exact match via event.node === nodeId
describe("matchEventsForNode", () => {
  it("T1: returns event when event.node exactly matches nodeId", () => {
    const event = makeEvent({ node: "notebooks", message: "some message" });
    const result = matchEventsForNode("notebooks", [event]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(event);
  });

  // T2: keyword match in message
  it("T2: returns event when message matches a keyword (mem0 for notebooks)", () => {
    const event = makeEvent({ node: "something", message: "mem0 export complete" });
    const result = matchEventsForNode("notebooks", [event]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(event);
  });

  // T3: qdrant keyword match — closes empty-panel bug
  it("T3: matchEventsForNode(qdrant) returns event with 'qdrant vector store' in message", () => {
    const event = makeEvent({ node: "notebooks", message: "qdrant vector store updated" });
    const result = matchEventsForNode("qdrant", [event]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(event);
  });

  // T4: agent-alba keyword match — closes empty-panel bug for per-agent nodes
  it("T4: matchEventsForNode(agent-alba) returns event from agents node mentioning alba", () => {
    const event = makeEvent({ node: "agents", message: "alba heartbeat just now" });
    const result = matchEventsForNode("agent-alba", [event]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(event);
  });

  // T5: fan-out — both exact match and keyword match across different events
  it("T5: matchEventsForNode(cookbooks) returns both exact-match and keyword-match events", () => {
    const e1 = makeEvent({ node: "cookbooks", message: "cookbook updated" });
    const e2 = makeEvent({ node: "librarian", message: "skill audit complete" });
    const result = matchEventsForNode("cookbooks", [e1, e2]);
    expect(result).toHaveLength(2);
    expect(result).toContain(e1);
    expect(result).toContain(e2);
  });

  // T6: no match returns empty array
  it("T6: returns empty array when no events match obsidian", () => {
    const event = makeEvent({ node: "notebooks", message: "unrelated message" });
    const result = matchEventsForNode("obsidian", [event]);
    expect(result).toHaveLength(0);
  });

  // T7: input order is preserved in output
  it("T7: preserves original input order", () => {
    const e1 = makeEvent({ node: "notebooks", message: "mem0 write A" });
    const e2 = makeEvent({ node: "notebooks", message: "mem0 write B" });
    const e3 = makeEvent({ node: "notebooks", message: "mem0 write C" });
    const result = matchEventsForNode("notebooks", [e1, e2, e3]);
    expect(result[0]).toBe(e1);
    expect(result[1]).toBe(e2);
    expect(result[2]).toBe(e3);
  });

  // T8: input array is not mutated
  it("T8: does not mutate the input array", () => {
    const events = [
      makeEvent({ node: "notebooks", message: "mem0 first" }),
      makeEvent({ node: "notebooks", message: "mem0 second" }),
    ];
    const original = [...events];
    matchEventsForNode("notebooks", events);
    matchEventsForNode("notebooks", events);
    expect(events).toHaveLength(original.length);
    expect(events[0]).toBe(original[0]);
    expect(events[1]).toBe(original[1]);
  });
});

// T9: isSparseNode
describe("isSparseNode", () => {
  it("T9: sparse nodes return true, non-sparse return false", () => {
    expect(isSparseNode("qdrant")).toBe(true);
    expect(isSparseNode("obsidian")).toBe(true);
    expect(isSparseNode("cookbooks")).toBe(false);
    expect(isSparseNode("agent-alba")).toBe(false);
    expect(isSparseNode("knowledge-curator")).toBe(true);
    expect(isSparseNode("tunnels")).toBe(true);
    expect(isSparseNode("gitnexus")).toBe(true);
    expect(isSparseNode("llmwiki")).toBe(true);
    expect(isSparseNode("claude-code")).toBe(true);
    expect(isSparseNode("qwen-cli")).toBe(true);
    expect(isSparseNode("gemini-cli")).toBe(true);
    expect(isSparseNode("codex")).toBe(true);
    expect(isSparseNode("request")).toBe(true);
    expect(isSparseNode("output")).toBe(true);
    expect(isSparseNode("notebooks")).toBe(false);
    expect(isSparseNode("librarian")).toBe(false);
    expect(isSparseNode("taskboard")).toBe(false);
    expect(isSparseNode("local-agents")).toBe(false);
  });
});

// T10: Every canvas node ID has an entry in NODE_KEYWORD_MAP or is in the sparse list
describe("NODE_KEYWORD_MAP coverage", () => {
  it("T10: all canvas node IDs from the documented list have an entry in NODE_KEYWORD_MAP", () => {
    const allCanvasNodes = [
      // Row 1 request flow
      "request", "gateways", "manager", "output",
      // Row 2 agents group
      "agent-alba", "agent-gwen", "agent-sophia", "agent-maria", "agent-lucia", "local-agents",
      // Row 3 infra
      "tunnels", "taskboard", "notebooks", "librarian", "qdrant",
      // Row 4 knowledge + skills
      "cookbooks", "apo", "gitnexus", "llmwiki", "knowledge-curator", "obsidian",
      // Dev tools
      "claude-code", "qwen-cli", "gemini-cli", "codex",
    ];

    const sparseNodes = new Set([
      "qdrant", "obsidian", "knowledge-curator", "tunnels", "gitnexus", "llmwiki",
      "claude-code", "qwen-cli", "gemini-cli", "codex", "request", "output",
    ]);

    for (const nodeId of allCanvasNodes) {
      const inMap = nodeId in NODE_KEYWORD_MAP;
      const inSparse = sparseNodes.has(nodeId);
      expect(
        inMap || inSparse,
        `Canvas node "${nodeId}" must be in NODE_KEYWORD_MAP or the sparse set`
      ).toBe(true);
    }
  });
});

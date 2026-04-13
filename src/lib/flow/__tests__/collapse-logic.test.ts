import { describe, it, expect } from "vitest";
import { applyCollapseToNodes, applyCollapseToEdges, aggregateHealthColor } from "../collapse-logic";
import type { Node, Edge } from "@xyflow/react";

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeNode(id: string, overrides: Partial<Node> = {}): Node {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {},
    ...overrides,
  } as Node;
}

function makeEdge(id: string, source: string, target: string, overrides: Partial<Edge> = {}): Edge {
  return { id, source, target, ...overrides } as Edge;
}

const groupNode = makeNode("group-agents", { type: "groupBoxNode" });
const child1 = makeNode("agent-alba", { parentId: "group-agents" });
const child2 = makeNode("agent-gwen", { parentId: "group-agents" });
const ungrouped = makeNode("manager");

const devGroupNode = makeNode("group-devtools", { type: "groupBoxNode" });
const devChild = makeNode("cookbooks", { parentId: "group-devtools" });

// ── applyCollapseToNodes ─────────────────────────────────────────────────────

describe("applyCollapseToNodes", () => {
  const nodes = [groupNode, child1, child2, ungrouped, devGroupNode, devChild];

  it("returns same length array when no groups collapsed", () => {
    const result = applyCollapseToNodes(nodes, new Set());
    expect(result).toHaveLength(nodes.length);
  });

  it("does not mutate input nodes", () => {
    const original = [...nodes];
    applyCollapseToNodes(nodes, new Set(["group-agents"]));
    expect(nodes).toEqual(original);
  });

  it("sets hidden:true on children of collapsed group", () => {
    const result = applyCollapseToNodes(nodes, new Set(["group-agents"]));
    const alba = result.find(n => n.id === "agent-alba")!;
    const gwen = result.find(n => n.id === "agent-gwen")!;
    expect(alba.hidden).toBe(true);
    expect(gwen.hidden).toBe(true);
  });

  it("leaves ungrouped nodes visible when agents group collapsed", () => {
    const result = applyCollapseToNodes(nodes, new Set(["group-agents"]));
    const mgr = result.find(n => n.id === "manager")!;
    expect(mgr.hidden).toBeFalsy();
  });

  it("leaves children of OTHER group visible when one group collapsed", () => {
    const result = applyCollapseToNodes(nodes, new Set(["group-agents"]));
    const ck = result.find(n => n.id === "cookbooks")!;
    expect(ck.hidden).toBeFalsy();
  });

  it("collapses children of devtools group independently", () => {
    const result = applyCollapseToNodes(nodes, new Set(["group-devtools"]));
    const ck = result.find(n => n.id === "cookbooks")!;
    expect(ck.hidden).toBe(true);
    const alba = result.find(n => n.id === "agent-alba")!;
    expect(alba.hidden).toBeFalsy();
  });

  it("collapses both groups simultaneously", () => {
    const result = applyCollapseToNodes(nodes, new Set(["group-agents", "group-devtools"]));
    const alba = result.find(n => n.id === "agent-alba")!;
    const ck = result.find(n => n.id === "cookbooks")!;
    expect(alba.hidden).toBe(true);
    expect(ck.hidden).toBe(true);
  });

  it("clears hidden:true when group is no longer collapsed", () => {
    // First collapse, then expand
    const collapsed = applyCollapseToNodes(nodes, new Set(["group-agents"]));
    const expanded = applyCollapseToNodes(collapsed, new Set());
    const alba = expanded.find(n => n.id === "agent-alba")!;
    expect(alba.hidden).toBe(false);
  });

  it("group box node itself is never hidden by collapse logic", () => {
    const result = applyCollapseToNodes(nodes, new Set(["group-agents"]));
    const grp = result.find(n => n.id === "group-agents")!;
    expect(grp.hidden).toBeFalsy();
  });
});

// ── applyCollapseToEdges ─────────────────────────────────────────────────────

describe("applyCollapseToEdges", () => {
  const edges = [
    makeEdge("mgr-alba", "manager", "agent-alba"),
    makeEdge("mgr-gwen", "manager", "agent-gwen"),
    makeEdge("mgr-mgr2", "manager", "notebooks"),
    makeEdge("alba-mem", "agent-alba", "notebooks"),
  ];

  it("returns same length array (uses .map not .filter)", () => {
    const result = applyCollapseToEdges(edges, new Set(["agent-alba"]));
    expect(result).toHaveLength(edges.length);
  });

  it("does not mutate input edges", () => {
    const original = edges.map(e => ({ ...e }));
    applyCollapseToEdges(edges, new Set(["agent-alba"]));
    edges.forEach((e, i) => expect(e).toEqual(original[i]));
  });

  it("hides edges where source is in hiddenNodeIds", () => {
    const result = applyCollapseToEdges(edges, new Set(["agent-alba"]));
    const hiddenEdge = result.find(e => e.id === "alba-mem")!;
    expect(hiddenEdge.hidden).toBe(true);
  });

  it("hides edges where target is in hiddenNodeIds", () => {
    const result = applyCollapseToEdges(edges, new Set(["agent-alba"]));
    const hiddenEdge = result.find(e => e.id === "mgr-alba")!;
    expect(hiddenEdge.hidden).toBe(true);
  });

  it("leaves visible edges with hidden:false (clears stale state on expand)", () => {
    const result = applyCollapseToEdges(edges, new Set(["agent-alba"]));
    const visible = result.find(e => e.id === "mgr-mgr2")!;
    expect(visible.hidden).toBe(false);
  });

  it("hides edges connected to multiple hidden nodes", () => {
    const result = applyCollapseToEdges(edges, new Set(["agent-alba", "agent-gwen"]));
    const h1 = result.find(e => e.id === "mgr-alba")!;
    const h2 = result.find(e => e.id === "mgr-gwen")!;
    expect(h1.hidden).toBe(true);
    expect(h2.hidden).toBe(true);
  });

  it("restores hidden:false when hiddenNodeIds is empty", () => {
    // Simulate expand: first apply with hidden ids, then with empty set
    const collapsed = applyCollapseToEdges(edges, new Set(["agent-alba"]));
    const expanded = applyCollapseToEdges(collapsed, new Set());
    expect(expanded.every(e => e.hidden === false)).toBe(true);
  });
});

// ── aggregateHealthColor ─────────────────────────────────────────────────────

describe("aggregateHealthColor", () => {
  it("returns dormant color for empty array", () => {
    expect(aggregateHealthColor([])).toBe("#64748b");
  });

  it("returns error color when any status is error", () => {
    expect(aggregateHealthColor(["active", "error", "idle"])).toBe("#f43f5e");
  });

  it("error takes priority over active", () => {
    expect(aggregateHealthColor(["active", "error"])).toBe("#f43f5e");
  });

  it("returns active color when no error and at least one active", () => {
    expect(aggregateHealthColor(["active", "idle", "dormant"])).toBe("#10b981");
  });

  it("returns idle color when no error/active and at least one idle", () => {
    expect(aggregateHealthColor(["idle", "dormant"])).toBe("#f59e0b");
  });

  it("returns dormant color when all statuses are dormant", () => {
    expect(aggregateHealthColor(["dormant", "dormant"])).toBe("#64748b");
  });

  it("handles single active status", () => {
    expect(aggregateHealthColor(["active"])).toBe("#10b981");
  });

  it("handles single error status", () => {
    expect(aggregateHealthColor(["error"])).toBe("#f43f5e");
  });
});

/**
 * collapse-logic.ts
 *
 * Pure functions for collapsible group node logic.
 * No React dependencies — easily unit-testable.
 */

import type { Node, Edge } from "@xyflow/react";

/**
 * Apply collapse visibility to nodes.
 *
 * Children whose parentId matches a collapsed group ID get hidden:true.
 * All other nodes get hidden:false (clears stale hidden state on expand).
 * Group box nodes themselves are never hidden by this function.
 *
 * Uses .map() — preserves array length so React Flow can track all nodes.
 */
export function applyCollapseToNodes(nodes: Node[], collapsedGroupIds: Set<string>): Node[] {
  return nodes.map(node => {
    // Group box nodes are never hidden by collapse logic
    if (node.type === "groupBoxNode") {
      return { ...node, hidden: false };
    }
    // Child nodes whose parent is collapsed
    if (node.parentId && collapsedGroupIds.has(node.parentId)) {
      return { ...node, hidden: true };
    }
    // All other nodes: ensure hidden is false (handles expand / stale state)
    return { ...node, hidden: false };
  });
}

/**
 * Apply collapse visibility to edges.
 *
 * Edges where source OR target is in hiddenNodeIds get hidden:true.
 * All other edges get hidden:false (clears stale state on expand).
 *
 * IMPORTANT: Uses .map() — NEVER .filter(). Edges must stay in the array
 * so they are restored when the group is expanded.
 */
export function applyCollapseToEdges(edges: Edge[], hiddenNodeIds: Set<string>): Edge[] {
  return edges.map(edge => {
    const isHidden = hiddenNodeIds.has(edge.source) || hiddenNodeIds.has(edge.target);
    return { ...edge, hidden: isHidden };
  });
}

// Priority ordering: error > active > idle > dormant
const STATUS_PRIORITY = ["error", "active", "idle", "dormant"] as const;
const STATUS_COLORS: Record<string, string> = {
  error:   "#f43f5e",
  active:  "#10b981",
  idle:    "#f59e0b",
  dormant: "#64748b",
};

/**
 * Aggregate multiple health statuses into the highest-priority color.
 *
 * Priority: error=#f43f5e > active=#10b981 > idle=#f59e0b > dormant=#64748b
 * Returns dormant color for empty array.
 */
export function aggregateHealthColor(statuses: string[]): string {
  for (const priority of STATUS_PRIORITY) {
    if (statuses.includes(priority)) {
      return STATUS_COLORS[priority];
    }
  }
  return STATUS_COLORS.dormant;
}

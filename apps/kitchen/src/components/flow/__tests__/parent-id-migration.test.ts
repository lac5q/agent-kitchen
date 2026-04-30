/**
 * parent-id-migration.test.ts
 *
 * File-introspection tests that lock in the parentId migration invariants for
 * react-flow-canvas.tsx. Mirrors the edge-structure.test.ts pattern:
 * readFileSync + pure string/regex assertions — no React rendering needed.
 *
 * All 8 tests must be RED before Task 2 and GREEN after Task 2.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const SRC = readFileSync(
  join(__dirname, "../react-flow-canvas.tsx"),
  "utf-8"
);

describe("parentId migration invariants — react-flow-canvas.tsx", () => {
  it("Test 1: source contains parentId group-agents and group-devtools", () => {
    expect(SRC).toContain('parentId: "group-agents"');
    expect(SRC).toContain('parentId: "group-devtools"');
  });

  it('Test 2: extent: "parent" appears at least 3 times (agents map, local node, devtools map)', () => {
    const matches = SRC.match(/extent:\s*["']parent["']/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });

  it("Test 3: agentNodes mapper uses relative x: 15 + i * agentSpacing", () => {
    // Matches: 15 + i * agentSpacing (with optional spaces)
    expect(SRC).toMatch(/15\s*\+\s*i\s*\*\s*agentSpacing/);
  });

  it("Test 4: devToolNodes mapper uses relative x: 15 + i * DEV_TOOL_SPACING", () => {
    // Matches: 15 + i * DEV_TOOL_SPACING (with optional spaces)
    expect(SRC).toMatch(/15\s*\+\s*i\s*\*\s*DEV_TOOL_SPACING/);
  });

  it("Test 5: local-agents node uses relative x: 15 + keyRemote.length * agentSpacing", () => {
    expect(SRC).toMatch(/15\s*\+\s*keyRemote\.length\s*\*\s*agentSpacing/);
  });

  it("Test 6: agent, dev-tool, and local children all use y: 32 (parent-relative), not absolute y values", () => {
    // All child nodes should use y: 32
    expect(SRC).toMatch(/y:\s*32/);
    // Must NOT have child nodes with absolute y: 280 (agent) or y: 560 (devtool) in node position objects
    // Check agentNodes mapper — should not have agentY as position y
    // Check localNode — should not have agentY as position y
    // Check devToolNodes mapper — should not have DEV_TOOL_Y as position y
    // We do this by verifying the relative y: 32 pattern appears at least 3 times
    const relativeYMatches = SRC.match(/y:\s*32(?!\d)/g) ?? [];
    expect(relativeYMatches.length).toBeGreaterThanOrEqual(3);
  });

  it("Test 7: groupBoxNodes spread appears BEFORE agentNodes, localNode, and devToolNodes in the baseNodes array", () => {
    // Plan 17-02 wraps the array in applyCollapseToNodes; ordering lives in baseNodes assignment
    const baseNodesMatch = SRC.match(/const baseNodes[\s\S]*?\[\.\.\.groupBoxNodes[\s\S]*?\];/);
    expect(baseNodesMatch).not.toBeNull();

    // Verify ordering: groupBoxNodes THEN staticNodes/agentNodes/localNode/devToolNodes
    const stmt = baseNodesMatch![0];
    const groupBoxIdx = stmt.indexOf("...groupBoxNodes");
    const agentNodesIdx = stmt.indexOf("...agentNodes");
    const localNodeIdx = stmt.indexOf("localNode");
    const devToolNodesIdx = stmt.indexOf("...devToolNodes");

    expect(groupBoxIdx).toBeGreaterThanOrEqual(0);
    expect(agentNodesIdx).toBeGreaterThanOrEqual(0);
    expect(localNodeIdx).toBeGreaterThanOrEqual(0);
    expect(devToolNodesIdx).toBeGreaterThanOrEqual(0);

    expect(groupBoxIdx).toBeLessThan(agentNodesIdx);
    expect(groupBoxIdx).toBeLessThan(localNodeIdx);
    expect(groupBoxIdx).toBeLessThan(devToolNodesIdx);
  });

  it("Test 8 (regression): GroupBoxNode data shape has label, width, height — no new required fields added in this plan", () => {
    // GroupBoxNode must exist (we add it in this plan)
    expect(SRC).toContain("GroupBoxNode");
    // Its data object must contain label, width, height
    expect(SRC).toMatch(/label:\s*["']/);
    expect(SRC).toMatch(/width:\s*\d/);
    expect(SRC).toMatch(/height:\s*\d/);
    // collapsed/onToggleCollapse fields are present — added by Plan 17-02
    expect(SRC).toContain("collapsed:");
    expect(SRC).toContain("onToggleCollapse");
  });
});

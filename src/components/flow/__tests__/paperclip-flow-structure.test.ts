/**
 * paperclip-flow-structure.test.ts
 *
 * File-introspection tests that lock in the Paperclip fleet wiring invariants.
 * Uses the same readFileSync + string/regex assertion pattern as parent-id-migration.test.ts.
 *
 * All 6 tests must be RED before Task 2 and GREEN after Task 2.
 *
 * Tests:
 *   Test 1 (PAPER-01): react-flow-canvas.tsx contains a group-paperclip group box node
 *   Test 2 (PAPER-01): Paperclip child nodes use parentId: "group-paperclip" and extent: "parent"
 *   Test 3: manager remains in the main path and is NOT assigned parentId: "group-paperclip"
 *   Test 4 (PAPER-01): collapsed summary references live fleet data (not a hard-coded string)
 *   Test 5 (DASH-03): node-detail-panel.tsx renders PaperclipFleetPanel when nodeId is manager
 *   Test 6: flow/page.tsx imports usePaperclipFleet and passes paperclipFleet into child components
 */

import { readFileSync } from "fs";
import { join } from "path";

// ── Source file reads ──────────────────────────────────────────────────────

const CANVAS_SRC = readFileSync(
  join(__dirname, "../react-flow-canvas.tsx"),
  "utf-8"
);

const PANEL_SRC = readFileSync(
  join(__dirname, "../node-detail-panel.tsx"),
  "utf-8"
);

const PAGE_SRC = readFileSync(
  join(__dirname, "../../../app/flow/page.tsx"),
  "utf-8"
);

// ── Tests ──────────────────────────────────────────────────────────────────

describe("Paperclip fleet flow structure invariants", () => {
  it("Test 1 (PAPER-01): react-flow-canvas.tsx contains a group-paperclip group box node", () => {
    // The canvas must define a node with id "group-paperclip"
    expect(CANVAS_SRC).toContain('"group-paperclip"');
    // It must use the groupBoxNode type
    expect(CANVAS_SRC).toMatch(/id:\s*["']group-paperclip["'][\s\S]*?type:\s*["']groupBoxNode["']|type:\s*["']groupBoxNode["'][\s\S]*?id:\s*["']group-paperclip["']/);
  });

  it("Test 2 (PAPER-01): Paperclip child nodes use parentId: 'group-paperclip' and extent: 'parent'", () => {
    // Child nodes must wire to the group via parentId
    expect(CANVAS_SRC).toContain('parentId: "group-paperclip"');
    // And must use the parent-extent constraint to stay inside the box
    // Count total extent: "parent" occurrences — should be at least 3 (agents, devtools, paperclip children)
    const extentMatches = CANVAS_SRC.match(/extent:\s*["']parent["']/g) ?? [];
    expect(extentMatches.length).toBeGreaterThanOrEqual(3);
  });

  it("Test 3: manager remains in the main path and is NOT assigned parentId: 'group-paperclip'", () => {
    // The manager node id must exist in the canvas (it's a static node)
    expect(CANVAS_SRC).toContain('"manager"');

    // Critically: manager must NOT have parentId pointing to group-paperclip
    // We check that no block containing id: "manager" has parentId: "group-paperclip" near it
    // Strategy: look for the staticNodes array — manager should be there, not in a grouped mapper
    expect(CANVAS_SRC).toContain('id: "manager"');

    // The safest structural check: "manager" should appear in staticNodes (defined without parentId)
    // Verify the manager node definition does NOT immediately follow parentId: "group-paperclip"
    const paperclipParentPattern = /parentId:\s*["']group-paperclip["'][^}]*id:\s*["']manager["']|id:\s*["']manager["'][^}]*parentId:\s*["']group-paperclip["']/;
    expect(CANVAS_SRC).not.toMatch(paperclipParentPattern);
  });

  it("Test 4 (PAPER-01): collapsed summary references live fleet data (not a hard-coded string)", () => {
    // The paperclip group node's aggregateColor must be derived from paperclipFleet/paperclipStatuses
    // Not a hard-coded color string like "#64748b" or "dormant"
    expect(CANVAS_SRC).toMatch(/paperclipStatuses|paperclipFleet.*agents/);
    // aggregateHealthColor must be called with the dynamic statuses
    expect(CANVAS_SRC).toMatch(/aggregateHealthColor\s*\(\s*paperclipStatuses/);
  });

  it("Test 5 (DASH-03): node-detail-panel.tsx renders PaperclipFleetPanel when nodeId is manager", () => {
    // The panel must import PaperclipFleetPanel
    expect(PANEL_SRC).toContain("PaperclipFleetPanel");
    // It must conditionally render it for the manager node
    expect(PANEL_SRC).toMatch(/nodeId\s*===\s*["']manager["']/);
    // It must render the component (JSX)
    expect(PANEL_SRC).toContain("<PaperclipFleetPanel");
  });

  it("Test 6: flow/page.tsx imports usePaperclipFleet and passes paperclipFleet into child components", () => {
    // The page must import usePaperclipFleet
    expect(PAGE_SRC).toContain("usePaperclipFleet");
    // It must invoke it (hook call)
    expect(PAGE_SRC).toMatch(/usePaperclipFleet\s*\(/);
    // paperclipFleet must be passed as a prop
    expect(PAGE_SRC).toContain("paperclipFleet");
    // It must appear in the ReactFlowCanvas JSX
    expect(PAGE_SRC).toMatch(/ReactFlowCanvas[\s\S]*?paperclipFleet|paperclipFleet[\s\S]*?ReactFlowCanvas/);
  });
});

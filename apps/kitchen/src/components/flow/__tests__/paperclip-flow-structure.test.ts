/**
 * paperclip-flow-structure.test.ts
 *
 * File-introspection tests that lock in the Paperclip fleet wiring invariants.
 * Uses the same readFileSync + string/regex assertion pattern as parent-id-migration.test.ts.
 *
 * Design: fleet detail lives in the NodeDetailPanel only (no group box in the canvas).
 *
 * Tests:
 *   Test 1: manager node exists in the main canvas path
 *   Test 2: react-flow-canvas.tsx does NOT render a group-paperclip group box
 *   Test 3: manager remains in the main path and is NOT assigned parentId: "group-paperclip"
 *   Test 4: flow/page.tsx wires usePaperclipFleet and passes fleet data to NodeDetailPanel
 *   Test 5 (DASH-03): node-detail-panel.tsx renders PaperclipFleetPanel when nodeId is manager
 *   Test 6: PaperclipFleetPanel is wired with fleet and loading props
 *   Test 7: Tool Gateway lives in the Dev Tools group and detail panel
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
  it("Test 1: manager node exists in the main canvas path", () => {
    expect(CANVAS_SRC).toContain('id: "manager"');
  });

  it("Test 2: react-flow-canvas.tsx does NOT render a group-paperclip group box", () => {
    // Fleet lives in the detail panel only — no canvas group box
    expect(CANVAS_SRC).not.toContain('"group-paperclip"');
  });

  it("Test 3: manager remains in the main path and is NOT assigned parentId: 'group-paperclip'", () => {
    expect(CANVAS_SRC).toContain('id: "manager"');
    const paperclipParentPattern = /parentId:\s*["']group-paperclip["'][^}]*id:\s*["']manager["']|id:\s*["']manager["'][^}]*parentId:\s*["']group-paperclip["']/;
    expect(CANVAS_SRC).not.toMatch(paperclipParentPattern);
  });

  it("Test 4: flow/page.tsx wires usePaperclipFleet and passes fleet data to NodeDetailPanel", () => {
    expect(PAGE_SRC).toContain("usePaperclipFleet");
    expect(PAGE_SRC).toMatch(/usePaperclipFleet\s*\(/);
    // Fleet data flows to NodeDetailPanel, not ReactFlowCanvas
    expect(PAGE_SRC).toContain("paperclipFleet");
    expect(PAGE_SRC).toMatch(/NodeDetailPanel[\s\S]*?paperclipFleet|paperclipFleet[\s\S]*?NodeDetailPanel/);
  });

  it("Test 5 (DASH-03): node-detail-panel.tsx renders PaperclipFleetPanel when nodeId is manager", () => {
    expect(PANEL_SRC).toContain("PaperclipFleetPanel");
    expect(PANEL_SRC).toMatch(/nodeId\s*===\s*["']manager["']/);
    expect(PANEL_SRC).toContain("<PaperclipFleetPanel");
  });

  it("Test 6: PaperclipFleetPanel is wired with fleet and loading props", () => {
    expect(PANEL_SRC).toMatch(/fleet=\{/);
    expect(PANEL_SRC).toMatch(/isLoading=\{/);
  });

  it("Test 7: Tool Gateway lives in Dev Tools and has detail stats", () => {
    expect(CANVAS_SRC).toContain('id: "tool-gateway"');
    expect(CANVAS_SRC).toContain('"agents-tools"');
    expect(PANEL_SRC).toMatch(/nodeId\s*===\s*["']tool-gateway["']/);
    expect(PAGE_SRC).toContain("useToolAttention");
  });
});

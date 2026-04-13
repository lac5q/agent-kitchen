import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("react-flow-canvas edge structure", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/flow/react-flow-canvas.tsx"),
    "utf8"
  );

  it("fitViewOptions includes duration: 200 and padding: 0.2", () => {
    // Both must be present in the fitViewOptions prop
    expect(src).toMatch(/fitViewOptions=\{\{[^}]*padding:\s*0\.2/);
    expect(src).toMatch(/fitViewOptions=\{\{[^}]*duration:\s*200/);
  });

  it("both smoothstep and straight edge types are present", () => {
    // The codebase should use both types (not a single blanket replacement)
    expect(src).toContain('type: "smoothstep"');
    expect(src).toContain('type: "straight"');
  });

  it("all animated: true occurrences are adjacent to EDGE_COLORS.request", () => {
    const lines = src.split("\n");
    const animatedTrueLines = lines
      .map((line, i) => ({ line, i }))
      .filter(({ line }) => line.includes("animated: true"));

    // Every animated: true must be in the context of a request-colored edge
    for (const { i } of animatedTrueLines) {
      const context = lines.slice(Math.max(0, i - 3), i + 4).join(" ");
      expect(context).toContain("EDGE_COLORS.request");
    }
  });

  it("container height uses responsive min() expression", () => {
    expect(src).toMatch(/height:\s*["']min\(900px/);
  });
});

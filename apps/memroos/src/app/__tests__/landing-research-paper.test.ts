// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(path.resolve(__dirname, "../page.tsx"), "utf8");
const paperPath = path.resolve(
  __dirname,
  "../../../public/research/memroos-governed-knowledge-architecture-paper.pdf"
);
const faviconPath = path.resolve(__dirname, "../favicon.ico");
const iconSvgPath = path.resolve(__dirname, "../icon.svg");

describe("public landing research proof", () => {
  it("keeps the public landing focused on the top three feature priorities", () => {
    expect(pageSource).toContain("The top three MemroOS features");
    expect(pageSource).toContain("Memory every agent can use");
    expect(pageSource).toContain("Governed orchestration");
    expect(pageSource).toContain("Interop plus evidence");
    expect(pageSource).not.toContain("Top 5 value features");
    expect(pageSource).not.toContain("Full feature map");
  });

  it("links the governed knowledge architecture paper from the benchmark proof area", () => {
    expect(pageSource).toContain("/research/memroos-governed-knowledge-architecture-paper.pdf");
    expect(pageSource).toContain("Read the research paper");
    expect(pageSource).toContain("governed knowledge architecture");
  });

  it("uses a direct Google Calendar schedule link instead of an embeddable iframe", () => {
    expect(pageSource).toContain("Schedule on Google Calendar");
    expect(pageSource).toContain("Google blocks this appointment scheduler inside many embedded iframes");
    expect(pageSource).not.toContain("<iframe");
  });

  it("ships the research paper as a public static asset", () => {
    expect(existsSync(paperPath)).toBe(true);
  });

  it("uses the kangaroo mark for browser icons", () => {
    expect(existsSync(iconSvgPath)).toBe(true);

    const iconSvg = readFileSync(iconSvgPath, "utf8");
    expect(iconSvg).toContain("MemroOS stylized kangaroo favicon");
    expect(iconSvg).toContain("#a8392c");
    expect(iconSvg).not.toContain("🦘");

    const favicon = readFileSync(faviconPath);
    expect(Array.from(favicon.subarray(0, 4))).toEqual([0, 0, 1, 0]);
    expect(favicon.length).toBeGreaterThan(1000);
  });
});

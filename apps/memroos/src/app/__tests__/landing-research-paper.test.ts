// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(path.resolve(__dirname, "../page.tsx"), "utf8");
const paperPath = path.resolve(
  __dirname,
  "../../../public/research/memroos-governed-knowledge-architecture-paper.pdf"
);
const landingIndexPath = path.resolve(__dirname, "../../../public/landing/index.html");
const growthAlchemyStylePath = path.resolve(
  __dirname,
  "../../../public/landing/styles/growthalchemy.css"
);
const askStylePath = path.resolve(__dirname, "../../../public/landing/styles/ask.css");
const memroosRefreshStylePath = path.resolve(
  __dirname,
  "../../../public/landing/styles/memroos-refresh.css"
);
const landingStylePaths = [
  "../../../public/landing/styles/growthalchemy.css",
  "../../../public/landing/styles/ask.css",
  "../../../public/landing/styles/memroos-refresh.css",
].map((relativePath) => path.resolve(__dirname, relativePath));
const landingScriptPaths = [
  "../../../public/landing/scripts/motion.js",
  "../../../public/landing/scripts/graph3d.js",
  "../../../public/landing/scripts/ask-memroos.js",
].map((relativePath) => path.resolve(__dirname, relativePath));
const productShotPaths = [
  "../../../public/landing/assets/shots/operator-floor.png",
  "../../../public/landing/assets/shots/memory-inventory.png",
  "../../../public/landing/assets/shots/dispatch.png",
  "../../../public/landing/assets/shots/skills.png",
].map((relativePath) => path.resolve(__dirname, relativePath));
const faviconPath = path.resolve(__dirname, "../favicon.ico");
const iconSvgPath = path.resolve(__dirname, "../icon.svg");
const llmsPath = path.resolve(__dirname, "../../../public/llms.txt");
const llmsFullPath = path.resolve(__dirname, "../../../public/llms-full.txt");

const publicIndexUrls = [
  "https://memroos.com",
  "https://memroos.com/platform",
  "https://memroos.com/use-cases/product",
  "https://memroos.com/use-cases/sales",
  "https://memroos.com/use-cases/engineering",
  "https://memroos.com/blog",
  "https://memroos.com/blog/what-is-agent-memory",
  "https://memroos.com/blog/agentic-memory-architecture",
  "https://memroos.com/blog/ai-agent-context-management",
  "https://memroos.com/blog/ai-agent-persistent-memory",
  "https://memroos.com/blog/engineering-ai-memory",
  "https://memroos.com/blog/sales-ai-agent-memory",
  "https://memroos.com/blog/governed-agent-memory-enterprise",
  "https://memroos.com/blog/mcp-memory-layer",
  "https://memroos.com/blog/agent-orchestration-audit-trail",
  "https://memroos.com/blog/agentic-memory-benchmark",
  "https://memroos.com/blog/memroos-vs-letta",
  "https://memroos.com/blog/memroos-vs-zep",
  "https://memroos.com/vs/letta",
  "https://memroos.com/vs/zep",
  "https://memroos.com/vs/midbrain",
  "https://memroos.com/vs/gbrain",
  "https://memroos.com/vs/evermemos",
  "https://memroos.com/vs/axme",
  "https://memroos.com/vs/agenticmemory",
  "https://memroos.com/vs/worldflow",
  "https://memroos.com/vs/tytan",
];

describe("public landing research proof", () => {
  it("keeps the public landing focused on the top three feature priorities", () => {
    expect(pageSource).toContain("The control layer MemroOS gives back to your team");
    expect(pageSource).toContain("Control your memory");
    expect(pageSource).toContain("Control the harness");
    expect(pageSource).toContain("Control your moat");
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

  it("ships the extracted Claude Design landing source and product captures", () => {
    expect(existsSync(landingIndexPath)).toBe(true);
    for (const assetPath of [...landingStylePaths, ...landingScriptPaths, ...productShotPaths]) {
      expect(existsSync(assetPath)).toBe(true);
    }

    const landingSource = readFileSync(landingIndexPath, "utf8");
    expect(landingSource).toContain("See the actual product");
    expect(landingSource).toContain('<link rel="canonical" href="https://memroos.com/">');
    expect(landingSource).toContain("data-shot=\"dispatch\"");
    expect(landingSource).toContain("/landing/assets/shots/operator-floor.png");
    expect(landingSource).toContain("/landing/styles/memroos-refresh.css");
    expect(landingSource).toContain("/landing/scripts/ask-memroos.js");
    expect(landingSource).toContain("https://github.com/lac5q/memroos");
    expect(landingSource).toContain("https://calendar.google.com/calendar/appointments/schedules/");
    expect(landingSource).not.toContain("__bundler/manifest");
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

  it("keeps LLM crawler index files aligned with public pages", () => {
    expect(existsSync(llmsPath)).toBe(true);
    expect(existsSync(llmsFullPath)).toBe(true);

    const llmsSource = readFileSync(llmsPath, "utf8");
    const llmsFullSource = readFileSync(llmsFullPath, "utf8");

    for (const url of publicIndexUrls) {
      expect(llmsSource).toContain(url);
      expect(llmsFullSource).toContain(url);
    }

    expect(llmsSource).toContain("https://memroos.com/sitemap.xml");
    expect(llmsFullSource).toContain("https://memroos.com/llms.txt");
  });

  it("keeps primary CTAs ink-first with signal only as an accent", () => {
    const growthAlchemySource = readFileSync(growthAlchemyStylePath, "utf8");
    const askSource = readFileSync(askStylePath, "utf8");
    const memroosRefreshSource = readFileSync(memroosRefreshStylePath, "utf8");

    expect(growthAlchemySource).toContain(".brand-lockup {");
    expect(growthAlchemySource).toContain("background: #fff; color: var(--ink-900);");
    expect(growthAlchemySource).toContain(
      ".btn--solid:hover { background: var(--ink-800); box-shadow: inset 0 -3px 0 var(--signal); }"
    );
    expect(growthAlchemySource).toContain(
      ".mm-cta:hover { background: var(--ink-800); box-shadow: inset 0 -3px 0 var(--signal); }"
    );
    expect(askSource).toContain(
      ".ask-form button:hover { background: var(--ink-800); box-shadow: inset 0 -3px 0 var(--signal); }"
    );
    expect(memroosRefreshSource).toContain(
      ".ctl.on { background: var(--ink-900); color: #fff; box-shadow: inset 0 -3px 0 var(--signal); }"
    );
    expect(growthAlchemySource).not.toContain(".btn--solid:hover { background: var(--signal); }");
    expect(growthAlchemySource).not.toContain(".mm-cta:hover { background: var(--signal); }");
    expect(askSource).not.toContain(".ask-form button:hover { background: var(--signal); }");
    expect(memroosRefreshSource).not.toContain(".ctl.on { background: var(--signal); color: #fff; }");
  });
});

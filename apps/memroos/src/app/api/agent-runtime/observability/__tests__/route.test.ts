// @vitest-environment node
import { existsSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { buildObservabilityModel, renderObservabilityHtml, writeObservabilityDashboard } from "@/lib/agent-runtime/observability";

let tempRoot: string | null = null;
const originalHome = process.env.HOME;

const { GET } = await import("../route");

afterEach(() => {
  if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
  tempRoot = null;
  process.env.HOME = originalHome;
});

describe("agent runtime observability API", () => {
  it("blocks direct non-local dashboard reads without operator authorization", async () => {
    const res = await GET(new Request("https://memroos.example.com/api/agent-runtime/observability") as any);

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({
      ok: false,
      error: "Registry write authorization required",
    });
  });

  it("returns an offline HTML dashboard from Hermes logs", async () => {
    tempRoot = mkdtempSync(path.join(tmpdir(), "hermes-observability-"));
    mkdirSync(path.join(tempRoot, "logs"), { recursive: true });
    writeFileSync(
      path.join(tempRoot, "logs", "tool-outcomes.jsonl"),
      JSON.stringify({
        timestamp: "2026-01-01T00:00:00.000Z",
        tool: "browser-use",
        success: true,
        duration_ms: 12,
      }) + "\n"
    );

    const res = await GET(new Request(`http://localhost/api/agent-runtime/observability?root=${encodeURIComponent(tempRoot)}`) as any);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("Runtime Sessions");
    expect(html).toContain("browser-use");
  });

  it("uses the default Hermes root for local authorized requests without a root parameter", async () => {
    tempRoot = mkdtempSync(path.join(tmpdir(), "hermes-default-"));
    process.env.HOME = tempRoot;
    mkdirSync(path.join(tempRoot, ".hermes", "logs"), { recursive: true });
    writeFileSync(
      path.join(tempRoot, ".hermes", "logs", "tool-outcomes.jsonl"),
      JSON.stringify({
        timestamp: "2026-01-01T00:00:00.000Z",
        tool: "default-root-tool",
        success: false,
        errorType: "boom",
        duration_ms: 1500,
      }) + "\n"
    );

    const res = await GET(new Request("http://localhost/api/agent-runtime/observability") as any);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("default-root-tool");
  });

  it("builds a safe empty model for missing or malformed logs", () => {
    tempRoot = mkdtempSync(path.join(tmpdir(), "hermes-empty-"));

    expect(buildObservabilityModel(tempRoot)).toMatchObject({
      sessions: [],
      summary: { sessions: 0, toolCalls: 0, errors: 0, errorRate: 0 },
    });

    mkdirSync(path.join(tempRoot, "logs"), { recursive: true });
    writeFileSync(path.join(tempRoot, "logs", "tool-outcomes.jsonl"), "{bad json\n");
    expect(buildObservabilityModel(tempRoot).summary.toolCalls).toBe(0);
  });

  it("escapes rendered HTML and writes the dashboard file", () => {
    tempRoot = mkdtempSync(path.join(tmpdir(), "hermes-html-"));
    mkdirSync(path.join(tempRoot, "logs"), { recursive: true });
    writeFileSync(
      path.join(tempRoot, "logs", "tool-outcomes.jsonl"),
      JSON.stringify({
        timestamp: "<script>alert(1)</script>",
        tool: "tool<&\"'",
        success: false,
        duration_ms: 2000,
      }) + "\n"
    );

    const html = renderObservabilityHtml(tempRoot);
    expect(html).toContain("tool&lt;&amp;&quot;&#39;");
    expect(html).not.toContain("<script>alert(1)</script>");
    const output = writeObservabilityDashboard(tempRoot);
    expect(output).toBe(path.join(tempRoot, "observability", "index.html"));
    expect(existsSync(output)).toBe(true);
  });
});

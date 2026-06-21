// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

let tempRoot: string | null = null;

const { GET } = await import("../route");

afterEach(() => {
  if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
  tempRoot = null;
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
});

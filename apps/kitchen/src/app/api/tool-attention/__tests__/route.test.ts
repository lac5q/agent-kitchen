// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/tool-attention", () => ({
  getToolAttention: vi.fn(() => ({
    summary: { totalCapabilities: 1, topLevelTools: 1, workspaces: 0, sources: 1, recentOutcomes: 0 },
    capabilities: [],
    recentOutcomes: [],
    recommendations: [],
    sources: [],
    health: { status: "ok", catalogPath: "/tmp/catalog.json", outcomesPath: "/tmp/outcomes.jsonl", messages: [] },
    timestamp: "2026-04-30T00:00:00.000Z",
  })),
}));

const { GET } = await import("../route");
const { getToolAttention } = await import("@/lib/tool-attention");

describe("GET /api/tool-attention", () => {
  it("passes query and limit to getToolAttention", async () => {
    const req = new NextRequest("http://localhost/api/tool-attention?q=mcp&limit=7");
    const res = await GET(req);
    const body = await res.json();

    expect(getToolAttention).toHaveBeenCalledWith("mcp", 7);
    expect(body.summary.totalCapabilities).toBe(1);
  });

  it("falls back to default limit when limit is invalid", async () => {
    const req = new NextRequest("http://localhost/api/tool-attention?limit=nope");
    await GET(req);

    expect(getToolAttention).toHaveBeenCalledWith("", 25);
  });
});

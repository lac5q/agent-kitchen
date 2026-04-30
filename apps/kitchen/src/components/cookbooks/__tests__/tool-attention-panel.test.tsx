import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/lib/api-client", () => ({
  useToolAttention: vi.fn(),
}));

import { ToolAttentionPanel } from "@/components/cookbooks/tool-attention-panel";
import { useToolAttention } from "@/lib/api-client";

const mockUseToolAttention = vi.mocked(useToolAttention);

function makeData() {
  return {
    summary: { totalCapabilities: 3, topLevelTools: 1, workspaces: 1, sources: 2, recentOutcomes: 0 },
    capabilities: [
      {
        id: "mcp-server:gitnexus",
        name: "gitnexus",
        type: "mcp-server",
        source: "root-mcp-json",
        description: "Code graph MCP server",
        status: "available" as const,
        tags: ["mcp"],
        useWhen: ["Need code graph"],
        topLevel: true,
        loadCommand: "Use MCP server gitnexus",
      },
      {
        id: "knowledge-workspace:tool-attention",
        name: "tool-attention",
        type: "workspace",
        source: "knowledge-system",
        description: "Progressive discovery",
        status: "available" as const,
        tags: ["workspace"],
        useWhen: ["Need tools"],
        topLevel: false,
        loadCommand: "knowledge_open_workspace",
      },
    ],
    recentOutcomes: [],
    recommendations: [
      {
        capabilityId: "knowledge-workspace:tool-attention",
        title: "tool-attention",
        reason: "High-leverage starting point for progressive discovery.",
      },
    ],
    sources: [],
    health: {
      status: "degraded" as const,
      catalogPath: "/tmp/catalog.json",
      outcomesPath: "/tmp/outcomes.jsonl",
      messages: ["No tool outcome log has been recorded yet."],
    },
    timestamp: "2026-04-30T00:00:00.000Z",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseToolAttention.mockReturnValue({
    data: makeData(),
    isLoading: false,
  } as unknown as ReturnType<typeof useToolAttention>);
});

describe("ToolAttentionPanel", () => {
  it("renders stats, capabilities, health, and recommendations", () => {
    render(<ToolAttentionPanel />);

    expect(screen.getByText("Capabilities")).toBeTruthy();
    expect(screen.getByText("gitnexus")).toBeTruthy();
    expect(screen.getAllByText("tool-attention").length).toBeGreaterThan(0);
    expect(screen.getByText("No tool outcome log has been recorded yet.")).toBeTruthy();
    expect(screen.getByText("Recommended Loads")).toBeTruthy();
  });

  it("updates the query sent to useToolAttention", () => {
    render(<ToolAttentionPanel />);

    fireEvent.change(screen.getByLabelText("Search tool capabilities"), {
      target: { value: "memory" },
    });

    expect(mockUseToolAttention).toHaveBeenLastCalledWith("memory");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/api-client", () => ({
  useSkills: vi.fn(),
  useToolAttention: vi.fn(),
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) => (
      <div {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/skill-heatmap", () => ({
  SkillHeatmap: () => <div data-testid="skill-heatmap">Contribution Activity</div>,
}));

vi.mock("../paperclip-fleet-panel", () => ({
  PaperclipFleetPanel: ({ isLoading }: { isLoading: boolean }) => (
    <div data-testid="paperclip-fleet">{isLoading ? "loading fleet" : "fleet ready"}</div>
  ),
}));

import { NodeDetailPanel } from "../node-detail-panel";
import { useSkills, useToolAttention } from "@/lib/api-client";

const mockUseSkills = vi.mocked(useSkills);
const mockUseToolAttention = vi.mocked(useToolAttention);

const DEFAULT_PROPS = {
  nodeLabel: "Test Node",
  nodeIcon: "🔧",
  nodeStats: { Requests: 12, Errors: 1 },
  events: [],
  onClose: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    }),
  );
  mockUseSkills.mockReturnValue({
    data: {
      totalSkills: 0,
      contributionHistory: [],
      coverageGaps: [],
      failuresByAgent: {},
    },
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useSkills>);
  mockUseToolAttention.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useToolAttention>);
});

describe("NodeDetailPanel", () => {
  it("renders stats and closes when the close button is clicked", () => {
    const onClose = vi.fn();
    render(<NodeDetailPanel {...DEFAULT_PROPS} nodeId="claude" onClose={onClose} />);

    expect(screen.getByText("Requests")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close node detail panel" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("renders manager fleet panel and paperclip loading state", () => {
    render(
      <NodeDetailPanel
        {...DEFAULT_PROPS}
        nodeId="manager"
        paperclipFleet={null}
        paperclipLoading
      />,
    );

    expect(screen.getByTestId("paperclip-fleet")).toHaveTextContent("loading fleet");
  });

  it("overrides cookbooks stats from live skills data and shows the heatmap", () => {
    mockUseSkills.mockReturnValue({
      data: {
        totalSkills: 9,
        coverageGaps: ["gap-a"],
        failuresByAgent: { codex: 2 },
        contributionHistory: [],
      },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useSkills>);

    render(
      <NodeDetailPanel
        {...DEFAULT_PROPS}
        nodeId="cookbooks"
        nodeLabel="Cookbooks"
        nodeStats={{ Skills: 1 }}
      />,
    );

    expect(screen.getByText("9")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByTestId("skill-heatmap")).toBeInTheDocument();
  });

  it("shows tool-gateway recommendations and derived stats", () => {
    mockUseToolAttention.mockReturnValue({
      data: {
        summary: {
          totalCapabilities: 14,
          topLevelTools: 6,
          workspaces: 3,
          recentOutcomes: 5,
        },
        recommendations: [
          { capabilityId: "cap-1", title: "Load deploy tools", reason: "Recent failures" },
        ],
        capabilities: [],
        recentOutcomes: [],
        sources: [],
        health: { status: "ok", catalog: "available", outcomes: "available", messages: [] },
        timestamp: "2026-07-13T12:00:00.000Z",
      },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useToolAttention>);

    render(
      <NodeDetailPanel
        {...DEFAULT_PROPS}
        nodeId="tool-gateway"
        nodeLabel="Tool Gateway"
        nodeStats={{}}
      />,
    );

    expect(screen.getByText("14")).toBeInTheDocument();
    expect(screen.getByText("Load deploy tools")).toBeInTheDocument();
    expect(screen.getByText(/Recent failures/)).toBeInTheDocument();
  });

  it("renders A2A connection details for registered agents", () => {
    render(
      <NodeDetailPanel
        {...DEFAULT_PROPS}
        nodeId="agent-remote-1"
        nodeLabel="Remote Agent"
        registeredAgents={[
          {
            id: "remote-1",
            name: "Remote Agent",
            status: "active",
            latencyMs: 42,
            location: "remote",
            protocol: "a2a",
            platform: "codex",
            currentTask: "sync inventory",
            metadata: {
              a2a: {
                endpointUrl: "https://agent.example.com/v1",
                version: "0.2.1",
                securitySchemes: { bearer: { type: "http", scheme: "bearer" } },
                streaming: true,
                lastFetchedAt: "2026-07-13T11:00:00.000Z",
                source: "adk",
                inputModes: ["text"],
                outputModes: ["text"],
                latestTaskState: "working",
              },
            },
          },
        ]}
      />,
    );

    expect(screen.getByText("A2A connection")).toBeInTheDocument();
    expect(screen.getAllByText("ADK").length).toBeGreaterThan(0);
    expect(screen.getByText("agent.example.com")).toBeInTheDocument();
    expect(screen.getByText("sync inventory")).toBeInTheDocument();
    expect(screen.getByText("working")).toBeInTheDocument();
  });

  it("loads heartbeat content and renders matched activity events", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: "heartbeat: healthy" }),
    } as Response);

    const now = Date.now();
    render(
      <NodeDetailPanel
        {...DEFAULT_PROPS}
        nodeId="claude"
        events={[
          {
            id: "evt-1",
            timestamp: new Date(now - 5 * 60_000).toISOString(),
            node: "claude",
            type: "request",
            message: "Handled operator prompt",
            severity: "info",
          },
        ]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("heartbeat: healthy")).toBeInTheDocument();
    });
    expect(screen.getByText("Handled operator prompt")).toBeInTheDocument();
    expect(screen.getAllByTestId("node-event")).toHaveLength(1);
  });

  it("shows limited-activity copy for sparse nodes without events", () => {
    render(<NodeDetailPanel {...DEFAULT_PROPS} nodeId="qdrant" nodeLabel="Qdrant" />);

    expect(screen.getByLabelText("limited-activity-data")).toHaveTextContent(
      /Limited activity data for this node type/i,
    );
  });
});

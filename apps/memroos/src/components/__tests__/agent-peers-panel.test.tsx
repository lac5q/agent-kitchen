// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/api-client", () => ({
  useAgentPeers: vi.fn(),
}));

import { useAgentPeers } from "@/lib/api-client";
import { AgentPeersPanel } from "@/components/memroos/agent-peers-panel";

const mockUseAgentPeers = vi.mocked(useAgentPeers);

const SAMPLE_PEERS = [
  {
    agent_id: "hermes",
    current_task: "Running plan 23-02",
    status: "continue",
    last_seen: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
  },
  {
    agent_id: "gwen",
    current_task: "Processing memory consolidation",
    status: "checkpoint",
    last_seen: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AgentPeersPanel", () => {
  it("renders peer agent IDs", () => {
    mockUseAgentPeers.mockReturnValue({
      data: { peers: SAMPLE_PEERS, window_minutes: 60, timestamp: new Date().toISOString() },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useAgentPeers>);

    render(<AgentPeersPanel />);
    expect(screen.getByText("hermes")).toBeTruthy();
    expect(screen.getByText("gwen")).toBeTruthy();
  });

  it("renders current_task for each peer", () => {
    mockUseAgentPeers.mockReturnValue({
      data: { peers: SAMPLE_PEERS, window_minutes: 60, timestamp: new Date().toISOString() },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useAgentPeers>);

    render(<AgentPeersPanel />);
    expect(screen.getByText("Running plan 23-02")).toBeTruthy();
    expect(screen.getByText("Processing memory consolidation")).toBeTruthy();
  });

  it("renders last_seen as relative time", () => {
    mockUseAgentPeers.mockReturnValue({
      data: { peers: SAMPLE_PEERS, window_minutes: 60, timestamp: new Date().toISOString() },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useAgentPeers>);

    render(<AgentPeersPanel />);
    // last_seen 2 min ago should render as "2m ago"
    expect(screen.getByText("2m ago")).toBeTruthy();
  });

  it("shows loading spinner when isLoading", () => {
    mockUseAgentPeers.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as ReturnType<typeof useAgentPeers>);

    const { container } = render(<AgentPeersPanel />);
    const spinner = container.querySelector(".animate-spin");
    expect(spinner).toBeTruthy();
  });

  it("shows empty state when no peers", () => {
    mockUseAgentPeers.mockReturnValue({
      data: { peers: [], window_minutes: 60, timestamp: new Date().toISOString() },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useAgentPeers>);

    render(<AgentPeersPanel />);
    expect(screen.getByText(/No active peers/)).toBeTruthy();
  });

  it("falls back for unknown statuses and non-relative timestamps", () => {
    mockUseAgentPeers.mockReturnValue({
      data: {
        peers: [
          {
            agent_id: "old-agent",
            current_task: "Archiving notes",
            status: "custom-status",
            last_seen: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
          },
          {
            agent_id: "bad-time",
            current_task: "Bad timestamp",
            status: "error",
            last_seen: "not-a-date-value",
          },
        ],
        window_minutes: 5,
        timestamp: new Date().toISOString(),
      },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useAgentPeers>);

    render(<AgentPeersPanel windowMinutes={5} />);

    expect(screen.getByText("custom-status").className).toContain("text-stone-500");
    expect(screen.getByText("3d ago")).toBeTruthy();
    expect(screen.getByText("not-a-date-value")).toBeTruthy();
  });
});

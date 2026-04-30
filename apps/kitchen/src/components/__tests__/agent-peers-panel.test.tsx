// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/api-client", () => ({
  useAgentPeers: vi.fn(),
}));

import { useAgentPeers } from "@/lib/api-client";
import { AgentPeersPanel } from "@/components/kitchen/agent-peers-panel";

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
});

import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  useAgents: vi.fn(),
  useHiveFeed: vi.fn(),
  useAgentPeers: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
  useAgents: api.useAgents,
  useHiveFeed: api.useHiveFeed,
  useAgentPeers: api.useAgentPeers,
}));

import { AgentWorkload } from "../agent-workload";

const envelope = (status: string, value: number | null, reason = "") => ({
  value,
  status,
  source: "sqlite://registered_agents",
  observedAt: "2026-07-15T12:00:00.000Z",
  freshnessMs: 1000,
  scope: { window: "lifetime", workspace: "all" },
  reason,
});

describe("AgentWorkload cross-page liveness reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reconciles the same /api/agents liveness state as /agents", async () => {
    api.useAgents.mockReturnValue({
      data: {
        agents: [
          { id: "live-1", name: "Live Agent", status: "active", liveness: { state: "live", observedAt: "2026-07-15T12:00:00.000Z", freshnessMs: 1000, source: "sqlite://registered_agents.last_heartbeat_at", reason: "fresh heartbeat" } },
          { id: "stale-1", name: "Stale Agent", status: "dormant", liveness: { state: "stale", observedAt: "2026-07-15T08:00:00.000Z", freshnessMs: 4 * 60 * 60 * 1000, source: "sqlite://registered_agents.last_heartbeat_at", reason: "14400s old" } },
          { id: "never-1", name: "Never Agent", status: "dormant", liveness: { state: "never", observedAt: null, freshnessMs: null, source: "sqlite://registered_agents.last_heartbeat_at", reason: "no observation" } },
        ],
        summary: {
          active: envelope("degraded", 1, "1 of 3 agents active; liveness degraded"),
        },
        liveness: envelope("degraded", 1, "1 live, 1 stale, 1 never of 3"),
      },
      isError: false,
      isLoading: false,
    });
    api.useHiveFeed.mockReturnValue({ data: { actions: [] }, isError: false, isLoading: false, dataUpdatedAt: "2026-07-15T12:00:00.000Z" });
    api.useAgentPeers.mockReturnValue({ data: { peers: [], window_minutes: 1440, timestamp: "2026-07-15T12:00:00.000Z" }, isError: false, isLoading: false });

    render(<AgentWorkload filters={{ window: "24h", workspace: "all" }} />);
    await waitFor(() => {
      expect(screen.getByTestId("agent-workload-liveness")).toBeInTheDocument();
    });
    const block = screen.getByTestId("agent-workload-liveness");
    expect(block.textContent).toMatch(/1 live/);
    expect(block.textContent).toMatch(/1 stale/);
    expect(block.textContent).toMatch(/1 never/);
    expect(block.textContent).toMatch(/1 live, 1 stale, 1 never of 3/);
  });

  it("never renders an agent with no observation as active or zero workload", async () => {
    api.useAgents.mockReturnValue({
      data: {
        agents: [
          { id: "never-1", name: "Never Agent", status: "dormant", liveness: { state: "never", observedAt: null, freshnessMs: null, source: "sqlite://registered_agents.last_heartbeat_at", reason: "no observation" } },
        ],
        summary: {
          active: envelope("stale", 0, "All 1 agents have stale observations"),
        },
        liveness: envelope("stale", 0, "All 1 registered agents have stale observations"),
      },
      isError: false,
      isLoading: false,
    });
    api.useHiveFeed.mockReturnValue({ data: { actions: [] }, isError: false, isLoading: false, dataUpdatedAt: "2026-07-15T12:00:00.000Z" });
    api.useAgentPeers.mockReturnValue({ data: { peers: [], window_minutes: 1440, timestamp: "2026-07-15T12:00:00.000Z" }, isError: false, isLoading: false });

    render(<AgentWorkload filters={{ window: "24h", workspace: "all" }} />);
    await waitFor(() => {
      expect(screen.getByTestId("agent-workload-liveness")).toBeInTheDocument();
    });
    const block = screen.getByTestId("agent-workload-liveness");
    expect(block.textContent).toMatch(/never/);
    expect(block.textContent).not.toMatch(/\b1 active\b/);
  });

  it("falls back to peers when /api/agents fails", async () => {
    api.useAgents.mockReturnValue({
      data: undefined,
      isError: true,
      error: new Error("agents unavailable"),
      isLoading: false,
    });
    api.useHiveFeed.mockReturnValue({ data: { actions: [] }, isError: false, isLoading: false, dataUpdatedAt: "2026-07-15T12:00:00.000Z" });
    api.useAgentPeers.mockReturnValue({ data: { peers: [{ agent_id: "p1" }, { agent_id: "p2" }], window_minutes: 1440, timestamp: "2026-07-15T12:00:00.000Z" }, isError: false, isLoading: false });

    render(<AgentWorkload filters={{ window: "24h", workspace: "all" }} />);
    await waitFor(() => {
      expect(screen.getByText(/cross-page liveness reconciliation unavailable/i)).toBeInTheDocument();
    });
  });
});

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  useSecurityCapabilities: vi.fn(),
}));

vi.mock("@/lib/api-client", () => api);

import { AgentSecurityModesPanel } from "../agent-security-modes-panel";

const envelope = (value: number, status: "live" | "zero" = "live") => ({
  value,
  status,
  source: "sqlite://registered_agents",
  observedAt: "2026-07-18T10:00:00.000Z",
  freshnessMs: 1000,
  scope: { window: "lifetime", workspace: "all" },
  reason: `${value} measured`,
});

describe("AgentSecurityModesPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading and error states from the capabilities source", () => {
    api.useSecurityCapabilities.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    });
    const { rerender } = render(<AgentSecurityModesPanel />);
    expect(document.querySelector(".animate-spin")).toBeTruthy();

    api.useSecurityCapabilities.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("capabilities offline"),
    });
    rerender(<AgentSecurityModesPanel />);

    expect(screen.getByText(/Failed to load \/api\/security\/capabilities/)).toBeInTheDocument();
    expect(screen.getByText(/capabilities offline/)).toBeInTheDocument();
  });

  it("renders policy metrics, empty agent state, and per-agent security modes", () => {
    api.useSecurityCapabilities.mockReturnValue({
      data: {
        summary: {
          totalAgents: 3,
          strictAgents: 1,
          standardAgents: 1,
          permissiveAgents: 1,
          agentsWithSecurityCapabilities: 2,
          metrics: {
            totalAgents: envelope(3),
            strictAgents: envelope(1),
            standardAgents: envelope(1),
            permissiveAgents: envelope(1),
            agentsWithSecurityCapabilities: envelope(2),
          },
        },
        policies: {
          defaultMode: "standard",
          dispatchPolicy: "enforced",
          a2aPolicy: "enforced",
          memoryWritePolicy: "enforced",
          metric: envelope(1),
        },
        agents: [
          {
            id: "strict-agent",
            name: "Strict Agent",
            role: "Worker",
            protocol: "rest",
            securityMode: "strict",
            readinessScore: 95,
            liveness: { state: "live" },
          },
          {
            id: "permissive-agent",
            name: "Permissive Agent",
            role: "Worker",
            protocol: "a2a",
            securityMode: "permissive",
            readinessScore: 50,
            liveness: null,
          },
          {
            id: "standard-agent",
            name: "Standard Agent",
            role: "Worker",
            protocol: "rest",
            securityMode: "standard",
            readinessScore: 70,
            liveness: { state: "stale" },
          },
        ],
        timestamp: "2026-07-18T10:00:00.000Z",
      },
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<AgentSecurityModesPanel />);

    expect(screen.getByText("default standard")).toBeInTheDocument();
    expect(document.querySelector('[data-summary-card="strict-agents"]')?.getAttribute("data-metric-status")).toBe("live");
    expect(document.querySelector('[data-summary-card="security-caps"]')?.getAttribute("data-metric-status")).toBe("live");
    expect(document.querySelector('[data-agent-id="strict-agent"]')?.getAttribute("data-agent-liveness")).toBe("live");
    expect(document.querySelector('[data-agent-id="permissive-agent"]')?.getAttribute("data-agent-liveness")).toBe("unknown");
    expect(screen.getByText("strict")).toBeInTheDocument();
    expect(screen.getByText("permissive")).toBeInTheDocument();
    expect(screen.getAllByText("standard").length).toBeGreaterThan(0);
  });

  it("renders an explicit empty state without agent rows", () => {
    api.useSecurityCapabilities.mockReturnValue({
      data: {
        summary: {
          totalAgents: 0,
          strictAgents: 0,
          standardAgents: 0,
          permissiveAgents: 0,
          agentsWithSecurityCapabilities: 0,
          metrics: {
            totalAgents: envelope(0, "zero"),
            strictAgents: envelope(0, "zero"),
            agentsWithSecurityCapabilities: envelope(0, "zero"),
          },
        },
        policies: {
          dispatchPolicy: "enforced",
          a2aPolicy: "enforced",
          memoryWritePolicy: "enforced",
        },
        agents: [],
        timestamp: "2026-07-18T10:00:00.000Z",
      },
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<AgentSecurityModesPanel />);

    expect(screen.getByText("No registered agents yet.")).toBeInTheDocument();
    expect(document.querySelector("[data-empty-agents]")).toBeTruthy();
  });
});

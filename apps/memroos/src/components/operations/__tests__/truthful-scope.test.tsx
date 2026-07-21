import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AgentWorkload } from "../agent-workload";
import { Savings, Waste } from "../savings-waste";
import { ModelUtility } from "../model-utility";

const api = vi.hoisted(() => ({
  useAgents: vi.fn(),
  useHiveFeed: vi.fn(),
  useAgentPeers: vi.fn(),
  useDelegations: vi.fn(),
  useSkills: vi.fn(),
  useModelUsage: vi.fn(),
  useModelRoutingDashboard: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
  useAgents: api.useAgents,
  useHiveFeed: api.useHiveFeed,
  useAgentPeers: api.useAgentPeers,
  useDelegations: api.useDelegations,
  useSkills: api.useSkills,
  useModelUsage: api.useModelUsage,
  useModelRoutingDashboard: api.useModelRoutingDashboard,
}));

function emptyHiveAndDelegationsMocks() {
  api.useHiveFeed.mockReturnValue({ data: { actions: [] }, isError: false });
  api.useDelegations.mockReturnValue({ data: { delegations: [] }, isError: false });
  api.useAgentPeers.mockReturnValue({
    data: { peers: [], window_minutes: 1440, timestamp: "2026-07-13T12:00:00Z" },
    isError: false,
  });
  api.useAgents.mockReturnValue({ data: { agents: [] }, isError: false });
  api.useSkills.mockReturnValue({
    data: { totalSkills: 0, coverageGaps: [], skillBudget: { duplicateSkills: [] } },
    isError: false,
  });
  api.useModelRoutingDashboard.mockReturnValue({ data: { events: [] }, isLoading: false, isError: false });
}

describe("Operations NOC truthful scope and source disclosure", () => {
  describe("AgentWorkload", () => {

    it("discloses fixed 1440-minute rollup scope and source even when empty", () => {
      emptyHiveAndDelegationsMocks();
      const { container } = render(<AgentWorkload />);

      expect(container.textContent ?? "").toMatch(/last 24 hours/i);
      expect(screen.getAllByText(/cumulative/i)[0]).toBeInTheDocument();
      expect(screen.getAllByText(/1440-minute/i)[0]).toBeInTheDocument();
      expect(screen.getByText(/healthy \/api\/hive/i)).toBeInTheDocument();
    });
    it("discloses the error state when hive fails", () => {
      emptyHiveAndDelegationsMocks();
      api.useHiveFeed.mockReturnValue({ data: undefined, isError: true });
      render(<AgentWorkload />);

      expect(screen.getByText(/Failed to load \/api\/hive/i)).toBeInTheDocument();
    });
  });

  describe("Savings", () => {
    it("explicitly renders savings as blocked with reason rather than a fabricated zero", () => {
      emptyHiveAndDelegationsMocks();
      api.useModelUsage.mockReturnValue({
        data: { usage: { models: [], total: { inputTokens: 0, outputTokens: 0, cacheRead: 0, requests: 0 } } },
        isLoading: false,
        isError: false,
      });
      const { container } = render(<Savings />);
      expect(container.querySelector('[data-status-block="savings-blocked"]')).toBeInTheDocument();
      expect(screen.getAllByText(/baseline/i)[0]).toBeInTheDocument();
      expect(screen.getAllByText(/unavailable/i)[0]).toBeInTheDocument();
      expect(screen.getByText(/explicit non-live state/i)).toBeInTheDocument();
    });
  });

  describe("Waste", () => {
    it("renders empty state without inventing metrics", () => {
      emptyHiveAndDelegationsMocks();
      render(<Waste />);
      expect(screen.getAllByText(/0/).length).toBeGreaterThan(0);
      expect(screen.getByText(/Waste metrics are live counts/i)).toBeInTheDocument();
    });


    it("discloses source-failure states instead of fabricating metrics", () => {
      emptyHiveAndDelegationsMocks();
      api.useHiveFeed.mockReturnValue({ data: undefined, isError: true });
      const { container } = render(<Waste />);
      // The Retries row must render "—" instead of a fabricated numeric zero.
      const retriesRow = container.querySelector('[data-waste-row="Retries"]');
      expect(retriesRow).toBeTruthy();
      expect(retriesRow?.getAttribute("data-waste-state")).toBe("error");
      // The hive source failure message must be disclosed somewhere on the panel.
      expect(container.textContent ?? "").toMatch(/Failed to load \/api\/hive/i);
      // The errored row must NEVER render a numeric "0" placeholder for retries.
      expect(retriesRow?.textContent ?? "").not.toMatch(/^\s*0\s*$/);
    });  });

  describe("ModelUtility", () => {
    it("discloses selection scope and source for healthy empty models", () => {
      emptyHiveAndDelegationsMocks();
      api.useModelUsage.mockReturnValue({
        data: { usage: { models: [], total: { inputTokens: 0, outputTokens: 0, cacheRead: 0, requests: 0 } } },
        isLoading: false,
        isError: false,
      });

      render(<ModelUtility filters={{ window: "24h", workspace: "all" }} />);

      expect(screen.getAllByText(/window=24h/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/last 24 hours/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/No model utility history yet/i)).toBeInTheDocument();
    });

    it("discloses source failure rather than fabricating model totals", () => {
      emptyHiveAndDelegationsMocks();
      api.useModelRoutingDashboard.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error("HTTP 500"),
      });

      render(<ModelUtility filters={{ window: "7d", workspace: "local" }} />);
      expect(screen.getByText(/Model utility is stale or unavailable/i)).toBeInTheDocument();
    });
  });
});

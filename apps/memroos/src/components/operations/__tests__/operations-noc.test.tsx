import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OperationsNoc } from "../index";

const api = vi.hoisted(() => ({
  useMemoryStats: vi.fn(() => ({
    data: { lastRun: null, pendingUnconsolidated: 0, tierStats: [], sources: [], recentFailures24h: 0, timestamp: "2026-05-21T12:00:00Z" },
    isError: false,
  })),
  useTimeSeries: vi.fn((metric: string, window: string) => ({
    data: { points: [], metric, window, timestamp: "2026-05-21T12:00:00Z" },
    isError: false,
  })),
  useModelUsage: vi.fn(() => ({
    data: {
      usage: {
        models: [],
        total: { inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheCreation: 0, requests: 0 },
      },
      timestamp: "2026-05-21T12:00:00Z",
    },
    isLoading: false,
    isError: false,
  })),
  useOperationsNoc: vi.fn(() => ({
    data: {
      panels: {
        efficiency: {
          status: "empty",
          source: "efficiency_events",
          lastUpdated: null,
          warnings: ["No efficiency telemetry events in the selected window"],
        },
      },
      metrics: {
        efficiency: {
          totalEvents: 0,
          retrievalEvents: 0,
          retrievalUsedInFirstResponse: 0,
          retrievalBeforeWorkRate: null,
          sourceReadEvents: 0,
          repeatedSourceReads: 0,
          tokenLedgerEvents: 0,
          rawContextTokens: 0,
          cachedTokens: 0,
          totalTokens: 0,
          rawContextTokenShare: null,
          operatorQuestions: 0,
          operatorReasks: 0,
          operatorReaskRate: null,
          memoryWrites: 0,
          rediscoveredWrites: 0,
          rediscoveredFactRate: null,
          streams: {
            retrieval_trace: 0,
            source_read: 0,
            token_ledger: 0,
            operator_question: 0,
            memory_write: 0,
          },
          lastUpdated: null,
        },
      },
    },
    isLoading: false,
    isError: false,
  })),
}));

vi.mock("@/lib/api-client", () => ({
  useHiveFeed: () => ({ data: { actions: [] }, isError: false }),
  useDelegations: () => ({ data: { delegations: [] }, isError: false }),
  useMemoryStats: api.useMemoryStats,
  useMemoryTierHealth: () => ({ data: { tiers: [], timestamp: "2026-05-21T12:00:00Z" }, isError: false }),
  useModelUsage: api.useModelUsage,
  useOperationsNoc: api.useOperationsNoc,
  useTimeSeries: api.useTimeSeries,
  useAgentPeers: () => ({ data: { peers: [], window_minutes: 1440, timestamp: "2026-05-21T12:00:00Z" }, isError: false }),
  useAgents: () => ({ data: { agents: [] }, isError: false }),
  useSealProposals: () => ({ data: { proposals: [], timestamp: "2026-05-21T12:00:00Z" }, isError: false }),
  useSecurityReport: () => ({ data: { summary: { highSeverity: 0, blockedAttempts: 0, securityEvents: 0 } }, isError: false }),
  useEscalations: () => ({ data: { escalations: [], timestamp: "2026-05-21T12:00:00Z" }, isError: false }),
  useSkills: () => ({
    data: {
      totalSkills: 0,
      coverageGaps: [],
      skillBudget: { duplicateSkills: [] },
      skillDetails: [],
    },
    isError: false,
  }),
  useModelRoutingDashboard: () => ({ data: { events: [], timestamp: "2026-05-21T12:00:00Z" }, isError: false }),
  useAuditLog: () => ({ data: { entries: [], timestamp: "2026-05-21T12:00:00Z" }, isError: false }),
  useOrchestrationHil: () => ({ data: { decisions: [], timestamp: "2026-05-21T12:00:00Z" }, isError: false }),
}));

describe("OperationsNoc", () => {
  beforeEach(() => {
    api.useMemoryStats.mockClear();
    api.useTimeSeries.mockClear();
    api.useModelUsage.mockClear();
    api.useOperationsNoc.mockClear();
  });

  it("labels live telemetry honestly without sample-backed claims", () => {
    render(<OperationsNoc />);

    expect(screen.getByText(/operations . live telemetry/i)).toBeInTheDocument();
    expect(screen.getByText(/explicit gaps shown/i)).toBeInTheDocument();
    expect(screen.getByText(/missing streams render explicit gaps/i)).toBeInTheDocument();
    expect(screen.queryByText(/sample-backed panels/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/refreshed 14s ago/i)).not.toBeInTheDocument();
  });

  it("keeps Engage out of the NOC home surface", () => {
    render(<OperationsNoc />);

    expect(screen.queryByText(/^Engage$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/chat, voice, or push a directive/i)).not.toBeInTheDocument();
  });

  it("applies the date range filter to live-backed NOC panels", async () => {
    render(<OperationsNoc />);

    fireEvent.change(screen.getByLabelText(/noc date range/i), { target: { value: "30d" } });

    expect(await screen.findByText(/memory activity . last 30 days/i)).toBeInTheDocument();
    expect(await screen.findByText(/model tokens . 30d/i)).toBeInTheDocument();
    expect(api.useTimeSeries).toHaveBeenCalledWith("memory_writes", "month");
    expect(api.useTimeSeries).toHaveBeenCalledWith("recall_queries", "month");
    expect(api.useMemoryStats).toHaveBeenCalledWith({ window: "month", workspace: "all" });
    expect(api.useModelUsage).toHaveBeenCalledWith(expect.stringMatching(/T.*Z$/));
    expect(api.useOperationsNoc).toHaveBeenCalledWith({ window: "30d", workspace: "all" });
  });

  it("applies the workspace filter to memory-backed NOC panels", () => {
    render(<OperationsNoc />);

    fireEvent.change(screen.getByLabelText(/noc workspace/i), { target: { value: "local" } });

    expect(api.useMemoryStats).toHaveBeenCalledWith({ window: "day", workspace: "local" });
    expect(api.useOperationsNoc).toHaveBeenCalledWith({ window: "24h", workspace: "local" });
  });
});

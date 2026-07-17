import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const apiMock = vi.hoisted(() => ({
  useTokenStats: vi.fn(),
  useModelUsage: vi.fn(),
  useTimeSeries: vi.fn(),
  useModelRoutingDashboard: vi.fn(),
  useModelRoutingEvals: vi.fn(),
  useModelRoutingRecommendations: vi.fn(),
}));

vi.mock("@/lib/api-client", () => apiMock);
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("recharts", () => ({
  LineChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Bar: () => null,
  PieChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Pie: () => null,
  Cell: () => null,
}));

import LedgerPage from "@/app/ledger/page";

describe("Ledger page truthful metric rendering", () => {
  it("renders Tokens Saved as unavailable when RTK reports null savings without a baseline", () => {
    apiMock.useTokenStats.mockReturnValue({
      data: { stats: null, timestamp: "2026-05-21T00:00:00.000Z" },
      isLoading: false,
      error: new Error("RTK not available"),
    });
    apiMock.useModelUsage.mockReturnValue({
      data: { usage: { models: [], total: { inputTokens: 0, outputTokens: 0, cacheRead: 0, requests: 0 } }, timestamp: "2026-05-21T00:00:00.000Z" },
      isLoading: false,
      error: null,
    });
    apiMock.useTimeSeries.mockReturnValue({
      data: { points: [], timestamp: "2026-05-21T00:00:00.000Z" },
      isLoading: false,
      error: null,
    });
    apiMock.useModelRoutingDashboard.mockReturnValue({
      data: { events: [], summary: { totalRuns: 0, successfulRuns: 0, successRate: null, averageQuality: null, averageLatencyMs: null }, timestamp: "2026-05-21T00:00:00.000Z" },
      isLoading: false,
      error: null,
    });
    apiMock.useModelRoutingRecommendations.mockReturnValue({
      data: { taskType: "engineering", strategy: "balanced", recommendations: [], timestamp: "2026-05-21T00:00:00.000Z" },
      isLoading: false,
      error: null,
    });
    apiMock.useModelRoutingEvals.mockReturnValue({
      data: { dimensions: [], referenceTasks: [], summary: null, timestamp: "2026-05-21T00:00:00.000Z" },
      isLoading: false,
      error: null,
    });

    render(<LedgerPage />);

    // Each KPI card must show its status badge (data-ledger-kpi-badge).
    const badges = document.querySelectorAll('[data-ledger-kpi-badge]');
    expect(badges.length).toBeGreaterThanOrEqual(4);
    // RTK unavailable → Tokens Processed comes from model-usage (empty/no data),
    // while RTK-only savings/commands stay unavailable — never hard error badges.
    expect(document.querySelectorAll('[data-ledger-kpi-badge="error"]').length).toBe(0);
    expect(document.querySelectorAll('[data-ledger-kpi-badge="unavailable"]').length).toBeGreaterThan(0);
  });

  it("renders date-range filter and propagates since to model-usage scope label", () => {
    apiMock.useTokenStats.mockReturnValue({
      data: { stats: {}, timestamp: "2026-05-21T00:00:00.000Z" },
      isLoading: false,
      error: null,
    });
    apiMock.useModelUsage.mockReturnValue({
      data: { usage: { models: [], total: { inputTokens: 0, outputTokens: 0, cacheRead: 0, requests: 0 } }, timestamp: "2026-05-21T00:00:00.000Z" },
      isLoading: false,
      error: null,
    });
    apiMock.useTimeSeries.mockReturnValue({
      data: { points: [], timestamp: "2026-05-21T00:00:00.000Z" },
      isLoading: false,
      error: null,
    });
    apiMock.useModelRoutingDashboard.mockReturnValue({
      data: { events: [], summary: { totalRuns: 0, successfulRuns: 0, successRate: null, averageQuality: null, averageLatencyMs: null }, timestamp: "2026-05-21T00:00:00.000Z" },
      isLoading: false,
      error: null,
    });
    apiMock.useModelRoutingRecommendations.mockReturnValue({
      data: { taskType: "engineering", strategy: "balanced", recommendations: [], timestamp: "2026-05-21T00:00:00.000Z" },
      isLoading: false,
      error: null,
    });
    apiMock.useModelRoutingEvals.mockReturnValue({
      data: { dimensions: [], referenceTasks: [], summary: null, timestamp: "2026-05-21T00:00:00.000Z" },
      isLoading: false,
      error: null,
    });

    render(<LedgerPage />);

    expect(screen.getByLabelText(/date range/i)).toBeInTheDocument();
    expect(screen.getByText(/window=7d/i)).toBeInTheDocument();
    // Each filter option is exposed so the user can pick another window.
    const select = document.querySelector("[data-ledger-filter-select]");
    expect(select).toBeTruthy();
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
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
const searchParamsMock = vi.hoisted(() => ({
  params: new URLSearchParams(),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParamsMock.params,
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

function mockLedgerApis(overrides: {
  token?: Partial<ReturnType<typeof apiMock.useTokenStats>>;
  model?: Partial<ReturnType<typeof apiMock.useModelUsage>>;
} = {}) {
  apiMock.useTokenStats.mockReturnValue({
    data: { stats: {}, timestamp: "2026-05-21T00:00:00.000Z" },
    isLoading: false,
    error: null,
    ...overrides.token,
  });
  apiMock.useModelUsage.mockReturnValue({
    data: { usage: { models: [], total: { inputTokens: 0, outputTokens: 0, cacheRead: 0, requests: 0 } }, timestamp: "2026-05-21T00:00:00.000Z" },
    isLoading: false,
    error: null,
    ...overrides.model,
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
}

describe("Ledger page truthful metric rendering", () => {
  it("renders Tokens Saved as unavailable when RTK reports null savings without a baseline", () => {
    mockLedgerApis({
      token: {
        data: { stats: null, timestamp: "2026-05-21T00:00:00.000Z" },
        error: new Error("RTK not available"),
      },
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
    mockLedgerApis();
    render(<LedgerPage />);

    expect(screen.getByLabelText(/date range/i)).toBeInTheDocument();
    expect(screen.getByText(/window=7d/i)).toBeInTheDocument();
    const select = document.querySelector("[data-ledger-filter-select]");
    expect(select).toBeTruthy();
  });

  it("renders live KPI badges and switches tabs and date windows", () => {
    mockLedgerApis({
      token: {
        data: {
          stats: {
            totalInput: 1200,
            totalOutput: 800,
            tokensSaved: 250,
            savingsPercent: 12.5,
            totalCommands: 42,
            avgExecutionTime: 1.8,
            commandBreakdown: [
              { command: "rtk run", count: 10, tokensSaved: 100, savingsPercent: 10 },
            ],
          },
          timestamp: "2026-05-21T00:00:00.000Z",
        },
      },
      model: {
        data: {
          usage: {
            models: [{ name: "claude-sonnet", totalTokens: 5000 }],
            total: { inputTokens: 3000, outputTokens: 2000, cacheRead: 0, requests: 10 },
          },
          timestamp: "2026-05-21T00:00:00.000Z",
        },
      },
    });

    render(<LedgerPage />);

    expect(document.querySelectorAll('[data-ledger-kpi-badge="live"]').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Model Mix" }));
    expect(screen.getByText(/Aggregated from Claude Code session logs/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/date range/i), { target: { value: "30" } });
    expect(document.querySelector("[data-ledger-filter-scope]")?.textContent).toContain("window=30d");
  });

  it("shows loading badges and NOC drilldown context from search params", () => {
    searchParamsMock.params = new URLSearchParams({
      from_window: "24h",
      from_workspace: "ops",
      from_scope_note: "Originating scope is informational only.",
    });
    mockLedgerApis({
      token: { isLoading: true, data: undefined },
      model: { isLoading: true, data: undefined },
    });

    render(<LedgerPage />);

    expect(screen.getByText(/Drilldown from Operations NOC/i)).toBeInTheDocument();
    expect(screen.getByText(/Originating scope is informational only/i)).toBeInTheDocument();
    expect(document.querySelectorAll('[data-ledger-kpi-badge="blocked"]').length).toBeGreaterThan(0);
    expect(screen.getByText(/Loading RTK token stats/i)).toBeInTheDocument();

    searchParamsMock.params = new URLSearchParams();
  });
});

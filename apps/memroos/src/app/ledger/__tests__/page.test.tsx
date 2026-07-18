import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = vi.hoisted(() => ({
  useTokenStats: vi.fn(),
  useModelUsage: vi.fn(),
}));

const searchParamsMock = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParamsMock,
}));

vi.mock("@/lib/api-client", () => apiMock);

vi.mock("@/components/ledger/savings-chart", () => ({
  SavingsChart: ({ data, envelope }: { data: unknown[]; envelope: { status: string } }) => (
    <div data-testid="savings-chart" data-status={envelope.status}>
      savings:{data.length}
    </div>
  ),
}));

vi.mock("@/components/ledger/model-mix-chart", () => ({
  ModelMixChart: ({ data, envelope }: { data: unknown[]; envelope: { status: string } }) => (
    <div data-testid="model-mix-chart" data-status={envelope.status}>
      models:{data.length}
    </div>
  ),
}));

vi.mock("@/components/ledger/cost-calculator", () => ({
  CostCalculator: ({ totalInput, totalOutput }: { totalInput: number; totalOutput: number }) => (
    <div data-testid="cost-calculator">
      cost:{totalInput}/{totalOutput}
    </div>
  ),
}));

vi.mock("@/components/ledger/analytics-panel", () => ({
  LedgerAnalyticsPanel: () => <div data-testid="analytics-panel">analytics</div>,
}));

vi.mock("@/components/ledger/model-routing-panel", () => ({
  ModelRoutingPanel: () => <div data-testid="model-routing-panel">routing</div>,
}));

import LedgerPage from "../page";

describe("LedgerPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParamsMock.get.mockReturnValue(null);
    apiMock.useTokenStats.mockReturnValue({
      data: {
        available: true,
        timestamp: "2026-05-21T00:00:00.000Z",
        stats: {
          tokensSaved: 1_250_000,
          totalCommands: 1200,
          avgExecutionTime: 2.5,
          savingsPercent: 12.5,
          commandBreakdown: [
            { command: "rtk plan", count: 4, tokensSaved: 1000, savingsPercent: 20 },
          ],
        },
      },
      isLoading: false,
      error: null,
    });
    apiMock.useModelUsage.mockReturnValue({
      data: {
        timestamp: "2026-05-21T00:00:00.000Z",
        usage: {
          total: { inputTokens: 2000, outputTokens: 500, cacheRead: 250, requests: 3 },
          models: [{ name: "claude-haiku", totalTokens: 2750 }],
        },
      },
      isLoading: false,
      error: null,
    });
  });

  it("renders live ledger metrics, drilldown context, and switches model mix tab", () => {
    searchParamsMock.get.mockImplementation((key: string) => {
      const values: Record<string, string> = {
        from_window: "24h",
        from_workspace: "local",
        from_scope_note: "NOC scope only.",
      };
      return values[key] ?? null;
    });

    render(<LedgerPage />);

    expect(screen.getByText("Drilldown from Operations NOC")).toBeInTheDocument();
    expect(screen.getByText(/window=24h, workspace=local/)).toBeInTheDocument();
    expect(screen.getByText("2.8K")).toBeInTheDocument();
    expect(screen.getByText("1.3M")).toBeInTheDocument();
    expect(screen.getByTestId("savings-chart")).toHaveAttribute("data-status", "live");

    fireEvent.click(screen.getByRole("button", { name: "Model Mix" }));
    expect(screen.getByTestId("model-mix-chart")).toHaveAttribute("data-status", "live");

    fireEvent.change(screen.getByLabelText("Date range"), { target: { value: "30" } });
    expect(screen.getAllByText(/window=30d/).length).toBeGreaterThan(0);
  });

  it("surfaces loading, unavailable, empty, and error envelopes truthfully", () => {
    apiMock.useTokenStats.mockReturnValue({
      data: { available: false, stats: null },
      isLoading: false,
      error: null,
    });
    apiMock.useModelUsage.mockReturnValue({
      data: {
        timestamp: "2026-05-21T00:00:00.000Z",
        usage: {
          total: { inputTokens: 0, outputTokens: 0, cacheRead: 0, requests: 0 },
          models: [],
        },
      },
      isLoading: false,
      error: null,
    });

    const { rerender } = render(<LedgerPage />);
    expect(screen.getAllByText("unavailable").length).toBeGreaterThan(0);
    expect(screen.getAllByText("no data").length).toBeGreaterThan(0);

    apiMock.useTokenStats.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });
    apiMock.useModelUsage.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });
    rerender(<LedgerPage />);
    expect(screen.getByText(/Loading multi-model usage/i)).toBeInTheDocument();
    expect(screen.getAllByText("loading").length).toBeGreaterThan(0);

    apiMock.useTokenStats.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("rtk down"),
    });
    apiMock.useModelUsage.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("model usage down"),
    });
    rerender(<LedgerPage />);
    expect(screen.getByText(/Optional RTK source failed: rtk down/)).toBeInTheDocument();
    expect(screen.getAllByText("error").length).toBeGreaterThan(0);
  });
});

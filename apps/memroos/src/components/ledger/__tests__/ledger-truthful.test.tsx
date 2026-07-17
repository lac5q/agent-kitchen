import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LedgerAnalyticsPanel } from "../analytics-panel";
import { ModelRoutingPanel } from "../model-routing-panel";
import { CostCalculator } from "../cost-calculator";

const apiMock = vi.hoisted(() => ({
  useTimeSeries: vi.fn(),
  useModelRoutingDashboard: vi.fn(),
  useModelRoutingEvals: vi.fn(),
  useModelRoutingRecommendations: vi.fn(),
}));

vi.mock("@/lib/api-client", () => apiMock);

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

describe("Ledger truthful metric rendering", () => {
  describe("LedgerAnalyticsPanel", () => {
    it("renders each trend chart with a non-live envelope when the source fails", () => {
      apiMock.useTimeSeries.mockImplementation(() => ({
        data: undefined,
        isLoading: false,
        error: new Error("HTTP 500"),
      }));

      render(<LedgerAnalyticsPanel />);

      expect(screen.getAllByText(/error/i).length).toBeGreaterThan(0);
      // Source label visible per chart
      expect(screen.getAllByText(/\/api\/time-series/i).length).toBeGreaterThan(0);
    });

    it("renders empty state when sources are healthy but no points exist", () => {
      apiMock.useTimeSeries.mockImplementation(() => ({
        data: { points: [], timestamp: "2026-05-21T00:00:00.000Z" },
        isLoading: false,
        error: null,
      }));

      render(<LedgerAnalyticsPanel />);
      // Should render empty status badge for each chart
      expect(screen.getAllByText(/empty/i).length).toBeGreaterThan(0);
    });

    it("renders measured-zero envelope when source succeeds with all-zero points", () => {
      apiMock.useTimeSeries.mockImplementation(() => ({
        data: {
          points: [
            { bucket: "2026-05-19", value: 0 },
            { bucket: "2026-05-20", value: 0 },
          ],
          timestamp: "2026-05-21T00:00:00.000Z",
        },
        isLoading: false,
        error: null,
      }));

      render(<LedgerAnalyticsPanel />);
      expect(screen.getAllByText(/measured zero/i).length).toBeGreaterThan(0);
    });
  });

  describe("ModelRoutingPanel", () => {
    it("renders routing quality as N/A when summary has no scored runs", () => {
      apiMock.useModelRoutingDashboard.mockReturnValue({
        data: {
          events: [],
          summary: { totalRuns: 4, successfulRuns: 4, successRate: 1, averageQuality: null, averageLatencyMs: 120 },
          timestamp: "2026-05-21T00:00:00.000Z",
        },
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

      render(<ModelRoutingPanel />);

      // The Quality metric card must show unavailable, never zero.
      const qualityCard = document.querySelector('[data-routing-metric="Quality"]');
      expect(qualityCard).toBeTruthy();
      expect(qualityCard?.getAttribute("data-routing-metric-status")).toBe("unavailable");
    });

    it("renders source failure for routing metrics when API fails", () => {
      apiMock.useModelRoutingDashboard.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error("/api/model-routing/telemetry 500"),
      });
      apiMock.useModelRoutingRecommendations.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error("/api/model-routing/recommendations 500"),
      });
      apiMock.useModelRoutingEvals.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error("/api/model-routing/evals 500"),
      });

      render(<ModelRoutingPanel />);

      expect(screen.getAllByText(/error/i).length).toBeGreaterThan(0);
      expect(document.querySelectorAll('[data-routing-metric-status="error"]').length).toBeGreaterThan(0);
    });

    it("renders live routing metrics, recommendations, and eval dimensions", () => {
      apiMock.useModelRoutingDashboard.mockReturnValue({
        data: {
          events: [],
          summary: {
            totalRuns: 12,
            successfulRuns: 10,
            successRate: 0.83,
            averageQuality: 0.91,
            averageLatencyMs: 240,
          },
          timestamp: "2026-05-21T00:00:00.000Z",
        },
        isLoading: false,
        error: null,
      });
      apiMock.useModelRoutingRecommendations.mockReturnValue({
        data: {
          taskType: "engineering",
          strategy: "balanced",
          recommendations: [
            {
              provider: "anthropic",
              model: "claude-sonnet-4-6",
              score: 0.88,
              label: "balanced pick",
              observations: 4,
              averageQuality: 0.9,
            },
          ],
          timestamp: "2026-05-21T00:00:00.000Z",
        },
        isLoading: false,
        error: null,
      });
      apiMock.useModelRoutingEvals.mockReturnValue({
        data: {
          dimensions: [{ id: "latency", label: "Latency", rubric: "Lower is better" }],
          referenceTasks: [],
          summary: null,
          timestamp: "2026-05-21T00:00:00.000Z",
        },
        isLoading: false,
        error: null,
      });

      render(<ModelRoutingPanel />);

      expect(screen.getByText("12")).toBeInTheDocument();
      expect(screen.getByText("83%")).toBeInTheDocument();
      expect(screen.getByText("0.91")).toBeInTheDocument();
      expect(screen.getByText("240ms")).toBeInTheDocument();
      expect(screen.getByText("claude-sonnet-4-6")).toBeInTheDocument();
      expect(screen.getAllByText("Latency").length).toBeGreaterThan(0);
      expect(screen.getByText("Lower is better")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "sales" }));
      fireEvent.click(screen.getByRole("button", { name: "latency" }));
      expect(document.querySelector('[data-routing-scope="taskType=sales,strategy=latency"]')).toBeTruthy();
    });

    it("shows loading and empty recommendation states", () => {
      apiMock.useModelRoutingDashboard.mockReturnValue({
        data: undefined,
        isLoading: true,
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

      render(<ModelRoutingPanel />);

      expect(screen.getAllByText("loading").length).toBeGreaterThan(0);
      expect(screen.getByText(/No recommendations available/i)).toBeInTheDocument();
      expect(screen.getByText(/No eval dimensions configured/i)).toBeInTheDocument();
    });
  });

  describe("CostCalculator", () => {
    it("renders RTK Savings as unavailable when envelope is not live/zero", () => {
      render(
        <CostCalculator
          totalInput={100}
          totalOutput={50}
          tokensSaved={0}
          savingsEnvelope={{
            value: null,
            status: "unavailable",
            source: "/api/tokens",
            observedAt: null,
            freshnessMs: null,
            scope: { window: "cumulative", workspace: "all" },
            reason: "Savings baseline is explicitly unavailable until a retained-memory baseline exists",
          }}
        />
      );

      const savingsCard = document.querySelector('[data-cost-savings-card]');
      expect(savingsCard).toBeTruthy();
      expect(savingsCard?.getAttribute("data-cost-savings-status")).toBe("unavailable");
      // Should NOT render a measured-zero dollar value when envelope is unavailable.
      expect(savingsCard?.querySelector('[data-cost-savings-value]')).toBeNull();
    });

    it("renders RTK Savings as $0.00 when envelope proves a measured zero", () => {
      render(
        <CostCalculator
          totalInput={100}
          totalOutput={50}
          tokensSaved={0}
          savingsEnvelope={{
            value: 0,
            status: "zero",
            source: "/api/tokens",
            observedAt: "2026-05-21T00:00:00.000Z",
            freshnessMs: 1000,
            scope: { window: "cumulative", workspace: "all" },
            reason: "Successful /api/tokens measured exactly zero cumulative savings",
          }}
        />
      );

      const savingsCard = document.querySelector('[data-cost-savings-card]');
      expect(savingsCard).toBeTruthy();
      expect(savingsCard?.getAttribute("data-cost-savings-status")).toBe("zero");
      const valueEl = savingsCard?.querySelector('[data-cost-savings-value]');
      expect(valueEl).toBeTruthy();
      expect(valueEl?.textContent).toContain("$0.00");
    });
  });
});
